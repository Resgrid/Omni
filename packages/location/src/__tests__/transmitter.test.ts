// The merged transmitter: Responder location/location-task tests + Unit location tests (gate, keep-alive, task batches,
// re-registration, backoff, resume, web path) + IC's foreground-only behaviour, adapted to outbox-queued fixes.
import type { EnqueueInput } from '@resgrid/offline';

import { LOCATION_TASK_NAME } from '../constants';
import { LOCATION_I18N_FALLBACKS } from '../i18n-keys';
import { getCurrentLocation, getLocationTransmissionStatus, resetLocationStores } from '../location-store';
import type { LocationEvent } from '../outbox-handlers';
import { buildTaskOptions } from '../task-options';
import { resetLocationTaskRuntimeForTests } from '../task-runtime';
import { type LocationCapability, LocationTransmitter, type LocationTransmitterOptions } from '../transmitter';
import type { LocationServerConfig, PersonLocationPayload, UnitLocationPayload } from '../types';
import {
  __activeWatchers,
  __emitWatcherFix,
  __resetLocation,
  __setBackground,
  __setBackgroundAnswer,
  __setForeground,
  __setForegroundAnswer,
  getLastKnownPositionAsync,
  makeLocation,
  requestBackgroundPermissionsAsync,
  requestForegroundPermissionsAsync,
  startLocationUpdatesAsync,
  stopLocationUpdatesAsync,
  watchPositionAsync,
} from './fakes/expo-location';
import { __isRegistered, __registerTask, __resetTaskManager, defineTask } from './fakes/expo-task-manager';
import { __appStateListenerCount, __resetReactNative, __setAppState, AppState, Platform } from './fakes/react-native';
import { createRecordingOutbox, createSettings, FAR, fixAt, flushPromises, JITTER, MOVED, type MutableSettings, ORIGIN, type RecordingOutbox } from './helpers';

const T0 = Date.UTC(2026, 9, 31, 12, 0, 0);
const HEARTBEAT_MS = 5 * 60_000;

const capabilities: Record<'person' | 'unit' | 'none', LocationCapability> = {
  person: { background: true, transmission: 'person', geoHubDefault: false },
  unit: { background: true, transmission: 'unit', geoHubDefault: true },
  none: { background: false, transmission: 'none', geoHubDefault: true },
};

let outbox: RecordingOutbox;
let settings: MutableSettings;
let signedIn: boolean;
let unitId: string | null;
let serverConfig: LocationServerConfig | null;
let sessionListeners: Set<() => void>;
let transmitter: LocationTransmitter | null;

const create = (target: 'person' | 'unit' | 'none', overrides: Partial<LocationTransmitterOptions> = {}): LocationTransmitter => {
  transmitter = new LocationTransmitter({
    capability: capabilities[target],
    getOutbox: () => outbox,
    isSignedIn: () => signedIn,
    getSession: () => (signedIn ? { userId: 'user-1' } : null),
    getActiveUnitId: () => unitId,
    getSettings: () => ({ realtimeGeolocation: settings.realtimeGeolocation, backgroundGeolocation: settings.backgroundGeolocation }),
    getServerConfig: () => serverConfig,
    ...overrides,
  });
  transmitter.attach();
  return transmitter;
};

const queued = (): EnqueueInput[] => outbox.enqueued;
const lastPayload = <P>(): P => queued()[queued().length - 1].payload as P;
const emit = async (position: { latitude: number; longitude: number }, overrides: Partial<ReturnType<typeof makeLocation>['coords']> = {}): Promise<void> => {
  __emitWatcherFix(makeLocation({ ...position, ...overrides }, Date.now()));
  await flushPromises();
};
const advance = async (ms: number): Promise<void> => {
  await jest.advanceTimersByTimeAsync(ms);
  await flushPromises();
};
const locationEvent = (type: string, payload: PersonLocationPayload | UnitLocationPayload, id: string): LocationEvent => ({
  id,
  type,
  payload,
  scope: { server: 'https://api.test', departmentId: 1, userId: 'user-1' },
  createdAt: 0,
  attempts: 1,
  state: 'dead',
  lastError: { status: 400, message: 'Bad Request' },
});

