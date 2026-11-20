// The Jest setup must load before @resgrid/ui (gluestack, NativeWind): keep this side-effect import first.
import '../../unit-status/__tests__/test-setup';

import { parseVariantManifest, resetActiveVariantForTests, setActiveVariant } from '@resgrid/config';
import { RouteInstanceStatus, RouteStopStatus, useCallsStore, useRoutesStore, useUnitsStore } from '@resgrid/data';
import { type ActiveRouteInstanceResultData, CallResultData, RoutePlanStatus, type UnitResultData } from '@resgrid/models';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { Text } from 'react-native';

import dispatchManifest from '../../../../../apps/omni/variants/dispatch/variant.json';
import { detailStop, instance, plan, planDetail } from '../../unit-routes/__tests__/fixtures';
import { type RouteMapSlotProps, UnitRoutesMapProvider } from '../../unit-routes/map-slot';
import { DepartmentRoutePlans } from '../components/department-route-plans';
import { RunningRoutes } from '../components/running-routes';
import { runningRouteProgress, sortPlansForOverview, sortRunningRoutes } from '../lib/routes-overview';
import RouteInstanceViewScreen from '../screens/route-instance-view';
import RoutesOverviewScreen from '../screens/routes-overview';

const mapCalls: RouteMapSlotProps[] = [];

const renderMap = (props: RouteMapSlotProps) => {
  mapCalls.push(props);

  return <Text testID={`map-${props.kind}`}>{`${props.stops.length} stops`}</Text>;
};

const wrap = async (node: React.ReactElement) => render(<UnitRoutesMapProvider renderMap={renderMap}>{node}</UnitRoutesMapProvider>);

const running = (RouteInstanceId: string, overrides: Partial<ActiveRouteInstanceResultData> = {}): ActiveRouteInstanceResultData => ({
  RouteInstanceId,
  RoutePlanId: 'p1',
  RoutePlanName: `Run ${RouteInstanceId}`,
  UnitId: 10,
  Status: RouteInstanceStatus.InProgress,
  ActualStartOn: '2026-11-19T09:00:00Z',
  StopsCompleted: 1,
  StopsTotal: 4,
  ProgressPercent: 25,
  CurrentStopIndex: 1,
  CurrentStopName: 'Hydrant 2',
  ...overrides,
});

const store = {
  fetchAllRoutePlans: jest.fn(async () => undefined),
  fetchActiveRouteInstances: jest.fn(async () => undefined),
  fetchInstanceDetail: jest.fn(async () => null),
  fetchRoutePlanPreview: jest.fn(async () => null),
};

beforeEach(() => {
  resetActiveVariantForTests();
  setActiveVariant(parseVariantManifest(dispatchManifest));
  mapCalls.length = 0;
  Object.values(store).forEach((fn) => fn.mockClear());
  jest.mocked(router.push).mockClear();
  jest.mocked(router.replace).mockClear();
  jest.mocked(useLocalSearchParams).mockReturnValue({});
  useRoutesStore.setState({ ...store, routePlans: [], activeRouteInstances: [], instanceDetailsById: {}, planPreviewsById: {}, activeInstance: null, loading: {}, errors: {} });
  useCallsStore.setState({ calls: [] });
  // SAFETY: units carrying only the id and name these screens read (the unit name beside a plan or a run).
  useUnitsStore.setState({ units: [{ UnitId: '10', Name: 'Engine 10' } as UnitResultData, { UnitId: '11', Name: 'Truck 11' } as UnitResultData], fetchUnits: jest.fn(async () => undefined) });
});

describe('routes overview lib', () => {
  it('lists Active plans first, then by name, matching the search on name, description or unit', () => {
    const plans = [plan('a', { Name: 'Zulu', RouteStatus: RoutePlanStatus.Archived }), plan('b', { Name: 'Bravo', RouteStatus: RoutePlanStatus.Draft }), plan('c', { Name: 'Yankee' }), plan('d', { Name: 'Alpha' })];
    expect(sortPlansForOverview(plans, '', () => '').map((item) => item.RoutePlanId)).toEqual(['d', 'c', 'b', 'a']);
    expect(sortPlansForOverview(plans, 'truck', (item) => (item.RoutePlanId === 'b' ? 'Truck 11' : '')).map((item) => item.RoutePlanId)).toEqual(['b']);
  });

  it('puts running routes before paused ones, earliest start first, and works out progress', () => {
    const rows = [running('late', { ActualStartOn: '2026-11-19T10:00:00Z' }), running('paused', { Status: RouteInstanceStatus.Paused, ActualStartOn: '2026-11-19T08:00:00Z' }), running('early')];
    expect(sortRunningRoutes(rows).map((row) => row.RouteInstanceId)).toEqual(['early', 'late', 'paused']);
    expect(runningRouteProgress(running('x', { ProgressPercent: 0, StopsCompleted: 1, StopsTotal: 3 }))).toBe(33);
    expect(runningRouteProgress(running('x', { ProgressPercent: 140 }))).toBe(100);
    expect(runningRouteProgress(running('x', { ProgressPercent: 0, StopsTotal: 0 }))).toBe(0);
  });
});

