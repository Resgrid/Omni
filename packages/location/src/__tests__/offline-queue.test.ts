// Location fixes are coalesced outbox writes (plan §8.3/§8.5): queued while offline, newest-wins per target, replayed
// once with the event id as idempotency key, refusals dead-lettered and backed off, and they survive an app kill.
// Runs the real @resgrid/offline outbox on its in-memory database.
import type { DurableDb, ManualConnectivitySource, Outbox } from '@resgrid/offline';
import { createOutbox } from '@resgrid/offline';
import { createManualConnectivitySource, createMemoryDb, createOutboxHandlerRegistry } from '@resgrid/offline/testing';

import { configureLocation, getLocationTransmitter, resetLocationForTests } from '../configure';
import { getLocationTransmissionStatus } from '../location-store';
import { registerLocationOutboxHandlers } from '../outbox-handlers';
import { resetLocationTaskRuntimeForTests } from '../task-runtime';
import { __emitWatcherFix, __resetLocation, makeLocation } from './fakes/expo-location';
import { __resetTaskManager } from './fakes/expo-task-manager';
import { __resetReactNative, AppState } from './fakes/react-native';
import { axiosHttpError, axiosNetworkError, createFakeApi, type FakeApi, FAR, fixAt, flushPromises, MOVED, ORIGIN } from './helpers';

const scope = { server: 'https://api.test/api/v4', departmentId: 1, userId: 'user-1', unitId: 42 };

let db: DurableDb;
let connectivity: ManualConnectivitySource;
let registry: ReturnType<typeof createOutboxHandlerRegistry>;
let outbox: Outbox;
let api: FakeApi;
let signedIn: boolean;
let now: number;

const buildOutbox = async (): Promise<Outbox> => {
  const instance = createOutbox({ db, getScope: () => (signedIn ? scope : null), registry, connectivity, now: () => now });
  await instance.init();
  return instance;
};

const configureUnit = () =>
  configureLocation({
    capability: { background: true, transmission: 'unit', geoHubDefault: true },
    getApiContext: () => api.ctx,
    handlerRegistry: registry,
    getOutbox: () => outbox,
    isSignedIn: () => signedIn,
    getSession: () => (signedIn ? { userId: 'user-1' } : null),
    getActiveUnitId: () => 42,
    getSettings: () => ({ realtimeGeolocation: true, backgroundGeolocation: true }),
    autoStart: false,
    now: () => now,
  });

const emit = async (position: { latitude: number; longitude: number }): Promise<void> => {
  __emitWatcherFix(makeLocation(position, now));
  await flushPromises();
};

const sentBodies = (): Record<string, unknown>[] => api.request.mock.calls.map((call) => (call[0] as { data: Record<string, unknown> }).data);

beforeEach(async () => {
  __resetReactNative();
  __resetLocation();
  __resetTaskManager();
  resetLocationTaskRuntimeForTests();
  resetLocationForTests();
  db = await createMemoryDb();
  connectivity = createManualConnectivitySource(true);
  registry = createOutboxHandlerRegistry();
  api = createFakeApi();
  signedIn = true;
  now = Date.UTC(2026, 9, 31, 12, 0, 0);
  outbox = await buildOutbox();
});

afterEach(() => resetLocationForTests());

