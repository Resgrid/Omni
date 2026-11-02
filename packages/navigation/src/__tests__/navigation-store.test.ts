import { ApiError } from '@resgrid/api';
import { UnitNavigationState } from '@resgrid/models';

import { startProgress } from '../engine/progress';
import { parseNavRoute } from '../engine/route-model';
import { remainingToLeg, resetNavigationStoreForTests, useNavigationStore } from '../store/navigation-store';
import { isReportStale } from '../store/progress-reports';
import { fromDirectionsResult, fromRouteResult } from '../store/route-sources';
import { type NavigationProgressReport, type NavigationRouteResult, resetNavigationServicesForTests, setNavigationServices } from '../store/services';
import { buildRouteObject, buildTwoLegRouteObject, CORNER, DESTINATION, EAST_LEG, fix, NORTH_LEG, offsetNorth, ORIGIN } from './fixtures';

const resultFor = (routeObject: unknown, overrides: Partial<NavigationRouteResult> = {}): NavigationRouteResult => ({
  route: parseNavRoute(routeObject),
  provider: 'valhalla',
  attribution: '© Valhalla, © OpenStreetMap',
  isTrafficAware: false,
  vehicleRestricted: false,
  vehicleLimitsEnforced: 'all',
  navigationAvailable: true,
  incidents: [],
  ...overrides,
});

let now = 1_000_000;
let reports: NavigationProgressReport[];
let spoken: string[];
let sessions: boolean[];
let offRoute: { routeInstanceId: string; distanceMeters: number }[];
const toCall = jest.fn();
const toRouteStops = jest.fn();
const toPoint = jest.fn();

beforeEach(() => {
  now = 1_000_000;
  reports = [];
  spoken = [];
  sessions = [];
  offRoute = [];
  toCall.mockReset().mockResolvedValue(resultFor(buildRouteObject()));
  toRouteStops.mockReset();
  toPoint.mockReset().mockResolvedValue(resultFor(buildRouteObject()));
  resetNavigationServicesForTests();
  resetNavigationStoreForTests();
  setNavigationServices({
    routes: { toCall, toRouteStops, toPoint },
    voice: { speak: (text) => spoken.push(text), stop: () => undefined },
    reportProgress: (report) => reports.push(report),
    recordOffRoute: (input) => offRoute.push(input),
    currentFix: () => fix(ORIGIN, { timestamp: now }),
    onSessionChange: (active) => sessions.push(active),
    text: () => 'Rerouting',
    now: () => now,
  });
});

const store = () => useNavigationStore.getState();
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
const drive = (point: [number, number], options: { heading?: number; speed?: number; advanceMs?: number } = {}) => {
  now += options.advanceMs ?? 1_000;
  store().handleFix(fix(point, { heading: options.heading ?? 90, speed: options.speed ?? 10, timestamp: now }));
};

describe('starting a session', () => {
  it('routes to a call from the device position, speaks the first prompt and reports Started', async () => {
    await expect(store().start({ kind: 'call', callId: 12, name: 'Structure fire' }, { unitId: 7 })).resolves.toBe(true);
    expect(toCall).toHaveBeenCalledWith({ callId: 12, from: expect.objectContaining({ latitude: ORIGIN[1] }), unitId: 7 });
    expect(store()).toMatchObject({ status: 'navigating', activeLegIndex: 0, error: null });
    expect(store().banner?.primary.text).toBe('North Avenue');
    expect(spoken[0]).toContain('Drive east');
    expect(sessions).toEqual([true]);
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({ unitId: 7, callId: 12, routeInstanceId: null, state: UnitNavigationState.Started, remainingSeconds: 110, isTrafficAware: false, provider: 'valhalla' });
  });

  it('fails without a position, without a route and on a provider that cannot navigate', async () => {
    setNavigationServices({ currentFix: () => null });
    await expect(store().start({ kind: 'call', callId: 12, name: null })).resolves.toBe(false);
    expect(store()).toMatchObject({ status: 'error', error: 'no-position' });

    setNavigationServices({ currentFix: () => fix(ORIGIN) });
    toCall.mockResolvedValueOnce(null);
    await store().start({ kind: 'call', callId: 12, name: null });
    expect(store().error).toBe('no-route');

    toCall.mockResolvedValueOnce(resultFor(buildRouteObject(), { navigationAvailable: false, provider: 'osrm' }));
    await store().start({ kind: 'call', callId: 12, name: null });
    expect(store().error).toBe('unavailable');

    toCall.mockRejectedValueOnce(new Error('network'));
    await store().start({ kind: 'call', callId: 12, name: null });
    expect(store().error).toBe('failed');

    // Core's bare 404: the call is gone, hidden from this user or has no usable location.
    toCall.mockRejectedValueOnce(new ApiError({ kind: 'http', status: 404 }));
    await store().start({ kind: 'call', callId: 12, name: null });
    expect(store().error).toBe('no-destination');
    expect(reports).toEqual([]);
  });

  it('routes to a point without reporting an ETA (no call or route to attach it to)', async () => {
    await store().start({ kind: 'point', latitude: DESTINATION[1], longitude: DESTINATION[0], name: 'Hydrant 4' }, { unitId: 7 });
    expect(toPoint).toHaveBeenCalledWith(expect.objectContaining({ latitude: DESTINATION[1], longitude: DESTINATION[0], unitId: 7 }));
    expect(store().status).toBe('navigating');
    expect(reports).toEqual([]);
  });

  it('does not report without a unit', async () => {
    await store().start({ kind: 'call', callId: 12, name: null });
    expect(reports).toEqual([]);
  });
});