beforeEach(() => {
  jest.useFakeTimers({ now: T0, doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate'] });
  __resetReactNative();
  __resetLocation();
  __resetTaskManager();
  resetLocationTaskRuntimeForTests();
  resetLocationStores();
  defineTask(LOCATION_TASK_NAME, async () => undefined);
  outbox = createRecordingOutbox();
  settings = createSettings({ realtimeGeolocation: true, backgroundGeolocation: false });
  signedIn = true;
  unitId = '42';
  serverConfig = null;
  sessionListeners = new Set();
  transmitter = null;
});

afterEach(async () => {
  transmitter?.dispose();
  jest.useRealTimers();
});

describe('target selection', () => {
  it('queues a person fix for SetPersonLocation, coalesced per user', async () => {
    await create('person').start();
    await emit(ORIGIN);

    expect(queued()).toHaveLength(1);
    expect(queued()[0]).toMatchObject({ type: 'location.person', coalesceKey: 'location.person:user-1', coalesceAt: T0, payload: { UserId: 'user-1', Latitude: '37.7749' } });
  });

  it('queues a unit fix for SetUnitLocation, coalesced per unit', async () => {
    await create('unit').start();
    await emit(ORIGIN);

    expect(queued()[0]).toMatchObject({ type: 'location.unit', coalesceKey: 'location.unit:42', payload: { UnitId: '42' } });
  });

  it('records but never transmits a unit fix while no unit is selected', async () => {
    unitId = null;
    await create('unit').start();
    await emit(ORIGIN);

    expect(queued()).toHaveLength(0);
    expect(getCurrentLocation()).toMatchObject({ latitude: ORIGIN.latitude, source: 'watcher' });
  });

  it('transmits for a newly selected unit without waiting for the interval', async () => {
    await create('unit').start();
    await emit(ORIGIN);
    unitId = '43';
    await advance(1_000);
    await emit(ORIGIN);

    expect(queued().map((input) => (input.payload as UnitLocationPayload).UnitId)).toEqual(['42', '43']);
  });

  it('tracks locally only for target none (IC): watcher and store, no outbox, no task, no heartbeat', async () => {
    await create('none').start();
    await emit(ORIGIN);
    await advance(HEARTBEAT_MS * 2);

    expect(__activeWatchers()).toBe(1);
    expect(getCurrentLocation()).toMatchObject({ latitude: ORIGIN.latitude });
    expect(queued()).toHaveLength(0);
    expect(startLocationUpdatesAsync).not.toHaveBeenCalled();
  });
});

describe('transmission policy', () => {
  it('posts a foreground person fix with both settings off (Responder)', async () => {
    settings.set({ realtimeGeolocation: false, backgroundGeolocation: false });
    await create('person').start();
    await emit(ORIGIN);
    expect(queued()).toHaveLength(1);
  });

  it('governs a foreground unit fix by Realtime Geolocation (Unit)', async () => {
    settings.set({ realtimeGeolocation: false });
    await create('unit').start();
    await emit(ORIGIN);
    expect(queued()).toHaveLength(0);
    expect(getLocationTransmissionStatus().transmissionAllowed).toBe(false);

    settings.set({ realtimeGeolocation: true });
    await advance(20_000);
    await emit(MOVED);
    expect(queued()).toHaveLength(1);
  });

  it('transmits a background task fix on the background setting alone, and delivers it during the task run', async () => {
    settings.set({ realtimeGeolocation: false, backgroundGeolocation: true });
    const instance = create('unit');
    AppState.currentState = 'background';

    await instance.handleTaskLocations([fixAt(ORIGIN, T0 - 30_000), fixAt(MOVED, T0)], { appState: 'background' });

    expect(queued()).toHaveLength(1);
    expect(lastPayload<UnitLocationPayload>().Latitude).toBe(String(MOVED.latitude));
    expect(outbox.drain).toHaveBeenCalledTimes(1);
  });

  it('does not transmit a background task fix when Background Geolocation is off', async () => {
    settings.set({ backgroundGeolocation: false });
    const instance = create('person');
    await instance.handleTaskLocations([fixAt(ORIGIN, T0)], { appState: 'background' });
    expect(queued()).toHaveLength(0);
    expect(getCurrentLocation()).toMatchObject({ latitude: ORIGIN.latitude, source: 'task' });
  });

  it('ignores task fixes while the foreground watcher runs, and handles them when it does not (Unit)', async () => {
    settings.set({ backgroundGeolocation: true });
    const instance = create('unit');
    await instance.start();
    expect(__activeWatchers()).toBe(1);

    await instance.handleTaskLocations([fixAt(ORIGIN, T0)], { appState: 'active' });
    expect(queued()).toHaveLength(0);

    __setAppState('background');
    await instance.handleTaskLocations([fixAt(ORIGIN, T0)], { appState: 'background' });
    expect(queued()).toHaveLength(1);
  });

  it('keeps a low-accuracy fix locally but never transmits it; a fix without accuracy is fine (Responder)', async () => {
    await create('person').start();
    await emit(ORIGIN, { accuracy: 101 });
    expect(queued()).toHaveLength(0);
    expect(getCurrentLocation()?.accuracy).toBe(101);

    await emit(MOVED, { accuracy: null });
    expect(queued()).toHaveLength(1);
  });
});

describe('pacing and heartbeat', () => {
  it('holds a moving fix inside the interval and sends only the newest one when the interval ends', async () => {
    await create('unit').start();
    await emit(ORIGIN);
    await advance(4_000);
    await emit(MOVED);
    await advance(2_000);
    await emit(FAR);
    expect(queued()).toHaveLength(1);

    await advance(9_000);
    expect(queued()).toHaveLength(2);
    expect(lastPayload<UnitLocationPayload>().Latitude).toBe(String(FAR.latitude));
  });

  it('drops a held fix once a newer one shows the target back where it was transmitted', async () => {
    await create('unit').start();
    await emit(ORIGIN);
    await advance(4_000);
    await emit(MOVED);
    await advance(2_000);
    await emit(JITTER);
    await advance(20_000);
    expect(queued()).toHaveLength(1);
  });

  it('does not re-post an unmoved target until the heartbeat, then re-posts the latest fix with a fresh timestamp', async () => {
    await create('person').start();
    await emit(ORIGIN);
    await advance(60_000);
    await emit(JITTER);
    expect(queued()).toHaveLength(1);

    await advance(HEARTBEAT_MS - 60_000);
    expect(queued()).toHaveLength(2);
    expect(lastPayload<PersonLocationPayload>().Latitude).toBe(String(JITTER.latitude));
    expect(lastPayload<PersonLocationPayload>().Timestamp).toBe(new Date(T0 + HEARTBEAT_MS).toISOString());
  });

  it('restarts the countdown on every post, so a moving target gets no extra heartbeat', async () => {
    await create('person').start();
    await emit(ORIGIN);
    await advance(HEARTBEAT_MS - 10_000);
    await emit(MOVED);
    await advance(HEARTBEAT_MS - 10_000);
    expect(queued()).toHaveLength(2);
    await advance(10_000);
    expect(queued()).toHaveLength(3);
  });

  it('applies the server thresholds: min meters and a heartbeat at 80 % of the stale time', async () => {
    serverConfig = { UnitLocationMinMeters: 5, UnitLocationStaleSeconds: 120 };
    await create('unit').start();
    await emit(ORIGIN);
    await advance(15_000);
    await emit(JITTER); // 11 m is movement at a 5 m threshold
    expect(queued()).toHaveLength(2);

    await advance(96_000);
    expect(queued()).toHaveLength(3);
  });

  it('does not heartbeat in the background without Background Geolocation, and stops counting', async () => {
    await create('person').start();
    await emit(ORIGIN);
    __setAppState('background');
    await advance(HEARTBEAT_MS * 3);
    expect(queued()).toHaveLength(1);
  });

  it('heartbeats in the background under Background Geolocation', async () => {
    settings.set({ backgroundGeolocation: true });
    __setBackground('denied'); // no task: only the timer keeps the target fresh (iOS keeps timers alive)
    await create('person').start();
    await emit(ORIGIN);
    __setAppState('background');
    await advance(HEARTBEAT_MS);
    expect(queued()).toHaveLength(2);
  });

  it('keeps a parked unit fresh from background task fixes where JS timers are paused (Android)', async () => {
    settings.set({ backgroundGeolocation: true });
    const instance = create('unit');
    await instance.handleTaskLocations([fixAt(ORIGIN, T0)], { appState: 'background' });
    jest.setSystemTime(T0 + 60_000);
    await instance.handleTaskLocations([fixAt(JITTER, T0 + 60_000)], { appState: 'background' });
    expect(queued()).toHaveLength(1);
    jest.setSystemTime(T0 + HEARTBEAT_MS);
    await instance.handleTaskLocations([fixAt(JITTER, T0 + HEARTBEAT_MS)], { appState: 'background' });
    expect(queued()).toHaveLength(2);
  });

  it('heartbeats a target that never produced a fix from what the OS last knew (Unit)', async () => {
    getLastKnownPositionAsync.mockResolvedValue(makeLocation(ORIGIN, T0 - 600_000));
    await create('unit').start();
    await advance(HEARTBEAT_MS);
    expect(queued()).toHaveLength(1);
    expect(lastPayload<UnitLocationPayload>().Timestamp).toBe(new Date(T0 + HEARTBEAT_MS).toISOString());
  });

  it('reports at once on return to the foreground when the last report is overdue', async () => {
    await create('person').start();
    await emit(ORIGIN);
    __setAppState('background');
    await advance(HEARTBEAT_MS * 2);
    expect(queued()).toHaveLength(1);
    __setAppState('active');
    await advance(0);
    await flushPromises();
    expect(queued()).toHaveLength(2);
  });
});

describe('lifecycle', () => {
  it('starts on sign-in and stops on sign-out through the session subscription', async () => {
    signedIn = false;
    const subscribeSession = (listener: () => void) => {
      sessionListeners.add(listener);
      return () => sessionListeners.delete(listener);
    };
    create('person', { subscribeSession });
    await flushPromises();
    expect(__activeWatchers()).toBe(0);

    signedIn = true;
    sessionListeners.forEach((listener) => listener());
    await flushPromises();
    expect(__activeWatchers()).toBe(1);
    await emit(ORIGIN);
    await advance(4_000);
    await emit(MOVED); // held for the interval

    signedIn = false;
    sessionListeners.forEach((listener) => listener());
    await flushPromises();
    expect(__activeWatchers()).toBe(0);
    expect(getLocationTransmissionStatus()).toMatchObject({ tracking: false, mode: 'stopped' });

    await advance(HEARTBEAT_MS * 2);
    expect(queued()).toHaveLength(1); // neither the held fix nor a heartbeat went out after sign-out
  });

  it('waits for a selected unit before starting a unit target', async () => {
    unitId = null;
    const subscribeSession = (listener: () => void) => {
      sessionListeners.add(listener);
      return () => sessionListeners.delete(listener);
    };
    const instance = create('unit', { subscribeSession });
    await flushPromises();
    expect(instance.isTracking()).toBe(false);
    unitId = '42';
    sessionListeners.forEach((listener) => listener());
    await flushPromises();
    expect(instance.isTracking()).toBe(true);
  });

  it('stops the OS task and forgets pacing on stop', async () => {
    settings.set({ backgroundGeolocation: true });
    const instance = create('unit');
    await instance.start();
    expect(__isRegistered(LOCATION_TASK_NAME)).toBe(true);
    await emit(ORIGIN);

    await instance.stop();
    expect(__isRegistered(LOCATION_TASK_NAME)).toBe(false);
    expect(stopLocationUpdatesAsync).toHaveBeenCalledWith(LOCATION_TASK_NAME);

    await instance.start();
    await emit(ORIGIN); // the gate starts over: not skipped as "not moved"
    expect(queued()).toHaveLength(2);
  });

  it('creates only one watcher when starts overlap', async () => {
    const instance = create('person');
    await Promise.all([instance.start(), instance.start(), instance.refresh()]);
    expect(watchPositionAsync).toHaveBeenCalledTimes(1);
  });

  it('releases the watcher in the background and re-subscribes on return without prompting', async () => {
    await create('person').start();
    expect(__activeWatchers()).toBe(1);

    __setAppState('background');
    expect(__activeWatchers()).toBe(0);

    __setAppState('active');
    await flushPromises();
    expect(__activeWatchers()).toBe(1);
    expect(requestForegroundPermissionsAsync).not.toHaveBeenCalled();
  });

  it('discards a watcher that resolves after the app went to the background', async () => {
    let resolveWatch: (value: { remove: jest.Mock }) => void = () => undefined;
    const remove = jest.fn();
    watchPositionAsync.mockImplementationOnce(() => new Promise((resolve) => (resolveWatch = resolve)));
    const instance = create('person');
    const starting = instance.start();
    await flushPromises();
    __setAppState('background');
    resolveWatch({ remove });
    await starting;
    expect(remove).toHaveBeenCalled();
    expect(getLocationTransmissionStatus().watcherActive).toBe(false);
  });

  it('unsubscribes from app state on dispose', () => {
    const instance = create('person');
    expect(__appStateListenerCount()).toBe(1);
    instance.dispose();
    expect(__appStateListenerCount()).toBe(0);
    transmitter = null;
  });
});

describe('permissions', () => {
  it('prompts for "when in use" on start in the foreground, never for "always"', async () => {
    __setForeground('undetermined');
    __setBackground('undetermined');
    await create('unit').start();
    expect(requestForegroundPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(requestBackgroundPermissionsAsync).not.toHaveBeenCalled();
    expect(__activeWatchers()).toBe(1);
  });

  it('reports a refused permission and starts nothing', async () => {
    __setForeground('undetermined');
    __setForegroundAnswer('denied', false);
    await create('person').start();
    expect(__activeWatchers()).toBe(0);
    expect(getLocationTransmissionStatus()).toMatchObject({ mode: 'permission-denied', foregroundPermission: 'denied' });
  });

  it('does not prompt a hard-denied user again, nor on resume; a grant made in Settings is picked up on resume (Unit)', async () => {
    __setForeground('denied', false);
    await create('person').start();
    expect(requestForegroundPermissionsAsync).not.toHaveBeenCalled();

    __setAppState('background');
    __setForeground('granted');
    __setAppState('active');
    await flushPromises();
    expect(requestForegroundPermissionsAsync).not.toHaveBeenCalled();
    expect(__activeWatchers()).toBe(1);
  });

  it('runs "when in use" then "always" when the user enables background tracking, then registers the task', async () => {
    __setForeground('undetermined');
    __setBackground('undetermined');
    const instance = create('unit');
    await instance.start({ prompt: false });
    settings.set({ backgroundGeolocation: true });

    const result = await instance.requestBackgroundTracking();

    expect(result.outcome).toBe('granted');
    expect(requestForegroundPermissionsAsync.mock.invocationCallOrder[0]).toBeLessThan(requestBackgroundPermissionsAsync.mock.invocationCallOrder[0]);
    expect(__isRegistered(LOCATION_TASK_NAME)).toBe(true);
  });

  it('reports foreground-only when "always" is refused', async () => {
    __setBackground('undetermined');
    __setBackgroundAnswer('denied');
    const instance = create('person');
    await instance.start();
    expect((await instance.requestBackgroundTracking()).outcome).toBe('foreground-only');
    expect(__isRegistered(LOCATION_TASK_NAME)).toBe(false);
  });
});

describe('background task registration', () => {
  it('registers the automotive profile for a unit and keeps the watcher alongside it', async () => {
    settings.set({ backgroundGeolocation: true });
    await create('unit').start();
    expect(startLocationUpdatesAsync).toHaveBeenCalledWith(
      LOCATION_TASK_NAME,
      expect.objectContaining({ activityType: 2, timeInterval: 30_000, foregroundService: expect.objectContaining({ notificationTitle: 'Location Tracking' }) })
    );
    expect(__activeWatchers()).toBe(1);
    expect(getLocationTransmissionStatus()).toMatchObject({ backgroundTaskRegistered: true, mode: 'foreground' });
  });

  it('runs no watcher alongside the task for the personal profile (Responder)', async () => {
    settings.set({ backgroundGeolocation: true });
    await create('person').start();
    expect(startLocationUpdatesAsync).toHaveBeenCalledWith(LOCATION_TASK_NAME, expect.objectContaining({ activityType: 1 }));
    expect(__activeWatchers()).toBe(0);
    expect(getLocationTransmissionStatus().mode).toBe('background-task');
  });

  it('does not re-register a task whose stored options are current', async () => {
    settings.set({ backgroundGeolocation: true });
    __registerTask(
      LOCATION_TASK_NAME,
      buildTaskOptions('automotive', 'ios', { notificationTitle: LOCATION_I18N_FALLBACKS['location.tracking_notification_title'], notificationBody: LOCATION_I18N_FALLBACKS['location.tracking_notification_body'] })
    );
    await create('unit').start();
    expect(startLocationUpdatesAsync).not.toHaveBeenCalled();
  });

  it('re-registers when the stored options are out of date, and again when they change (refresh)', async () => {
    settings.set({ backgroundGeolocation: true });
    __registerTask(LOCATION_TASK_NAME, { ...buildTaskOptions('automotive', 'ios', { notificationTitle: 'x', notificationBody: 'y' }), timeInterval: 15_000 });
    const instance = create('unit');
    await instance.start();
    expect(startLocationUpdatesAsync).toHaveBeenCalledTimes(1);

    await instance.refresh();
    expect(startLocationUpdatesAsync).toHaveBeenCalledTimes(1);

    __registerTask(LOCATION_TASK_NAME, { stale: true });
    await instance.refresh();
    expect(startLocationUpdatesAsync).toHaveBeenCalledTimes(2);
  });

  it('re-syncs on a settings change: turning Background Geolocation off stops the task and hands back to the watcher', async () => {
    const settingsListeners = new Set<() => void>();
    settings.set({ backgroundGeolocation: true });
    await create('person', {
      subscribeSettings: (listener) => {
        settingsListeners.add(listener);
        return () => settingsListeners.delete(listener);
      },
    }).start();
    expect(__activeWatchers()).toBe(0);

    settings.set({ backgroundGeolocation: false });
    settingsListeners.forEach((listener) => listener());
    await flushPromises();

    expect(__isRegistered(LOCATION_TASK_NAME)).toBe(false);
    expect(__activeWatchers()).toBe(1);
  });

  it('stops a task left registered while Background Geolocation is off', async () => {
    __registerTask(LOCATION_TASK_NAME, {});
    await create('person').start();
    expect(stopLocationUpdatesAsync).toHaveBeenCalledWith(LOCATION_TASK_NAME);
    expect(__activeWatchers()).toBe(1);
  });

  it('does not register without "always" access and tracks in the foreground only', async () => {
    settings.set({ backgroundGeolocation: true });
    __setBackground('denied');
    await create('unit').start();
    expect(startLocationUpdatesAsync).not.toHaveBeenCalled();
    expect(__activeWatchers()).toBe(1);
  });

  it('never registers from the background (Android refuses to start the foreground service there)', async () => {
    settings.set({ backgroundGeolocation: true });
    __registerTask(LOCATION_TASK_NAME, { stale: true });
    AppState.currentState = 'background';
    await create('unit').start();
    expect(startLocationUpdatesAsync).not.toHaveBeenCalled();
    expect(__isRegistered(LOCATION_TASK_NAME)).toBe(true);
  });

  it('falls back to the watcher when the build did not define the task', async () => {
    __resetTaskManager();
    settings.set({ backgroundGeolocation: true });
    await create('person').start();
    expect(startLocationUpdatesAsync).not.toHaveBeenCalled();
    expect(__activeWatchers()).toBe(1);
  });

  it('falls back to the watcher when registration fails', async () => {
    settings.set({ backgroundGeolocation: true });
    startLocationUpdatesAsync.mockRejectedValueOnce(new Error('foreground service not allowed'));
    await create('person').start();
    expect(__activeWatchers()).toBe(1);
    expect(getLocationTransmissionStatus().backgroundTaskRegistered).toBe(false);
  });

  it('never touches the task manager for variants without background location', async () => {
    await create('none').start();
    await create('none').stop();
    expect(startLocationUpdatesAsync).not.toHaveBeenCalled();
    expect(stopLocationUpdatesAsync).not.toHaveBeenCalled();
  });
});

describe('server refusals', () => {
  it('backs off after a refusal (30 s, doubling), and a delivery clears it (Unit)', async () => {
    const instance = create('unit');
    await instance.start();
    await emit(ORIGIN);
    const first = lastPayload<UnitLocationPayload>();
    instance.notifyRejected('unit', locationEvent('location.unit', first, 'evt-1'), 'dead');
    expect(getLocationTransmissionStatus().backoffUntil).toBe(T0 + 30_000);

    await advance(15_000);
    await emit(MOVED);
    expect(queued()).toHaveLength(1);

    await advance(15_000);
    await emit(ORIGIN); // the refused position is not "on the server": it is news again
    expect(queued()).toHaveLength(2);

    instance.notifyRejected('unit', locationEvent('location.unit', lastPayload<UnitLocationPayload>(), 'evt-2'), 'dead');
    expect(getLocationTransmissionStatus().backoffUntil).toBe(T0 + 30_000 + 60_000);

    instance.notifyDelivered('unit', locationEvent('location.unit', lastPayload<UnitLocationPayload>(), 'evt-2'));
    expect(getLocationTransmissionStatus().backoffUntil).toBeNull();
  });

  it('clears the backoff when the active unit changes', async () => {
    const instance = create('unit');
    await instance.start();
    await emit(ORIGIN);
    instance.notifyRejected('unit', locationEvent('location.unit', lastPayload<UnitLocationPayload>(), 'evt-1'), 'dead');
    unitId = '43';
    await advance(1_000);
    await emit(ORIGIN);
    expect(queued()).toHaveLength(2);
  });

  it('does not back off when the user discards a queued fix', async () => {
    const instance = create('person');
    await instance.start();
    await emit(ORIGIN);
    instance.notifyRejected('person', locationEvent('location.person', lastPayload<PersonLocationPayload>(), 'evt-1'), 'discarded');
    expect(getLocationTransmissionStatus().backoffUntil).toBeNull();
  });

  it('tracks the delivery trail in the status', async () => {
    const instance = create('person');
    await instance.start();
    await emit(ORIGIN);
    expect(getLocationTransmissionStatus()).toMatchObject({ lastQueuedAt: T0, awaitingDelivery: true, mode: 'foreground', target: 'person' });
    instance.notifyDelivered('person', locationEvent('location.person', lastPayload<PersonLocationPayload>(), 'evt-1'));
    expect(getLocationTransmissionStatus()).toMatchObject({ lastDeliveredAt: T0, awaitingDelivery: false });
  });

  it('does not count a fix that could not be queued as transmitted', async () => {
    outbox.enqueue.mockRejectedValueOnce(new Error('OutboxNoSessionError'));
    await create('person').start();
    await emit(ORIGIN);
    await advance(15_000);
    await emit(ORIGIN);
    expect(outbox.enqueue).toHaveBeenCalledTimes(2);
  });
});

describe('web and Electron', () => {
  interface FakeGeo {
    watchPosition: jest.Mock;
    clearWatch: jest.Mock;
    getCurrentPosition: jest.Mock;
    emit(latitude: number, longitude: number): void;
    fail(code: number): void;
  }

  const createGeo = (): FakeGeo => {
    const watches = new Map<number, { success: (position: GeolocationPosition) => void; error: (error: GeolocationPositionError) => void }>();
    let nextId = 1;
    return {
      watchPosition: jest.fn((success, error) => {
        const id = nextId++;
        watches.set(id, { success, error });
        return id;
      }),
      clearWatch: jest.fn((id: number) => watches.delete(id)),
      getCurrentPosition: jest.fn(),
      emit(latitude, longitude) {
        const position = { coords: { latitude, longitude, altitude: null, accuracy: 20, altitudeAccuracy: null, heading: null, speed: null }, timestamp: Date.now() } as unknown as GeolocationPosition;
        watches.forEach((watch) => watch.success(position));
      },
      fail(code) {
        watches.forEach((watch) => watch.error({ code, message: 'nope' } as GeolocationPositionError));
      },
    };
  };

  beforeEach(() => {
    Platform.OS = 'web';
  });

  it('uses browser geolocation, never expo-location or the task manager, and transmits foreground fixes', async () => {
    const geo = createGeo();
    settings.set({ backgroundGeolocation: true });
    await create('unit', { getBrowserGeolocation: () => geo }).start();
    geo.emit(ORIGIN.latitude, ORIGIN.longitude);
    await flushPromises();

    expect(geo.watchPosition).toHaveBeenCalledTimes(1);
    expect(watchPositionAsync).not.toHaveBeenCalled();
    expect(startLocationUpdatesAsync).not.toHaveBeenCalled();
    expect(queued()).toHaveLength(1);
    expect(getLocationTransmissionStatus().mode).toBe('web');
    expect(__appStateListenerCount()).toBe(0);
  });

  it('heartbeats on web too', async () => {
    const geo = createGeo();
    await create('unit', { getBrowserGeolocation: () => geo }).start();
    geo.emit(ORIGIN.latitude, ORIGIN.longitude);
    await flushPromises();
    await advance(HEARTBEAT_MS);
    expect(queued()).toHaveLength(2);
  });

  it('stops watching when the browser refuses permission', async () => {
    const geo = createGeo();
    await create('person', { getBrowserGeolocation: () => geo }).start();
    geo.fail(1);
    expect(geo.clearWatch).toHaveBeenCalled();
    expect(getLocationTransmissionStatus()).toMatchObject({ mode: 'permission-denied', watcherActive: false });
  });

  it('reports unavailable when the browser has no geolocation', async () => {
    await create('person', { getBrowserGeolocation: () => null }).start();
    expect(getLocationTransmissionStatus().mode).toBe('unavailable');
  });

  it('clears the browser watch on stop', async () => {
    const geo = createGeo();
    const instance = create('person', { getBrowserGeolocation: () => geo });
    await instance.start();
    await instance.stop();
    expect(geo.clearWatch).toHaveBeenCalledTimes(1);
  });
});
