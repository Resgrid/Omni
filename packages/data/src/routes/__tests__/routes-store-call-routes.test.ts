import { ApiError, getActiveRouteInstances, getCallRoutePlans, getDirections, getInstanceDirections, getRoutePlan, getRouteProgress, getStopsForInstance, reachRouteStart, startCallRoute } from '@resgrid/api';
import type { CallRoutePlanResultData, RouteInstanceResultData, RouteInstanceStopResultData, RoutePlanDetailResultData } from '@resgrid/models';
import { defaultResetRegistry } from '@resgrid/offline';

import { createDataTestRuntime, type DataTestRuntime, flush, httpError, persisted } from '../../__tests__/helpers';
import { setDataLocationProvider } from '../../core/runtime';
import { PLAN_PREVIEWS_MAX, ROUTE_REACH_START_EVENT, RouteInstanceStatus, routeStartOrderKey, useRoutesStore } from '../routes-store';

// Core M0322 (call routes): the call Route picker's plans, plan previews, starting a call's route and reaching its start.
jest.mock('@resgrid/api', () => ({
  ...jest.requireActual('@resgrid/api'),
  getActiveRouteInstances: jest.fn(),
  getCallRoutePlans: jest.fn(),
  getDirections: jest.fn(),
  getInstanceDirections: jest.fn(),
  getRoutePlan: jest.fn(),
  getRouteProgress: jest.fn(),
  getStopsForInstance: jest.fn(),
  reachRouteStart: jest.fn(),
  startCallRoute: jest.fn(),
}));

const instance = (overrides: Partial<RouteInstanceResultData> = {}): RouteInstanceResultData => ({
  RouteInstanceId: 'ri-1',
  RoutePlanId: 'rp-1',
  RoutePlanName: 'Transfer run',
  UnitId: 10,
  Status: RouteInstanceStatus.InProgress,
  ActualStartOn: '2026-11-19T10:00:00Z',
  ActualEndOn: null,
  StopsCompleted: 0,
  StopsTotal: 2,
  TotalDistanceMeters: null,
  TotalDurationSeconds: null,
  Notes: null,
  AddedOn: '2026-11-19T10:00:00Z',
  CallId: 42,
  StartReachedOn: null,
  ...overrides,
});

const instanceStop = (RouteInstanceStopId: string): RouteInstanceStopResultData => ({
  RouteInstanceStopId,
  RouteStopId: `s-${RouteInstanceStopId}`,
  StopOrder: 1,
  Status: 0,
  CheckInOn: null,
  CheckInType: null,
  CheckInLatitude: null,
  CheckInLongitude: null,
  CheckOutOn: null,
  CheckOutLatitude: null,
  CheckOutLongitude: null,
  DwellSeconds: null,
  SkipReason: null,
  Notes: null,
  EstimatedArrivalOn: null,
  ActualArrivalDeviation: null,
});

const endpoint = (Name: string, Latitude: number) => ({ Latitude, Longitude: -119.8, DepartmentGroupId: null, Name });

const callPlan = (RoutePlanId: string): CallRoutePlanResultData => ({
  RoutePlanId,
  Name: `Plan ${RoutePlanId}`,
  Description: null,
  RouteColor: null,
  UnitId: null,
  StopsCount: 2,
  EstimatedDistanceMeters: 12_000,
  EstimatedDurationSeconds: 1200,
  RoutingProfile: 0,
  Start: endpoint('Station 1', 39.5),
  End: endpoint('Hospital', 39.6),
  StartIsStop: false,
  EndIsStop: false,
});

/** A mocked endpoint's v4 answer. */
const answer = <R, D = null>(Data: D, Status = 'success'): R => {
  // SAFETY: the routes store reads only `Status` and `Data` of an endpoint's answer; the other envelope fields stay out.
  return { Data, Status } as R;
};

const planDetail = (RoutePlanId: string): RoutePlanDetailResultData => ({
  RoutePlanId,
  Name: `Plan ${RoutePlanId}`,
  Description: null,
  DepartmentId: 1,
  UnitId: null,
  RouteStatus: 1,
  RouteColor: null,
  StartLatitude: null,
  StartLongitude: null,
  EndLatitude: null,
  EndLongitude: null,
  UseStationAsStart: true,
  UseStationAsEnd: false,
  OptimizeStopOrder: false,
  MapboxRouteProfile: null,
  MapboxRouteGeometry: null,
  EstimatedDistanceMeters: null,
  EstimatedDurationSeconds: null,
  GeofenceRadiusMeters: 100,
  AddedOn: '2026-11-19T00:00:00Z',
  Stops: [],
  Schedules: [],
});

