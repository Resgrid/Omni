import { checkInAtStop, checkOutFromStop, endRoute, getActiveRouteForUnit, getInstanceDirections, getRoutePlans, getRouteProgress, getStopsForInstance, pauseRoute, resumeRoute, startRoute } from '@resgrid/api';
import type { RouteInstanceResultData, RouteProgressResultData } from '@resgrid/models';
import { defaultResetRegistry } from '@resgrid/offline';

import { createDataTestRuntime, type DataTestRuntime, flush, httpError, notFound, ok, persisted } from '../../__tests__/helpers';
import { setDataLocationProvider } from '../../core/runtime';
import { ROUTE_STOP_CHECK_IN_EVENT, RouteInstanceStatus, routeStopOrderKey, RouteStopStatus, useRoutesStore } from '../routes-store';

jest.mock('@resgrid/api', () => ({
  ...jest.requireActual('@resgrid/api'),
  getRouteProgress: jest.fn(),
  getActiveRouteForUnit: jest.fn(),
  getRoutePlans: jest.fn(),
  pauseRoute: jest.fn(),
  resumeRoute: jest.fn(),
  startRoute: jest.fn(),
  endRoute: jest.fn(),
  getInstanceDirections: jest.fn(),
  checkInAtStop: jest.fn(),
  checkOutFromStop: jest.fn(),
  getStopsForInstance: jest.fn(),
}));

const instance: RouteInstanceResultData = {
  RouteInstanceId: 'ri-1',
  RoutePlanId: 'rp-1',
  RoutePlanName: 'Hydrant run',
  UnitId: 10,
  Status: RouteInstanceStatus.InProgress,
  ActualStartOn: null,
  ActualEndOn: null,
  StopsCompleted: 0,
  StopsTotal: 2,
  TotalDistanceMeters: null,
  TotalDurationSeconds: null,
  Notes: null,
  AddedOn: '2026-10-31T10:00:00Z',
};