describe('RunningRoutes', () => {
  it('shows each running route with its unit, status, next stop and progress, and opens it read only', async () => {
    useRoutesStore.setState({ activeRouteInstances: [running('ri-1'), running('ri-2', { UnitId: 11, Status: RouteInstanceStatus.Paused, CurrentStopName: null })] });
    await wrap(<RunningRoutes />);
    expect(store.fetchActiveRouteInstances).toHaveBeenCalled();
    const first = screen.getByTestId('running-routes-ri-1');
    expect(within(first).getByText('Engine 10')).toBeTruthy();
    expect(within(first).getByText('routes_overview.next_stop:Hydrant 2')).toBeTruthy();
    expect(screen.getByTestId('running-routes-ri-2-status')).toHaveTextContent('routes.paused');
    await fireEvent.press(first);
    expect(router.push).toHaveBeenCalledWith('/route-instances/ri-1');
  });

  it('names the call a run was started for and opens the call (Core M0322), reading the calls when none are loaded', async () => {
    const fetchCalls = jest.fn(async () => undefined);

    useCallsStore.setState({ calls: [], fetchCalls });
    useRoutesStore.setState({ activeRouteInstances: [running('ri-1', { CallId: 55 }), running('ri-2', { CallId: null })] });
    const view = await wrap(<RunningRoutes />);

    expect(fetchCalls).toHaveBeenCalled();
    expect(screen.getByTestId('running-routes-ri-1-call')).toHaveTextContent('routes_overview.for_a_call');
    expect(screen.queryByTestId('running-routes-ri-2-call')).toBeNull();
    await view.unmount();

    useCallsStore.setState({ calls: [{ ...new CallResultData(), CallId: '55', Number: '26-55', Name: 'Hydrant flushing' }] });
    await wrap(<RunningRoutes />);
    expect(screen.getByTestId('running-routes-ri-1-call')).toHaveTextContent('routes_overview.for_call:26-55,Hydrant flushing');
    await fireEvent.press(screen.getByTestId('running-routes-ri-1-call'));
    expect(router.push).toHaveBeenCalledWith('/call/55');
    expect(router.push).not.toHaveBeenCalledWith('/route-instances/ri-1');
  });

  it('says when no route is running and refreshes on Retry', async () => {
    await wrap(<RunningRoutes />);
    expect(screen.getByText('routes_overview.no_running')).toBeTruthy();
    await fireEvent.press(screen.getByText('common.refresh'));
    expect(store.fetchActiveRouteInstances).toHaveBeenLastCalledWith({ bypassCache: true });
  });
});

describe('DepartmentRoutePlans', () => {
  it('lists every plan with its status and opens its preview', async () => {
    useRoutesStore.setState({ routePlans: [plan('p1', { RouteStatus: RoutePlanStatus.Archived, Name: 'Old loop' }), plan('p2', { UnitId: 11 })] });
    await wrap(<DepartmentRoutePlans />);
    expect(store.fetchAllRoutePlans).toHaveBeenCalled();
    expect(screen.getAllByTestId(/^route-card-p\d$/).map((card) => card.props.testID)).toEqual(['route-card-p2', 'route-card-p1']);
    expect(screen.getByTestId('route-card-p1-status')).toHaveTextContent('route_plans.status.archived');
    expect(within(screen.getByTestId('route-card-p2')).getByText('Truck 11')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('route-card-p1'));
    expect(router.push).toHaveBeenCalledWith('/route-plans/p1');
  });
});

describe('RoutesOverviewScreen', () => {
  it('opens on the running routes with the plans as the second tab', async () => {
    await wrap(<RoutesOverviewScreen />);
    expect(screen.getByTestId('routes-overview-screen')).toBeTruthy();
    expect(screen.getByText('routes_overview.running_tab')).toBeTruthy();
    expect(screen.getByText('routes_overview.plans_tab')).toBeTruthy();
    await waitFor(() => expect(store.fetchActiveRouteInstances).toHaveBeenCalled());
  });
});

describe('RouteInstanceViewScreen', () => {
  it('shows a running route read only with the plan’s line, and Back goes to the department’s routes', async () => {
    jest.mocked(useLocalSearchParams).mockReturnValue({ id: 'ri-1' });
    useRoutesStore.setState({
      instanceDetailsById: {
        'ri-1': { progress: { Instance: instance('ri-1'), TotalStops: 2, CompletedStops: 1, SkippedStops: 0, PendingStops: 1, Stops: [] }, stops: [detailStop('a', 1, RouteStopStatus.CheckedOut), detailStop('b', 2)] },
      },
      planPreviewsById: { p1: { plan: planDetail('p1'), directions: null } },
    });
    await wrap(<RouteInstanceViewScreen />);
    expect(store.fetchInstanceDetail).toHaveBeenCalledWith('ri-1');
    expect(store.fetchRoutePlanPreview).toHaveBeenCalledWith('p1');
    expect(mapCalls[mapCalls.length - 1].line?.type).toBe('LineString');
    expect(screen.queryByText('routes.check_in')).toBeNull();

    jest.mocked(router.canGoBack).mockReturnValueOnce(false);
    await fireEvent.press(screen.getByTestId('back-button'));
    expect(router.replace).toHaveBeenCalledWith('/route-plans');
  });
});
