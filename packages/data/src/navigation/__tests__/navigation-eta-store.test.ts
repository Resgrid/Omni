import { getActiveNavigations } from '@resgrid/api';
import { type UnitNavigationData, UnitNavigationState } from '@resgrid/models';
import { defaultResetRegistry } from '@resgrid/offline';

import { createDataTestRuntime, type DataTestRuntime, flush, networkError } from '../../__tests__/helpers';
import { getNavigationEta, isNavigationStale, NAVIGATION_EXPIRES_AFTER_MS, NAVIGATION_STALE_AFTER_MS, navigationReportAgeMs, navigationsByUnit, parseUnitNavigationUpdate, serverClockOffset } from '../navigation-eta';
import { NAVIGATION_REFRESH_COALESCE_MS, selectCallNavigations, useNavigationEtaStore } from '../navigation-eta-store';

jest.mock('@resgrid/api', () => ({
  ...jest.requireActual('@resgrid/api'),
  getActiveNavigations: jest.fn(),
}));

/** The test clock's start (createClock). */
const T0 = Date.UTC(2026, 9, 31, 12, 0, 0);
const iso = (ms: number) => new Date(ms).toISOString();

const nav = (UnitId: number, overrides: Partial<UnitNavigationData> = {}): UnitNavigationData => ({
  UnitId,
  CallId: 12,
  RouteInstanceId: null,
  RouteInstanceStopId: null,
  State: UnitNavigationState.Progress,
  EtaUtc: iso(T0 + 4 * 60_000),
  RemainingSeconds: 240,
  RemainingMeters: 3200,
  IsTrafficAware: true,
  Provider: 'valhalla',
  ReportedOn: iso(T0),
  IsStale: false,
  ...overrides,
});

const answer = (rows: UnitNavigationData[], timestamp: string = iso(T0)) => ({ Data: rows, Status: 'success', Timestamp: timestamp }) as never;

const payload = (unitId: number, state: number, callId: number | null = 12) => JSON.stringify({ unitId, callId, routeInstanceId: null, state });

const store = () => useNavigationEtaStore.getState();

let runtime: DataTestRuntime;

beforeEach(async () => {
  // The coalescing timer is faked; promise plumbing (flush, the in-memory DB) keeps running.
  jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick', 'queueMicrotask'] });
  runtime = await createDataTestRuntime({ variant: 'dispatch' });
  await defaultResetRegistry.getStoreResets().get('data.navigation-eta')?.('logout');
  jest.mocked(getActiveNavigations).mockReset();
  jest.mocked(getActiveNavigations).mockResolvedValue(answer([nav(7), nav(9, { CallId: 13 })]));
});

afterEach(() => {
  store().clear();
  jest.useRealTimers();
});