const stop = (id: string, status: number = RouteStopStatus.Pending) => ({
  RouteInstanceStopId: id,
  RouteStopId: `s-${id}`,
  StopOrder: 1,
  Status: status,
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

const progress = (overrides: Partial<RouteProgressResultData> = {}): RouteProgressResultData => ({
  Instance: instance,
  TotalStops: 2,
  CompletedStops: 1,
  SkippedStops: 0,
  PendingStops: 1,
  Stops: [stop('st-1', RouteStopStatus.CheckedOut), stop('st-2')],
  ...overrides,
});

let runtime: DataTestRuntime;

beforeEach(async () => {
  runtime = await createDataTestRuntime({ variant: 'unit' });
  jest.mocked(getRouteProgress).mockResolvedValue(ok(progress()) as never);
  await defaultResetRegistry.getStoreResets().get('data.routes')?.('logout');
});

describe('routes store: RD11–RD13 defects fixed', () => {
  it('RD11: progress applies Data.Instance and the stops instead of overwriting the instance with the progress object', async () => {
    await useRoutesStore.getState().fetchRouteProgress('ri-1');
    const state = useRoutesStore.getState();
    expect(state.activeInstance).toEqual(instance);
    expect(state.activeInstance).not.toHaveProperty('TotalStops');
    expect(state.instanceStops.map((s) => s.RouteInstanceStopId)).toEqual(['st-1', 'st-2']);
    expect(state.progress).toEqual({ total: 2, completed: 1, skipped: 0, pending: 1 });
  });

  it('RD11: pause sets Paused (5), not Completed (2); resume sets InProgress', async () => {
    jest.mocked(startRoute).mockResolvedValue(ok(instance) as never);
    await useRoutesStore.getState().startRouteInstance('rp-1', 10);
    jest.mocked(pauseRoute).mockResolvedValue(ok(instance) as never);
    jest.mocked(resumeRoute).mockResolvedValue(ok(instance) as never);
    expect(await useRoutesStore.getState().pauseRouteInstance('ri-1')).toBe(true);
    expect(useRoutesStore.getState().activeInstance?.Status).toBe(RouteInstanceStatus.Paused);
    expect(RouteInstanceStatus.Paused).toBe(5);
    expect(useRoutesStore.getState().isTracking).toBe(false);
    await useRoutesStore.getState().resumeRouteInstance('ri-1');
    expect(useRoutesStore.getState().activeInstance?.Status).toBe(RouteInstanceStatus.InProgress);
  });

  it('ends a paused route by resuming it first (Core ends only a running route)', async () => {
    jest.mocked(startRoute).mockResolvedValue(ok(instance) as never);
    await useRoutesStore.getState().startRouteInstance('rp-1', 10);
    jest.mocked(pauseRoute).mockResolvedValue(ok(instance) as never);
    jest.mocked(resumeRoute).mockResolvedValue(ok(instance) as never);
    jest.mocked(endRoute).mockResolvedValue(ok(instance) as never);
    await useRoutesStore.getState().pauseRouteInstance('ri-1');
    jest.mocked(resumeRoute).mockClear();
    expect(await useRoutesStore.getState().endRouteInstance('ri-1')).toBe(true);
    expect(resumeRoute).toHaveBeenCalledWith(expect.anything(), { RouteInstanceId: 'ri-1' });
    expect(jest.mocked(resumeRoute).mock.invocationCallOrder[0]).toBeLessThan(jest.mocked(endRoute).mock.invocationCallOrder[0]);
    expect(useRoutesStore.getState().activeInstance).toBeNull();

    // A running route ends straight away.
    await useRoutesStore.getState().startRouteInstance('rp-1', 10);
    jest.mocked(resumeRoute).mockClear();
    await useRoutesStore.getState().endRouteInstance('ri-1');
    expect(resumeRoute).not.toHaveBeenCalled();
  });

  it('pauses a resumed route again when ending it fails, so it does not run on', async () => {
    jest.mocked(startRoute).mockResolvedValue(ok(instance) as never);
    await useRoutesStore.getState().startRouteInstance('rp-1', 10);
    jest.mocked(pauseRoute).mockResolvedValue(ok(instance) as never);
    jest.mocked(resumeRoute).mockResolvedValue(ok(instance) as never);
    jest.mocked(endRoute).mockRejectedValue(httpError(500));
    await useRoutesStore.getState().pauseRouteInstance('ri-1');
    jest.mocked(pauseRoute).mockClear();

    expect(await useRoutesStore.getState().endRouteInstance('ri-1')).toBe(false);
    expect(pauseRoute).toHaveBeenCalledWith(expect.anything(), { RouteInstanceId: 'ri-1' });
    expect(jest.mocked(endRoute).mock.invocationCallOrder[0]).toBeLessThan(jest.mocked(pauseRoute).mock.invocationCallOrder[0]);
    expect(useRoutesStore.getState().activeInstance?.Status).toBe(RouteInstanceStatus.Paused);
    expect(useRoutesStore.getState().isTracking).toBe(false);
    expect(useRoutesStore.getState().actionError?.status).toBe(500);

    // The pause fails too: the store shows the route running, as Core has it, and the crew sees the end error.
    jest.mocked(pauseRoute).mockRejectedValue(httpError(503));
    expect(await useRoutesStore.getState().endRouteInstance('ri-1')).toBe(false);
    expect(useRoutesStore.getState().activeInstance?.Status).toBe(RouteInstanceStatus.InProgress);
    expect(useRoutesStore.getState().actionError?.status).toBe(500);

    // A running route that fails to end is not paused.
    jest.mocked(pauseRoute).mockClear();
    expect(await useRoutesStore.getState().endRouteInstance('ri-1')).toBe(false);
    expect(pauseRoute).not.toHaveBeenCalled();
  });

  it('fetches every plan past the endpoint cache when asked to (pull-to-refresh, shift-start hydration)', async () => {
    jest.mocked(getRoutePlans).mockResolvedValue(ok([]) as never);
    await useRoutesStore.getState().fetchAllRoutePlans();
    expect(getRoutePlans).toHaveBeenLastCalledWith(expect.anything(), { forceRefresh: false });
    await useRoutesStore.getState().fetchAllRoutePlans({ bypassCache: true });
    expect(getRoutePlans).toHaveBeenLastCalledWith(expect.anything(), { forceRefresh: true });
  });

  it('a stops refresh while a read is out queues a fresh read instead of sharing it (a stop added meanwhile shows up)', async () => {
    // SAFETY: GetStopsForInstance envelopes carrying only the field this test reads, each stop's RouteStopId.
    const before = ok([{ RouteStopId: 's-1' }]) as never;
    // SAFETY: as above.
    const after = ok([{ RouteStopId: 's-1' }, { RouteStopId: 's-2' }]) as never;
    let answerFirst: () => void = () => undefined;
    jest
      .mocked(getStopsForInstance)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            answerFirst = () => resolve(before);
          })
      )
      .mockResolvedValueOnce(after);

    const first = useRoutesStore.getState().fetchStopsForInstance('ri-1');
    const refresh = useRoutesStore.getState().fetchStopsForInstance('ri-1', { bypassCache: true });
    answerFirst();
    await Promise.all([first, refresh]);

    expect(getStopsForInstance).toHaveBeenCalledTimes(2);
    expect(useRoutesStore.getState().stopDetails.map((detail) => detail.RouteStopId)).toEqual(['s-1', 's-2']);
  });

  it('RD11: directions are requested from the unit position (passed, else the last known fix)', async () => {
    jest.mocked(getInstanceDirections).mockResolvedValue(ok({ Waypoints: [] }) as never);
    await useRoutesStore.getState().fetchDirections('ri-1', { latitude: 39.1, longitude: -104.2 });
    expect(getInstanceDirections).toHaveBeenLastCalledWith(expect.anything(), { instanceId: 'ri-1', latitude: 39.1, longitude: -104.2 });
    setDataLocationProvider(() => ({ latitude: 40, longitude: -105 }));
    await useRoutesStore.getState().fetchDirections('ri-1');
    expect(getInstanceDirections).toHaveBeenLastCalledWith(expect.anything(), { instanceId: 'ri-1', latitude: 40, longitude: -105 });
  });

  it('RD10: check-out always posts the crew coordinates (never 0,0)', async () => {
    await useRoutesStore.getState().fetchRouteProgress('ri-1');
    jest.mocked(checkOutFromStop).mockResolvedValue({ Id: 'x', Status: 'success' } as never);
    await useRoutesStore.getState().checkOut('st-2', { latitude: 39.2, longitude: -104.3 });
    expect(checkOutFromStop).toHaveBeenCalledWith(expect.anything(), { RouteInstanceStopId: 'st-2', Latitude: 39.2, Longitude: -104.3 });
    expect(() => useRoutesStore.getState().checkOut('st-2', null)).toThrow();
  });

  it('no active route clears the instance: Core’s HTTP 404, or a not_found envelope', async () => {
    useRoutesStore.setState({ activeInstance: instance, isTracking: true });
    jest.mocked(getActiveRouteForUnit).mockRejectedValue(httpError(404));
    await useRoutesStore.getState().fetchActiveRoute(10);
    expect(useRoutesStore.getState().activeInstance).toBeNull();
    expect(useRoutesStore.getState().isTracking).toBe(false);
    expect(useRoutesStore.getState().errors.active ?? null).toBeNull();

    useRoutesStore.setState({ activeInstance: instance, isTracking: true });
    jest.mocked(getActiveRouteForUnit).mockResolvedValue(notFound(null) as never);
    await useRoutesStore.getState().fetchActiveRoute(10, { bypassCache: true });
    expect(useRoutesStore.getState().activeInstance).toBeNull();

    // Any other failure keeps what the crew had.
    useRoutesStore.setState({ activeInstance: instance, isTracking: true });
    jest.mocked(getActiveRouteForUnit).mockRejectedValue(httpError(500));
    await useRoutesStore.getState().fetchActiveRoute(10, { bypassCache: true });
    expect(useRoutesStore.getState().activeInstance).toEqual(instance);
  });
});