describe('offline queueing of location fixes', () => {
  it('keeps fixes queued without network, newest wins, and replays the newest once with its id as idempotency key', async () => {
    connectivity.setOnline(false);
    const transmitter = configureUnit();
    await transmitter.start();

    await emit(ORIGIN);
    now += 15_000;
    await emit(MOVED);
    now += 15_000;
    await emit(FAR);

    expect((await outbox.drain()).status).toBe('skipped-offline');
    expect(api.request).not.toHaveBeenCalled();
    const snapshot = await outbox.refresh();
    expect(snapshot.counts).toMatchObject({ pending: 1, unsent: 1 });
    const [item] = snapshot.items;
    expect(item).toMatchObject({ type: 'location.unit', coalesceKey: 'location.unit:42' });
    expect(getLocationTransmissionStatus().awaitingDelivery).toBe(true);

    connectivity.setOnline(true);
    const result = await outbox.drain();

    expect(result.sent).toEqual([item.id]);
    expect(sentBodies()).toEqual([expect.objectContaining({ UnitId: '42', Latitude: String(FAR.latitude), IdempotencyKey: item.id })]);
    expect((await outbox.refresh()).counts.total).toBe(0);
    expect(getLocationTransmissionStatus()).toMatchObject({ awaitingDelivery: false, lastDeliveredAt: now });
  });

  it('leaves a fix lost to the network queued, and a newer fix replaces it', async () => {
    api.request.mockRejectedValueOnce(axiosNetworkError());
    const transmitter = configureUnit();
    await transmitter.start();
    await emit(ORIGIN);

    const first = await outbox.drain();
    expect(first.status).toBe('stopped-network');
    expect((await outbox.refresh()).counts.unsent).toBe(1);

    now += 15_000;
    await emit(MOVED);
    const snapshot = await outbox.refresh();
    expect(snapshot.counts.unsent).toBe(1);

    now += 60 * 60_000; // past any network backoff
    await outbox.drain();
    expect(sentBodies().map((body) => body.Latitude)).toEqual([String(ORIGIN.latitude), String(MOVED.latitude)]);
  });

  it('dead-letters a refused fix, backs the target off, and the next fix replaces the dead item', async () => {
    api.request.mockRejectedValueOnce(axiosHttpError(400));
    const transmitter = configureUnit();
    await transmitter.start();
    await emit(ORIGIN);

    const result = await outbox.drain();
    expect(result.dead).toHaveLength(1);
    expect(getLocationTransmissionStatus()).toMatchObject({ lastRejectedAt: now, backoffUntil: now + 30_000 });

    now += 15_000;
    await emit(MOVED); // inside the backoff: not queued
    expect((await outbox.refresh()).counts).toMatchObject({ dead: 1, unsent: 0 });

    now += 20_000;
    await emit(FAR);
    const snapshot = await outbox.refresh();
    expect(snapshot.counts).toMatchObject({ dead: 0, pending: 1 });
    await outbox.drain();
    expect(getLocationTransmissionStatus().backoffUntil).toBeNull();
  });

  it('survives an app kill: a fix queued by a background task run is delivered after relaunch', async () => {
    connectivity.setOnline(false);
    AppState.currentState = 'background';
    const transmitter = configureUnit();
    await transmitter.handleTaskLocations([fixAt(ORIGIN, now - 5_000), fixAt(MOVED, now)], { appState: 'background' });
    expect((await outbox.refresh()).counts.pending).toBe(1);

    // Kill: drop the transmitter, handlers and outbox; keep the database.
    resetLocationForTests();
    connectivity.setOnline(true);
    registry = createOutboxHandlerRegistry();
    outbox = await buildOutbox();
    expect((await outbox.drain()).waiting).toBe(1); // no handler registered yet → waits, nothing lost

    registerLocationOutboxHandlers({ getApiContext: () => api.ctx, registry, targets: ['unit'] });
    const result = await outbox.drain();
    expect(result.sent).toHaveLength(1);
    expect(sentBodies()[0]).toMatchObject({ UnitId: '42', Latitude: String(MOVED.latitude) });
  });

  it('never replays a fix as another user, and queues nothing once signed out', async () => {
    connectivity.setOnline(false);
    const transmitter = configureUnit();
    await transmitter.start();
    await emit(ORIGIN);

    signedIn = false;
    await transmitter.stop();
    await emit(MOVED);
    expect(await outbox.countUnsent(scope)).toBe(1); // still held for user-1's session, not dropped, not re-attributed

    connectivity.setOnline(true);
    expect((await outbox.drain()).status).toBe('skipped-signed-out');
    expect(api.request).not.toHaveBeenCalled();
    expect(getLocationTransmitter()?.isTracking()).toBe(false);
  });
});