let runtime: DataTestRuntime;

beforeEach(async () => {
  runtime = await createDataTestRuntime({ variant: 'unit' });
  jest.mocked(getRouteProgress).mockResolvedValue(answer({ Instance: instance(), TotalStops: 2, CompletedStops: 0, SkippedStops: 0, PendingStops: 2, Stops: [] }));
  jest.mocked(getStopsForInstance).mockResolvedValue(answer([]));
  await defaultResetRegistry.getStoreResets().get('data.routes')?.('logout');
});

describe('routes store: the routes a call may run', () => {
  it('reads them through the endpoint cache and keeps them for offline use', async () => {
    jest.mocked(getCallRoutePlans).mockResolvedValue(answer([callPlan('rp-1'), callPlan('rp-2')]));
    await useRoutesStore.getState().fetchCallRoutePlans();
    expect(getCallRoutePlans).toHaveBeenLastCalledWith(expect.anything(), { forceRefresh: false });
    expect(useRoutesStore.getState().callRoutePlans.map((plan) => plan.RoutePlanId)).toEqual(['rp-1', 'rp-2']);
    expect(persisted(runtime.kv, 'omni-routes-storage')?.state).toHaveProperty('callRoutePlans');

    await useRoutesStore.getState().fetchCallRoutePlans({ bypassCache: true });
    expect(getCallRoutePlans).toHaveBeenLastCalledWith(expect.anything(), { forceRefresh: true });
  });
});

describe('routes store: plan previews', () => {
  it('reads the plan and its stored directions into their own slot, never the live route’s plan', async () => {
    const live = planDetail('rp-live');
    useRoutesStore.setState({ activePlan: live });
    jest.mocked(getRoutePlan).mockResolvedValue(answer(planDetail('rp-1')));
    jest.mocked(getDirections).mockResolvedValue(answer({ Waypoints: [], Start: endpoint('Station 1', 39.5), End: endpoint('Hospital', 39.6) }));

    const preview = await useRoutesStore.getState().fetchRoutePlanPreview('rp-1');
    expect(getRoutePlan).toHaveBeenCalledWith(expect.anything(), { id: 'rp-1' });
    expect(getDirections).toHaveBeenCalledWith(expect.anything(), { routePlanId: 'rp-1' });
    expect(preview?.plan.RoutePlanId).toBe('rp-1');
    expect(preview?.directions?.Start?.Name).toBe('Station 1');
    expect(useRoutesStore.getState().planPreviewsById['rp-1']).toEqual(preview);
    expect(useRoutesStore.getState().activePlan).toBe(live);
    expect(persisted(runtime.kv, 'omni-routes-storage')?.state).not.toHaveProperty('planPreviewsById');
  });

  it('still previews a plan whose directions cannot be read, and serves the cached copy when the plan cannot', async () => {
    jest.mocked(getRoutePlan).mockResolvedValue(answer(planDetail('rp-1')));
    jest.mocked(getDirections).mockRejectedValue(httpError(403));
    const preview = await useRoutesStore.getState().fetchRoutePlanPreview('rp-1');
    expect(preview?.plan.RoutePlanId).toBe('rp-1');
    expect(preview?.directions).toBeNull();

    jest.mocked(getRoutePlan).mockRejectedValue(httpError(503));
    expect(await useRoutesStore.getState().fetchRoutePlanPreview('rp-1', { bypassCache: true })).toEqual(preview);
    expect(useRoutesStore.getState().errors.planPreview?.status).toBe(503);

    // Offline with no preview cached: the live route's plan when it is the one asked for.
    const live = planDetail('rp-live');
    useRoutesStore.setState({ activePlan: live });
    expect(await useRoutesStore.getState().fetchRoutePlanPreview('rp-live')).toEqual({ plan: live, directions: null });
  });

  it('keeps only the newest previews', async () => {
    jest.mocked(getDirections).mockResolvedValue(answer(null));

    for (let index = 0; index <= PLAN_PREVIEWS_MAX; index++) {
      jest.mocked(getRoutePlan).mockResolvedValueOnce(answer(planDetail(`rp-${index}`)));
      await useRoutesStore.getState().fetchRoutePlanPreview(`rp-${index}`);
    }

    const ids = Object.keys(useRoutesStore.getState().planPreviewsById);
    expect(ids).toHaveLength(PLAN_PREVIEWS_MAX);
    expect(ids).not.toContain('rp-0');
  });
});