describe('navigation ETA helpers', () => {
  it('parses the camel-cased push, tolerating objects, PascalCase and a bare unit id', () => {
    expect(parseUnitNavigationUpdate('{"unitId":7,"callId":12,"routeInstanceId":null,"state":3}')).toEqual({ unitId: '7', callId: 12, routeInstanceId: null, state: 3 });
    expect(parseUnitNavigationUpdate({ UnitId: 8, CallId: null, RouteInstanceId: 'ri-1', State: 0 })).toEqual({ unitId: '8', callId: null, routeInstanceId: 'ri-1', state: 0 });
    expect(parseUnitNavigationUpdate('not json', '5')).toEqual({ unitId: '5', callId: null, routeInstanceId: null, state: null });
    expect(parseUnitNavigationUpdate(null, null)).toBeNull();
    expect(parseUnitNavigationUpdate('[1,2]')).toBeNull();
  });

  it('counts the ETA down against the clock, rounding minutes up', () => {
    const eta = getNavigationEta(nav(7), T0 + 30_000);
    expect(eta).toMatchObject({ unitId: '7', callId: 12, remainingSeconds: 210, minutes: 4, isTrafficAware: true, isStale: false, etaAt: T0 + 240_000 });
    expect(getNavigationEta(nav(7, { ReportedOn: iso(T0 + 170_000) }), T0 + 181_000)).toMatchObject({ remainingSeconds: 59, minutes: 1 });
    // Past the ETA but still navigating: due, never negative minutes.
    expect(getNavigationEta(nav(7, { ReportedOn: iso(T0 + 200_000) }), T0 + 250_000)).toMatchObject({ minutes: 0, remainingSeconds: -10 });
  });

  it('falls back to ReportedOn + RemainingSeconds when the ETA is unreadable', () => {
    expect(getNavigationEta(nav(7, { EtaUtc: '' }), T0 + 60_000)).toMatchObject({ remainingSeconds: 180, minutes: 3 });
    expect(getNavigationEta(nav(7, { EtaUtc: '', ReportedOn: '' }), T0)).toMatchObject({ remainingSeconds: 240, etaAt: null });
  });

  it('reads zone-less Core timestamps as UTC', () => {
    const zoneless = (ms: number) => iso(ms).replace('Z', '');
    expect(getNavigationEta(nav(7, { EtaUtc: zoneless(T0 + 120_000), ReportedOn: zoneless(T0) }), T0)?.minutes).toBe(2);
  });

  it('is stale when Core said so or after 60 s without a report, and gone after two minutes', () => {
    expect(isNavigationStale(nav(7, { IsStale: true }), T0)).toBe(true);
    expect(isNavigationStale(nav(7), T0 + NAVIGATION_STALE_AFTER_MS)).toBe(false);
    expect(isNavigationStale(nav(7), T0 + NAVIGATION_STALE_AFTER_MS + 1000)).toBe(true);
    expect(getNavigationEta(nav(7), T0 + 61_000)?.isStale).toBe(true);
    expect(getNavigationEta(nav(7), T0 + NAVIGATION_EXPIRES_AFTER_MS + 1000)).toBeNull();
  });

  it('runs on the server clock when the device clock is off', () => {
    // The device is five minutes fast: its "now" is server time + 5 min.
    const offset = serverClockOffset(iso(T0), T0 + 300_000);
    expect(offset).toBe(300_000);
    expect(navigationReportAgeMs(nav(7), T0 + 300_000 + 10_000, offset)).toBe(10_000);
    const eta = getNavigationEta(nav(7), T0 + 300_000 + 60_000, offset);
    expect(eta).toMatchObject({ minutes: 3, isStale: false, etaAt: T0 + 240_000 + 300_000 });
    expect(serverClockOffset('', T0)).toBe(0);
  });

  it('hides ended navigations and keys the rest by unit id', () => {
    expect(getNavigationEta(nav(7, { State: UnitNavigationState.Arrived }), T0)).toBeNull();
    expect(getNavigationEta(nav(7, { State: UnitNavigationState.Ended }), T0)).toBeNull();
    expect(Object.keys(navigationsByUnit([nav(7), nav(8, { State: UnitNavigationState.Ended }), nav(0)]))).toEqual(['7']);
  });

  it('selects the navigations heading to a call', () => {
    const byUnit = navigationsByUnit([nav(10), nav(7), nav(9, { CallId: 13 })]);
    expect(selectCallNavigations(byUnit, '12').map((row) => row.UnitId)).toEqual([7, 10]);
    expect(selectCallNavigations(byUnit, null)).toEqual([]);
  });
});

