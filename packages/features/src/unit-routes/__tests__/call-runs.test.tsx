// The Jest setup must load before @resgrid/ui (gluestack, NativeWind): keep this side-effect import first.
import '../../unit-status/__tests__/test-setup';

import { RouteStopStatus, useCallsStore, useRoutesStore } from '@resgrid/data';
import { NavigationHandoffProvider } from '@resgrid/features/contacts';
import { StatusProvider } from '@resgrid/features/status';
import { CallResultData } from '@resgrid/models';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { Text } from 'react-native';

import { activateUnitVariant } from '../../unit-status/__tests__/test-helpers';
import { isRouteStartPending, routeStartWaypoint, runCallId } from '../lib/call-run';
import { waypointMapStops } from '../lib/route-map';
import { type RouteMapSlotProps, UnitRoutesMapProvider } from '../map-slot';
import RouteActiveScreen from '../screens/route-active';
import RouteDirectionsScreen from '../screens/route-directions';
import RouteStartScreen from '../screens/route-start';
import RoutesHomeScreen from '../screens/routes-home';
import { detailStop, directions, instance, plan, planDetail } from './fixtures';

jest.mock('@resgrid/features/navigation/hooks/use-in-app-navigation', () => ({ useInAppNavigationAvailable: () => false }));

/**
 * Runs started for a call (Core M0322): the routes screens name the call (linked to it), ask the live route with
 * `includeStart` until the run reaches its start, and mark that start on the map and in the waypoints.
 */
const mapCalls: RouteMapSlotProps[] = [];

const renderMap = (props: RouteMapSlotProps) => {
  mapCalls.push(props);

  return <Text testID={`map-${props.kind}`}>{`${props.stops.length} stops`}</Text>;
};

const wrap = async (node: React.ReactElement) =>
  render(
    <NavigationHandoffProvider value={{ navigateTo: jest.fn(async () => true) }}>
      <UnitRoutesMapProvider renderMap={renderMap}>
        <StatusProvider activeUnitId="10">{node}</StatusProvider>
      </UnitRoutesMapProvider>
    </NavigationHandoffProvider>
  );

const fetchDirections = jest.fn(async () => undefined);

const START_WAYPOINT = { RouteStopId: null, RouteInstanceStopId: null, StopOrder: 0, Name: 'Station 1', Latitude: 39.4, Longitude: -119.81, Address: null, Status: 0, IsRouteStart: true };

beforeEach(() => {
  activateUnitVariant();
  mapCalls.length = 0;
  fetchDirections.mockClear();
  jest.mocked(useLocalSearchParams).mockReturnValue({});
  useCallsStore.setState({ calls: [Object.assign(new CallResultData(), { CallId: '77', Number: '26-123', Name: 'Patient transfer', State: 0 })] });
  useRoutesStore.setState({
    fetchAllRoutePlans: jest.fn(async () => undefined),
    fetchActiveRoute: jest.fn(async () => undefined),
    fetchRoutePlan: jest.fn(async () => undefined),
    fetchRouteProgress: jest.fn(async () => undefined),
    fetchStopsForInstance: jest.fn(async () => undefined),
    fetchDeviations: jest.fn(async () => undefined),
    fetchDirections,
    routePlans: [plan('p1')],
    activePlan: null,
    activeInstance: instance('ri-1', { CallId: 77, StartReachedOn: null }),
    instanceStops: [],
    stopDetails: [detailStop('a', 1, RouteStopStatus.Pending), detailStop('b', 2, RouteStopStatus.Pending)],
    directions: directions({ Waypoints: [START_WAYPOINT, ...directions().Waypoints] }),
    deviations: [],
    loading: {},
    errors: {},
  });
});

describe('call run helpers', () => {
  it('reads the run’s call and whether its start is still ahead', () => {
    expect(runCallId(instance('ri-1', { CallId: 77 }))).toBe('77');
    expect(runCallId(instance('ri-1', { CallId: null }))).toBeNull();
    expect(runCallId(instance('ri-1'))).toBeNull();
    expect(isRouteStartPending(instance('ri-1', { CallId: 77, StartReachedOn: null }))).toBe(true);
    expect(isRouteStartPending(instance('ri-1', { CallId: 77, StartReachedOn: '2026-11-19T10:00:00Z' }))).toBe(false);
    expect(isRouteStartPending(instance('ri-1'))).toBe(false);
    expect(routeStartWaypoint([START_WAYPOINT])?.Name).toBe('Station 1');
    expect(routeStartWaypoint(directions().Waypoints)).toBeNull();
  });

  it('marks the route start waypoint on a directions map with its own label', () => {
    const stops = waypointMapStops([START_WAYPOINT, ...directions().Waypoints], null, { label: 'S', color: '#16a34a' });

    expect(stops[0]).toMatchObject({ label: 'S', color: '#16a34a', order: 0 });
    expect(stops[1].label).toBeUndefined();
  });
});