describe('routes store: the department’s running routes', () => {
  it('reads the running instances with their progress', async () => {
    jest.mocked(getActiveRouteInstances).mockResolvedValue(answer([{ RouteInstanceId: 'ri-1', ProgressPercent: 50 }]));
    await useRoutesStore.getState().fetchActiveRouteInstances();
    expect(useRoutesStore.getState().activeRouteInstances).toEqual([{ RouteInstanceId: 'ri-1', ProgressPercent: 50 }]);
  });
});

describe('routes store: starting a call’s route', () => {
  it('starts it and makes the run the unit’s active route', async () => {
    jest.mocked(startCallRoute).mockResolvedValue(answer(instance()));
    const result = await useRoutesStore.getState().startCallRoute('42', '10');
    expect(startCallRoute).toHaveBeenCalledWith(expect.anything(), { CallId: 42, UnitId: 10 });
    expect(result).toEqual({ status: 'started', instance: instance() });
    expect(useRoutesStore.getState().activeInstance?.RouteInstanceId).toBe('ri-1');
    expect(useRoutesStore.getState().isTracking).toBe(true);
    expect(getRouteProgress).toHaveBeenCalledWith(expect.anything(), { instanceId: 'ri-1' });
    expect(getStopsForInstance).toHaveBeenCalledWith(expect.anything(), { instanceId: 'ri-1' });
  });

  it('drops the previous run’s stops and progress in the same update that activates a different run', async () => {
    useRoutesStore.setState({ activeInstance: instance({ RouteInstanceId: 'ri-old' }), instanceStops: [instanceStop('ris-old')], progress: { total: 5, completed: 4, skipped: 0, pending: 1 } });
    let resolveProgress: (() => void) | undefined;
    jest.mocked(getRouteProgress).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveProgress = () => resolve(answer({ Instance: instance(), TotalStops: 2, CompletedStops: 0, SkippedStops: 0, PendingStops: 2, Stops: [] }));
      })
    );
    jest.mocked(startCallRoute).mockResolvedValue(answer(instance()));

    const started = useRoutesStore.getState().startCallRoute(42, 10);
    await flush();
    expect(useRoutesStore.getState().activeInstance?.RouteInstanceId).toBe('ri-1');
    expect(useRoutesStore.getState().instanceStops).toEqual([]);
    expect(useRoutesStore.getState().progress).toBeNull();

    resolveProgress?.();
    await started;
    expect(useRoutesStore.getState().progress).toEqual({ total: 2, completed: 0, skipped: 0, pending: 2 });
  });

  it('keeps the stops of the run it continues', async () => {
    const stop = instanceStop('ris-1');
    useRoutesStore.setState({ activeInstance: instance(), instanceStops: [stop] });
    jest.mocked(getRouteProgress).mockReturnValueOnce(new Promise(() => undefined));
    jest.mocked(startCallRoute).mockResolvedValue(answer(instance()));

    void useRoutesStore.getState().startCallRoute(42, 10);
    await flush();
    expect(useRoutesStore.getState().instanceStops).toEqual([stop]);
  });

  it('returns the paused run for this call as it is (the crew resumes it)', async () => {
    const paused = instance({ Status: RouteInstanceStatus.Paused });
    jest.mocked(startCallRoute).mockResolvedValue(answer(paused));
    jest.mocked(getRouteProgress).mockResolvedValue(answer({ Instance: paused, TotalStops: 2, CompletedStops: 0, SkippedStops: 0, PendingStops: 2, Stops: [] }));
    expect(await useRoutesStore.getState().startCallRoute(42, 10)).toMatchObject({ status: 'started' });
    expect(useRoutesStore.getState().activeInstance?.Status).toBe(RouteInstanceStatus.Paused);
    expect(useRoutesStore.getState().isTracking).toBe(false);
  });

  it('names the route the unit runs instead on a 409 route_in_progress', async () => {
    jest.mocked(startCallRoute).mockRejectedValue(new ApiError({ kind: 'http', status: 409, problemType: 'route_in_progress', data: { type: 'route_in_progress', status: 409, detail: 'ri-other' } }));
    const result = await useRoutesStore.getState().startCallRoute(42, 10);
    expect(result).toMatchObject({ status: 'route_in_progress', existingInstanceId: 'ri-other', error: { code: 'conflict', status: 409 } });
    expect(useRoutesStore.getState().activeInstance).toBeNull();
  });

  it('fails with a translatable error for anything else (no route on the call, offline)', async () => {
    jest.mocked(startCallRoute).mockRejectedValue(httpError(400));
    expect(await useRoutesStore.getState().startCallRoute(42, 10)).toEqual({ status: 'failed', error: expect.objectContaining({ code: 'rejected', messageKey: 'errors.data.rejected' }) });
    expect(useRoutesStore.getState().actionError?.code).toBe('rejected');

    jest.mocked(startCallRoute).mockResolvedValue(answer(null, 'not_found'));
    expect(await useRoutesStore.getState().startCallRoute(42, 10)).toMatchObject({ status: 'failed' });
  });
});