describe('navigation ETA store', () => {
  it('loads the active navigations by unit id and measures the server clock', async () => {
    runtime.clock.advance(2000);
    await store().fetchActiveNavigations();
    expect(Object.keys(store().navigations)).toEqual(['7', '9']);
    expect(store().serverClockOffsetMs).toBe(2000);
    expect(store().fetchedAt.navigations).toBe(T0 + 2000);
    expect(getActiveNavigations).toHaveBeenCalledWith(expect.anything());
  });

  it('keeps the last ETAs when a refresh fails', async () => {
    await store().fetchActiveNavigations();
    jest.mocked(getActiveNavigations).mockRejectedValueOnce(networkError());
    await store().fetchActiveNavigations({ bypassCache: true });
    expect(Object.keys(store().navigations)).toEqual(['7', '9']);
    expect(store().errors.navigations?.code).toBe('network');
  });

  it('coalesces a burst of pushes into one cache-bypassing refetch', async () => {
    await store().fetchActiveNavigations();
    jest.mocked(getActiveNavigations).mockClear();

    store().handleUnitNavigationUpdated('7', payload(7, UnitNavigationState.Progress));
    store().handleUnitNavigationUpdated('9', payload(9, UnitNavigationState.Rerouted, 13));
    store().requestRefresh();
    expect(getActiveNavigations).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(NAVIGATION_REFRESH_COALESCE_MS);
    await flush();
    expect(getActiveNavigations).toHaveBeenCalledTimes(1);

    // A steady stream still refreshes once per window (no starvation).
    store().handleUnitNavigationUpdated('7', payload(7, UnitNavigationState.Progress));
    await jest.advanceTimersByTimeAsync(NAVIGATION_REFRESH_COALESCE_MS / 2);
    store().handleUnitNavigationUpdated('7', payload(7, UnitNavigationState.Progress));
    await jest.advanceTimersByTimeAsync(NAVIGATION_REFRESH_COALESCE_MS / 2);
    await flush();
    expect(getActiveNavigations).toHaveBeenCalledTimes(2);
  });

  it('drops a unit at once on Arrived/Ended and keeps it out of a load that left before', async () => {
    await store().fetchActiveNavigations();
    let release: (value: unknown) => void = () => undefined;
    // A load in flight when the unit arrives still lists it.
    jest.mocked(getActiveNavigations).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }) as never
    );
    const inFlight = store().fetchActiveNavigations({ bypassCache: true });

    runtime.clock.advance(10);
    const update = store().handleUnitNavigationUpdated(7, payload(7, UnitNavigationState.Arrived));
    expect(update).toMatchObject({ unitId: '7', state: UnitNavigationState.Arrived });
    expect(store().navigations['7']).toBeUndefined();

    release(answer([nav(7), nav(9, { CallId: 13 })]));
    await inFlight;
    expect(store().navigations['7']).toBeUndefined();
    expect(store().navigations['9']).toBeDefined();

    // The coalesced refetch started after the arrival: the server no longer lists the unit.
    jest.mocked(getActiveNavigations).mockResolvedValue(answer([nav(9, { CallId: 13 })]));
    await jest.advanceTimersByTimeAsync(NAVIGATION_REFRESH_COALESCE_MS);
    await flush();
    expect(Object.keys(store().navigations)).toEqual(['9']);
  });

  it('shows a unit again when it starts a new navigation after arriving', async () => {
    await store().fetchActiveNavigations();
    runtime.clock.advance(10);
    store().handleUnitNavigationUpdated('7', payload(7, UnitNavigationState.Ended));
    expect(store().navigations['7']).toBeUndefined();

    runtime.clock.advance(10);
    store().handleUnitNavigationUpdated('7', payload(7, UnitNavigationState.Started, 14));
    jest.mocked(getActiveNavigations).mockResolvedValue(answer([nav(7, { CallId: 14 }), nav(9, { CallId: 13 })]));
    await jest.advanceTimersByTimeAsync(NAVIGATION_REFRESH_COALESCE_MS);
    await flush();
    expect(store().navigations['7']?.CallId).toBe(14);
  });

  it('refetches for a push it cannot read (older or odd payloads)', async () => {
    expect(store().handleUnitNavigationUpdated(null, 'garbage')).toBeNull();
    await jest.advanceTimersByTimeAsync(NAVIGATION_REFRESH_COALESCE_MS);
    await flush();
    expect(getActiveNavigations).toHaveBeenCalledTimes(1);
  });

  it('cancels a scheduled refetch, and clear drops everything without a request', async () => {
    await store().fetchActiveNavigations();
    jest.mocked(getActiveNavigations).mockClear();
    store().requestRefresh();
    store().cancelPendingRefresh();
    await jest.advanceTimersByTimeAsync(NAVIGATION_REFRESH_COALESCE_MS * 2);
    expect(getActiveNavigations).not.toHaveBeenCalled();

    store().requestRefresh();
    store().clear();
    await jest.advanceTimersByTimeAsync(NAVIGATION_REFRESH_COALESCE_MS * 2);
    expect(getActiveNavigations).not.toHaveBeenCalled();
    expect(store().navigations).toEqual({});
  });

  it('resets with the session and ignores an answer that lands after sign-out', async () => {
    let release: (value: unknown) => void = () => undefined;
    jest.mocked(getActiveNavigations).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }) as never
    );
    const inFlight = store().fetchActiveNavigations();
    await defaultResetRegistry.getStoreResets().get('data.navigation-eta')?.('logout');
    release(answer([nav(7)]));
    await inFlight;
    expect(store().navigations).toEqual({});
    expect(store().serverClockOffsetMs).toBe(0);
  });
});