describe('routes store: offline stop check-in/out', () => {
  beforeEach(async () => {
    await useRoutesStore.getState().fetchRouteProgress('ri-1');
  });

  it('queues check-in offline with an optimistic status, ordered per stop; replays on reconnect', async () => {
    runtime.connectivity.setOnline(false);
    const checkIn = await useRoutesStore.getState().checkIn('st-2', { latitude: 39, longitude: -104 });
    const checkOut = await useRoutesStore.getState().checkOut('st-2', { latitude: 39.001, longitude: -104.001 });
    expect(checkIn.outcome).toBe('queued');
    const stop2 = () => useRoutesStore.getState().instanceStops.find((s) => s.RouteInstanceStopId === 'st-2');
    expect(stop2()?.Status).toBe(RouteStopStatus.CheckedOut);
    expect(stop2()?.CheckInLatitude).toBe(39);
    expect((await runtime.rows()).map((row) => [row.type, row.orderKey])).toEqual([
      [ROUTE_STOP_CHECK_IN_EVENT, routeStopOrderKey('st-2')],
      ['routes.stop.checkOut', routeStopOrderKey('st-2')],
    ]);
    expect(persisted(runtime.kv, 'omni-routes-storage')?.state).toHaveProperty('activeInstance');

    jest.mocked(checkInAtStop).mockResolvedValue({ Id: 'a', Status: 'success' } as never);
    jest.mocked(checkOutFromStop).mockResolvedValue({ Id: 'b', Status: 'success' } as never);
    runtime.connectivity.setOnline(true);
    const drain = await runtime.outbox.drain();
    expect(drain.sent).toEqual([checkIn.id, checkOut.id]);
    expect(checkInAtStop).toHaveBeenCalledWith(expect.anything(), { RouteInstanceStopId: 'st-2', Latitude: 39, Longitude: -104 });
    await flush();
    expect(getRouteProgress).toHaveBeenCalledTimes(3);
  });

  it('restores the previous stop status when the server refuses the check-in', async () => {
    jest.mocked(checkInAtStop).mockRejectedValue(httpError(400));
    const result = await useRoutesStore.getState().checkIn('st-2', { latitude: 39, longitude: -104 });
    expect(result.outcome).toBe('rejected');
    expect(useRoutesStore.getState().instanceStops.find((s) => s.RouteInstanceStopId === 'st-2')?.Status).toBe(RouteStopStatus.Pending);
  });
});