describe('RouteActiveScreen for a call’s run', () => {
  it('names the call (opening it), asks for the start leg and marks the start on the map', async () => {
    await wrap(<RouteActiveScreen pollMs={0} />);

    expect(fetchDirections).toHaveBeenCalledWith('ri-1', null, { includeStart: true });
    expect(screen.getByTestId('route-active-call')).toHaveTextContent('unit_routes.for_call:#26-123 · Patient transfer');
    expect(screen.getByTestId('route-active-start-pending')).toHaveTextContent('unit_routes.route_start_pending:Station 1');
    const active = mapCalls.filter((call) => call.kind === 'active').at(-1);
    expect(active?.stops[0]).toMatchObject({ id: 'route-start', label: 'route_plans.map_start_label', isCurrent: true });

    // The start marker is not a stop: pressing it opens nothing, while an actual stop still opens its details.
    await act(async () => active?.onStopPress?.('route-start'));
    expect(router.push).not.toHaveBeenCalled();
    const stopMarker = active?.stops[1]?.id ?? '';
    await act(async () => active?.onStopPress?.(stopMarker));
    expect(router.push).toHaveBeenCalledWith(`/routes/stop/${stopMarker}`);
    jest.mocked(router.push).mockClear();

    await fireEvent.press(screen.getByTestId('route-active-call'));
    expect(router.push).toHaveBeenCalledWith('/call/77');

    await fireEvent.press(screen.getByTestId('route-active-preview'));
    expect(router.push).toHaveBeenCalledWith('/route-plans/p1');
  });

  it('leaves the start out once it is reached', async () => {
    useRoutesStore.setState({ activeInstance: instance('ri-1', { CallId: 77, StartReachedOn: '2026-11-19T10:00:00Z' }), directions: directions() });
    await wrap(<RouteActiveScreen pollMs={0} />);

    expect(fetchDirections).toHaveBeenCalledWith('ri-1', null, { includeStart: false });
    expect(screen.queryByTestId('route-active-start-pending')).toBeNull();
    expect(
      mapCalls
        .filter((call) => call.kind === 'active')
        .at(-1)
        ?.stops.some((stop) => stop.id === 'route-start')
    ).toBe(false);
  });

  it('still links a call the store does not hold', async () => {
    useCallsStore.setState({ calls: [] });
    await wrap(<RouteActiveScreen pollMs={0} />);

    expect(screen.getByTestId('route-active-call')).toHaveTextContent('unit_routes.for_a_call');
  });
});

describe('RouteDirectionsScreen for a call’s run', () => {
  it('asks for the start leg and shows the start before the stops', async () => {
    await wrap(<RouteDirectionsScreen />);

    expect(fetchDirections).toHaveBeenCalledWith('ri-1', null, { includeStart: true });
    expect(screen.getByTestId('route-directions-waypoint-waypoint-0')).toHaveTextContent(/route_plans\.map_start_label.*Station 1.*unit_routes\.route_start/);
  });
});

describe('routes list and plan view', () => {
  it('names the call on the running route banner', async () => {
    await wrap(<RoutesHomeScreen />);

    expect(screen.getByTestId('route-plans-list-active-call')).toHaveTextContent('unit_routes.for_call:#26-123 · Patient transfer');
  });

  it('opens the plan preview from the plan view', async () => {
    useRoutesStore.setState({ activePlan: planDetail('p1'), activeInstance: null });
    jest.mocked(useLocalSearchParams).mockReturnValue({ planId: 'p1' });
    await wrap(<RouteStartScreen />);

    await fireEvent.press(screen.getByTestId('route-start-preview'));
    expect(router.push).toHaveBeenCalledWith('/route-plans/p1');
  });
});