describe('guidance', () => {
  beforeEach(async () => {
    await store().start({ kind: 'call', callId: 12, name: null }, { unitId: 7 });
  });

  it('follows progress, speaks the turn prompt once and throttles ETA reports', () => {
    drive(EAST_LEG[2]);
    expect(store().progress?.stepIndex).toBe(0);
    expect(reports).toHaveLength(1);
    drive(EAST_LEG[5]);
    expect(spoken.filter((text) => text.startsWith('In 500 feet'))).toHaveLength(1);
    drive(EAST_LEG[5]);
    expect(spoken.filter((text) => text.startsWith('In 500 feet'))).toHaveLength(1);
    // A minute without a report sends one even when the ETA held.
    drive(EAST_LEG[5], { advanceMs: 61_000 });
    expect(reports[reports.length - 1].state).toBe(UnitNavigationState.Progress);
  });

  it('arrives near the destination and reports Arrived, then Ended on stop', () => {
    drive(CORNER, { heading: 0 });
    drive(NORTH_LEG[3], { heading: 0 });
    drive(offsetNorth(DESTINATION, -20), { heading: 0 });
    expect(store().status).toBe('arrived');
    expect(reports[reports.length - 1].state).toBe(UnitNavigationState.Arrived);
    store().stop();
    expect(reports[reports.length - 1].state).toBe(UnitNavigationState.Ended);
    expect(store().status).toBe('idle');
    expect(sessions).toEqual([true, false]);
  });

  it('reroutes after three off-route fixes and reports Rerouted', async () => {
    const away = offsetNorth(EAST_LEG[3], 120);
    drive(away);
    drive(away);
    expect(toCall).toHaveBeenCalledTimes(1);
    drive(away);
    await flush();
    expect(toCall).toHaveBeenCalledTimes(2);
    expect(store()).toMatchObject({ rerouting: false, rerouteCount: 1, usingLastRoute: false });
    expect(spoken).toContain('Rerouting');
    expect(reports[reports.length - 1].state).toBe(UnitNavigationState.Rerouted);
  });

  it('keeps following the last route when a reroute fails', async () => {
    toCall.mockRejectedValueOnce(new Error('offline'));
    const away = offsetNorth(EAST_LEG[3], 120);
    drive(away);
    drive(away);
    drive(away);
    await flush();
    expect(store()).toMatchObject({ status: 'navigating', usingLastRoute: true, rerouting: false });
    expect(store().route).not.toBeNull();
  });

  it('mutes prompts and remembers it', () => {
    store().setMuted(true);
    drive(EAST_LEG[5]);
    expect(spoken.filter((text) => text.startsWith('In 500 feet'))).toHaveLength(0);
    expect(store().muted).toBe(true);
  });
});

