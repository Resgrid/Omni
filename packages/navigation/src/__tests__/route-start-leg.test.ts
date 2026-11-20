import { getInstanceDirections } from '@resgrid/api';
import { type RouteDirectionLegData, UnitNavigationState } from '@resgrid/models';

import { parseNavRoute } from '../engine/route-model';
import { isRouteStartLeg, resetNavigationStoreForTests, useNavigationStore } from '../store/navigation-store';
import { createServerRouteSource } from '../store/route-sources';
import { type NavigationProgressReport, type NavigationRouteResult, resetNavigationServicesForTests, setNavigationServices } from '../store/services';
import { buildRouteObject, buildTwoLegRouteObject, CORNER, DESTINATION, EAST_LEG, fix, NORTH_LEG, offsetNorth, ORIGIN } from './fixtures';

jest.mock('@resgrid/api', () => ({ ...jest.requireActual('@resgrid/api'), getInstanceDirections: jest.fn(async () => ({ Status: 'success', Data: null })) }));

/**
 * A call's route (Core M0322): with `includeStart` the live route first leads to the run's start (a station or start point),
 * a leg with `IsRouteStart` and no stop ids. Reaching it is not a stop arrival (no check-in, no Arrived report); once reached
 * the session asks for the route without it and never leads back to it.
 */
const START_LEG: RouteDirectionLegData = { RouteStopId: null, RouteInstanceStopId: null, Name: 'Station 1', DistanceMeters: 580, DurationSeconds: 60, OffsetSeconds: 60, EtaUtc: null, IsRouteStart: true };
const STOP_LEG: RouteDirectionLegData = { RouteStopId: 's1', RouteInstanceStopId: 'is1', Name: 'Stop 1', DistanceMeters: 556, DurationSeconds: 50, OffsetSeconds: 110, EtaUtc: null };

/** One of the synthetic OSRM route objects from the fixtures. */
type RouteObject = ReturnType<typeof buildRouteObject> | ReturnType<typeof buildTwoLegRouteObject>;

const resultFor = (routeObject: RouteObject, legs: RouteDirectionLegData[]): NavigationRouteResult => ({
  route: parseNavRoute(routeObject),
  provider: 'valhalla',
  attribution: null,
  isTrafficAware: false,
  vehicleRestricted: false,
  vehicleLimitsEnforced: null,
  navigationAvailable: true,
  incidents: [],
  legs,
});

let now = 1_000_000;
let reports: NavigationProgressReport[];
const toRouteStops = jest.fn();

beforeEach(() => {
  now = 1_000_000;
  reports = [];
  toRouteStops.mockReset().mockResolvedValue(resultFor(buildTwoLegRouteObject(), [START_LEG, STOP_LEG]));
  resetNavigationServicesForTests();
  resetNavigationStoreForTests();
  setNavigationServices({
    routes: { toCall: jest.fn(), toRouteStops, toPoint: jest.fn() },
    reportProgress: (report) => reports.push(report),
    currentFix: () => fix(ORIGIN, { timestamp: now }),
    now: () => now,
  });
});

const store = () => useNavigationStore.getState();

const drive = (point: [number, number], heading = 90) => {
  now += 1_000;
  store().handleFix(fix(point, { heading, speed: 10, timestamp: now }));
};