describe('routes store: reaching a call route’s start', () => {
  beforeEach(() => {
    useRoutesStore.setState({ activeInstance: instance(), isTracking: true });
  });

  it('queues offline with the position, shows it reached at once and replays it on reconnect', async () => {
    runtime.connectivity.setOnline(false);
    const result = await useRoutesStore.getState().reachRouteStart('ri-1', { latitude: 39.5, longitude: -119.8 });
    expect(result.outcome).toBe('queued');
    expect(useRoutesStore.getState().activeInstance?.StartReachedOn).toBe(new Date(runtime.clock.now()).toISOString());
    expect((await runtime.rows()).map((row) => [row.type, row.orderKey])).toEqual([[ROUTE_REACH_START_EVENT, routeStartOrderKey('ri-1')]]);

    jest.mocked(reachRouteStart).mockResolvedValue(answer(instance({ StartReachedOn: '2026-11-19T10:05:00Z' })));
    runtime.connectivity.setOnline(true);
    const drain = await runtime.outbox.drain();
    expect(drain.sent).toEqual([result.id]);
    expect(reachRouteStart).toHaveBeenCalledWith(expect.anything(), { RouteInstanceId: 'ri-1', Latitude: 39.5, Longitude: -119.8 });
    await flush();
    expect(getRouteProgress).toHaveBeenCalledWith(expect.anything(), { instanceId: 'ri-1' });
  });

  it('sends no position when none is known, and restores the start when the server refuses', async () => {
    setDataLocationProvider(() => null);
    jest.mocked(reachRouteStart).mockRejectedValue(httpError(400));
    const result = await useRoutesStore.getState().reachRouteStart('ri-1');
    expect(result.outcome).toBe('rejected');
    expect(reachRouteStart).toHaveBeenCalledWith(expect.anything(), { RouteInstanceId: 'ri-1' });
    expect(useRoutesStore.getState().activeInstance?.StartReachedOn).toBeNull();
  });
});

describe('routes store: directions with the route start leg', () => {
  it('asks for the start leg only with a position', async () => {
    jest.mocked(getInstanceDirections).mockResolvedValue(answer({ Waypoints: [] }));
    await useRoutesStore.getState().fetchDirections('ri-1', { latitude: 39.1, longitude: -104.2 }, { includeStart: true });
    expect(getInstanceDirections).toHaveBeenLastCalledWith(expect.anything(), { instanceId: 'ri-1', latitude: 39.1, longitude: -104.2, includeStart: true });

    await useRoutesStore.getState().fetchDirections('ri-1', { latitude: 39.1, longitude: -104.2 });
    expect(getInstanceDirections).toHaveBeenLastCalledWith(expect.anything(), { instanceId: 'ri-1', latitude: 39.1, longitude: -104.2 });

    setDataLocationProvider(() => null);
    await useRoutesStore.getState().fetchDirections('ri-1', null, { includeStart: true });
    expect(getInstanceDirections).toHaveBeenLastCalledWith(expect.anything(), { instanceId: 'ri-1' });
  });

  it('sends a start-leg request while a plain one is in flight, and keeps the newest answer', async () => {
    const position = { latitude: 39.1, longitude: -104.2 };
    let resolvePlain: (() => void) | undefined;
    jest.mocked(getInstanceDirections).mockReturnValueOnce(
      new Promise((resolve) => {
        resolvePlain = () => resolve(answer({ Waypoints: [], Geometry: 'plain' }));
      })
    );
    jest.mocked(getInstanceDirections).mockResolvedValueOnce(answer({ Waypoints: [], Geometry: 'with-start' }));

    const plain = useRoutesStore.getState().fetchDirections('ri-1', position);
    await useRoutesStore.getState().fetchDirections('ri-1', position, { includeStart: true });
    expect(getInstanceDirections).toHaveBeenCalledTimes(2);
    expect(getInstanceDirections).toHaveBeenLastCalledWith(expect.anything(), { instanceId: 'ri-1', ...position, includeStart: true });

    resolvePlain?.();
    await plain;
    expect(useRoutesStore.getState().directions).toMatchObject({ Geometry: 'with-start' });
  });
});