describe('route stops', () => {
  const legs = [
    { RouteStopId: 's1', RouteInstanceStopId: 'is1', Name: 'Stop 1', DistanceMeters: 580, DurationSeconds: 60, OffsetSeconds: 60, EtaUtc: null },
    { RouteStopId: 's2', RouteInstanceStopId: 'is2', Name: 'Stop 2', DistanceMeters: 556, DurationSeconds: 50, OffsetSeconds: 110, EtaUtc: null },
  ];

  beforeEach(async () => {
    toRouteStops.mockResolvedValue(resultFor(buildTwoLegRouteObject(), { legs }));
    await store().start({ kind: 'route', routeInstanceId: 'ri-1', name: 'Morning run' }, { unitId: 7 });
  });

  it('reports the stop being driven to and arrives at each stop in turn', () => {
    expect(reports[0]).toMatchObject({ routeInstanceId: 'ri-1', routeInstanceStopId: 'is1', callId: null, remainingSeconds: 60 });
    drive(EAST_LEG[6]);
    expect(store()).toMatchObject({ status: 'arrived', activeLegIndex: 0 });
    store().continueToNextLeg();
    expect(store()).toMatchObject({ status: 'navigating', activeLegIndex: 1 });
    expect(reports[reports.length - 1]).toMatchObject({ routeInstanceStopId: 'is2', state: UnitNavigationState.Progress });
    drive(NORTH_LEG[2], { heading: 0 });
    expect(store().status).toBe('navigating');
    drive(offsetNorth(DESTINATION, -10), { heading: 0 });
    expect(store().status).toBe('arrived');
    store().continueToNextLeg();
    expect(store().status).toBe('idle');
  });

  it('records an OffRoute deviation after 30 s off the planned line', () => {
    toRouteStops.mockImplementation(() => new Promise(() => undefined));
    const away = offsetNorth(EAST_LEG[2], 150);
    drive(away);
    drive(away);
    drive(away);
    expect(offRoute).toEqual([]);
    drive(away, { advanceMs: 31_000 });
    expect(offRoute).toEqual([expect.objectContaining({ routeInstanceId: 'ri-1' })]);
    drive(away, { advanceMs: 5_000 });
    expect(offRoute).toHaveLength(1);
  });

  it('skips a stop already continued from when a reroute still lists it', async () => {
    drive(EAST_LEG[6]);
    store().continueToNextLeg();
    toRouteStops.mockResolvedValueOnce(resultFor(buildTwoLegRouteObject(), { legs }));
    await store().reroute(fix(EAST_LEG[6]));
    expect(store().activeLegIndex).toBe(1);
  });
});

describe('helpers', () => {
  it('measures the time and distance left to a leg', () => {
    const route = parseNavRoute(buildTwoLegRouteObject());
    if (!route) throw new Error('no route');
    const atStart = startProgress(route);
    expect(remainingToLeg(route, atStart, 0)).toEqual({ seconds: expect.closeTo(60), meters: expect.closeTo(route.legs[0].endDistance) });
    expect(remainingToLeg(route, atStart, 1).seconds).toBeCloseTo(110);
  });

  it('drops stale ETA reports and keeps final ones a little longer', () => {
    const base: NavigationProgressReport = {
      unitId: 7,
      callId: 1,
      routeInstanceId: null,
      routeInstanceStopId: null,
      state: UnitNavigationState.Progress,
      remainingSeconds: 1,
      remainingMeters: 1,
      isTrafficAware: false,
      provider: null,
      at: 0,
    };
    expect(isReportStale(base, 59_000)).toBe(false);
    expect(isReportStale(base, 61_000)).toBe(true);
    expect(isReportStale({ ...base, state: UnitNavigationState.Ended }, 61_000)).toBe(false);
    expect(isReportStale({ ...base, state: UnitNavigationState.Ended }, 121_000)).toBe(true);
  });

  it('reads server answers: empty Data is no route; instance directions navigate only live on Valhalla or Mapbox', () => {
    expect(fromRouteResult({ Provider: null } as never)).toBeNull();
    const route = buildRouteObject();
    expect(fromRouteResult({ Provider: 'mapbox', Route: route, Geometry: null, NavigationAvailable: true, IsEstimate: false, Incidents: [], IsTrafficAware: true } as never)).toMatchObject({
      navigationAvailable: true,
      isTrafficAware: true,
    });
    expect(fromRouteResult({ Provider: 'estimate', Route: null, Geometry: null, NavigationAvailable: false, IsEstimate: true } as never)?.navigationAvailable).toBe(false);
    const directions = { Provider: 'valhalla', IsLive: true, IsEstimate: false, Route: route, Geometry: null, Legs: [], Waypoints: [] };
    expect(fromDirectionsResult(directions as never)?.navigationAvailable).toBe(true);
    expect(fromDirectionsResult({ ...directions, IsLive: false } as never)?.navigationAvailable).toBe(false);
    expect(fromDirectionsResult({ ...directions, Provider: 'google' } as never)?.navigationAvailable).toBe(false);
  });
});