describe('a call route that starts at its station', () => {
  it('asks for the start leg, leads there first and names no stop on the way', async () => {
    await store().start({ kind: 'route', routeInstanceId: 'ri-9', name: 'Transfer' }, { unitId: 7 });

    expect(toRouteStops).toHaveBeenCalledWith(expect.objectContaining({ routeInstanceId: 'ri-9', includeStart: true }));
    expect(store().activeLegIndex).toBe(0);
    expect(isRouteStartLeg(store().meta?.legStops[0])).toBe(true);
    expect(store().meta?.legStops[0]).toMatchObject({ routeStopId: null, routeInstanceStopId: null, name: 'Station 1' });
    // A call's route reports the run (RouteInstanceId), never the call too.
    expect(reports[0]).toMatchObject({ unitId: 7, callId: null, routeInstanceId: 'ri-9', routeInstanceStopId: null, state: UnitNavigationState.Started });
  });

  it('arrives at the start without an Arrived report, then drives to the first stop', async () => {
    await store().start({ kind: 'route', routeInstanceId: 'ri-9', name: null }, { unitId: 7 });
    drive(EAST_LEG[3]);
    drive(CORNER);

    expect(store()).toMatchObject({ status: 'arrived', activeLegIndex: 0 });
    expect(reports.map((report) => report.state)).not.toContain(UnitNavigationState.Arrived);

    store().continueToNextLeg();
    expect(store()).toMatchObject({ status: 'navigating', activeLegIndex: 1 });
    expect(reports[reports.length - 1]).toMatchObject({ routeInstanceStopId: 'is1', callId: null, state: UnitNavigationState.Progress });

    drive(NORTH_LEG[3], 0);
    drive(offsetNorth(DESTINATION, -10), 0);
    expect(store().status).toBe('arrived');
    expect(reports[reports.length - 1]).toMatchObject({ routeInstanceStopId: 'is1', state: UnitNavigationState.Arrived });
  });

  it('reroutes without the start once it is reached', async () => {
    await store().start({ kind: 'route', routeInstanceId: 'ri-9', name: null }, { unitId: 7 });
    drive(CORNER);
    store().continueToNextLeg();

    // The server has the start reached and leaves it out: the route is the one stop leg.
    toRouteStops.mockResolvedValueOnce(resultFor(buildRouteObject(), [STOP_LEG]));
    await store().reroute(fix(CORNER));

    expect(toRouteStops).toHaveBeenLastCalledWith(expect.objectContaining({ includeStart: false }));
    expect(store().activeLegIndex).toBe(0);
    expect(store().meta?.legStops.map((leg) => leg.isRouteStart)).toEqual([false]);
  });

  it('skips a start leg the server still sends after the start was reached (its ReachRouteStart still queued)', async () => {
    await store().start({ kind: 'route', routeInstanceId: 'ri-9', name: null }, { unitId: 7 });
    drive(CORNER);
    store().continueToNextLeg();

    await store().reroute(fix(CORNER));
    expect(store().activeLegIndex).toBe(1);
    expect(reports[reports.length - 1]).toMatchObject({ routeInstanceStopId: 'is1', state: UnitNavigationState.Rerouted });
  });

  it('never asks for the start when the run had reached it before the session', async () => {
    toRouteStops.mockResolvedValue(resultFor(buildRouteObject(), [STOP_LEG]));
    await store().start({ kind: 'route', routeInstanceId: 'ri-9', name: null, startReached: true }, { unitId: 7 });

    expect(toRouteStops).toHaveBeenCalledWith(expect.objectContaining({ includeStart: false }));
    expect(reports[0]).toMatchObject({ routeInstanceStopId: 'is1' });
  });

  it('starts at the start leg again in a new session that did not reach it', async () => {
    await store().start({ kind: 'route', routeInstanceId: 'ri-9', name: null }, { unitId: 7 });
    drive(CORNER);
    store().continueToNextLeg();
    store().stop();

    await store().start({ kind: 'route', routeInstanceId: 'ri-9', name: null }, { unitId: 7 });
    expect(toRouteStops).toHaveBeenLastCalledWith(expect.objectContaining({ includeStart: true }));
    expect(store().activeLegIndex).toBe(0);
  });
});

describe('server route source', () => {
  // SAFETY: getInstanceDirections is mocked above, so the API context is never read.
  const source = createServerRouteSource({ getApiContext: () => ({}) as never, getLanguage: () => 'en', isMetric: () => true, supportsTraffic: () => false });

  beforeEach(() => jest.mocked(getInstanceDirections).mockClear());

  it('sends includeStart only while the session drives to the start', async () => {
    await source.toRouteStops({ routeInstanceId: 'ri-9', from: fix(ORIGIN), includeStart: true });
    expect(jest.mocked(getInstanceDirections).mock.calls[0][1]).toMatchObject({ instanceId: 'ri-9', navigation: true, includeStart: true });

    await source.toRouteStops({ routeInstanceId: 'ri-9', from: fix(ORIGIN), includeStart: false });
    expect(jest.mocked(getInstanceDirections).mock.calls[1][1].includeStart).toBeUndefined();
  });
});
