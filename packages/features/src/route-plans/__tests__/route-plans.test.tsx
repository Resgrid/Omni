// The Jest setup must load before @resgrid/ui (gluestack, NativeWind): keep this side-effect import first.
import '../../unit-status/__tests__/test-setup';

import { type RoutePlanPreviewData, useRoutesStore, useUnitsStore } from '@resgrid/data';
import { StatusProvider } from '@resgrid/features/status';
import { RoutePlanStatus, RoutingProfile, type UnitResultData } from '@resgrid/models';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { Text } from 'react-native';

import { plan, planDetail, planStop } from '../../unit-routes/__tests__/fixtures';
import { RoutePlansList } from '../../unit-routes/components/route-plans-list';
import { type RouteMapSlotProps, UnitRoutesMapProvider } from '../../unit-routes/map-slot';
import { activateUnitVariant } from '../../unit-status/__tests__/test-helpers';
import { RoutePlanPreview } from '../components/route-plan-preview';
import { planPreviewLine, routeEndpointMarkers, routeEndpointsOf, routePlanStatusLook, routingProfileKey } from '../lib/route-plan-preview';
import { routePlansRoutes } from '../routes';
import RoutePlanPreviewScreen from '../screens/route-plan-preview';

const mapCalls: RouteMapSlotProps[] = [];

const renderMap = (props: RouteMapSlotProps) => {
  mapCalls.push(props);

  return <Text testID={`map-${props.kind}`}>{props.stops.map((stop) => stop.label ?? String(stop.order)).join(',')}</Text>;
};

const wrap = async (node: React.ReactElement) =>
  render(
    <UnitRoutesMapProvider renderMap={renderMap}>
      <StatusProvider activeUnitId="10">{node}</StatusProvider>
    </UnitRoutesMapProvider>
  );

const station = { Latitude: 39.4, Longitude: -119.9, DepartmentGroupId: 3, Name: 'Station 3' };
const hospital = { Latitude: 39.7, Longitude: -119.6, DepartmentGroupId: null, Name: 'General Hospital' };

const preview = (overrides: Partial<RoutePlanPreviewData> = {}): RoutePlanPreviewData => ({
  plan: planDetail('p1', { UnitId: 10, RoutingProfile: RoutingProfile.Truck, EstimatedDurationWithDwellSeconds: 4200 }),
  directions: null,
  ...overrides,
});

const fetchRoutePlanPreview = jest.fn(async () => null);

beforeEach(() => {
  activateUnitVariant();
  mapCalls.length = 0;
  fetchRoutePlanPreview.mockClear();
  jest.mocked(router.push).mockClear();
  jest.mocked(router.replace).mockClear();
  jest.mocked(useLocalSearchParams).mockReturnValue({});
  useRoutesStore.setState({
    fetchRoutePlanPreview,
    fetchAllRoutePlans: jest.fn(async () => undefined),
    fetchActiveRoute: jest.fn(async () => undefined),
    planPreviewsById: {},
    routePlans: [],
    activeInstance: null,
    instanceStops: [],
    loading: {},
    errors: {},
  });
  // SAFETY: units carrying only the id and name these screens read (the unit name beside a plan or a run).
  useUnitsStore.setState({ units: [{ UnitId: '10', Name: 'Engine 10' } as UnitResultData], fetchUnits: jest.fn(async () => undefined) });
});

describe('route plan preview lib', () => {
  const stops = [planStop('s1', 1), planStop('s2', 2)];

  it('marks a station or point start and end, and leaves a start or end that is a stop to the stop', () => {
    const endpoints = routeEndpointsOf({ Start: station, End: hospital }, stops);
    expect(endpoints.map((endpoint) => [endpoint.kind, endpoint.isStop])).toEqual([
      ['start', false],
      ['end', false],
    ]);
    expect(routeEndpointMarkers(endpoints, { start: 'S', end: 'E' }).map((marker) => [marker.id, marker.label])).toEqual([
      ['route-start', 'S'],
      ['route-end', 'E'],
    ]);

    const lastStop = stops[1];
    const onStops = routeEndpointsOf({ Start: { ...station, Latitude: stops[0].Latitude, Longitude: stops[0].Longitude }, End: { ...hospital, Latitude: lastStop.Latitude, Longitude: lastStop.Longitude } }, stops);
    expect(onStops.map((endpoint) => endpoint.isStop)).toEqual([true, true]);
    expect(routeEndpointMarkers(onStops, { start: 'S', end: 'E' })).toEqual([]);
    expect(routeEndpointsOf(null, stops)).toEqual([]);
  });

  it('names the plan status and travel mode, and draws the stored line or the directions line', () => {
    expect(routePlanStatusLook(RoutePlanStatus.Archived).labelKey).toBe('route_plans.status.archived');
    expect(routePlanStatusLook(99).labelKey).toBe('route_plans.status.draft');
    expect(routingProfileKey(RoutingProfile.DrivingTraffic)).toBe('route_plans.profile.driving_traffic');
    expect(routingProfileKey(undefined)).toBeNull();
    expect(
      planPreviewLine(
        { MapboxRouteGeometry: null },
        {
          Geometry: JSON.stringify({
            type: 'LineString',
            coordinates: [
              [-119.8, 39.5],
              [-119.7, 39.6],
            ],
          }),
        }
      )?.type
    ).toBe('LineString');
    expect(planPreviewLine({ MapboxRouteGeometry: null }, null)).toBeNull();
  });

  it('builds the preview path from a safe plan id only', () => {
    expect(routePlansRoutes.preview('9b1d-44')).toBe('/route-plans/9b1d-44');
    expect(routePlansRoutes.preview('../x')).toBeNull();
    expect(routePlansRoutes.preview(null)).toBeNull();
  });
});

describe('RoutePlanPreview', () => {
  it('reads the plan into the preview slot and shows the map, start and end, travel mode and stops', async () => {
    useRoutesStore.setState({
      planPreviewsById: {
        p1: preview({
          directions: {
            RoutePlanId: 'p1',
            RouteInstanceId: null,
            Geometry: null,
            EstimatedDistanceMeters: null,
            EstimatedDurationSeconds: null,
            RouteProfile: null,
            OriginLatitude: null,
            OriginLongitude: null,
            Waypoints: [],
            Start: station,
            End: hospital,
          },
        }),
      },
    });
    await wrap(<RoutePlanPreview planId="p1" />);

    expect(fetchRoutePlanPreview).toHaveBeenCalledWith('p1', { bypassCache: false });
    expect(screen.getByTestId('map-preview')).toHaveTextContent('route_plans.map_start_label,route_plans.map_end_label,1,2');
    expect(mapCalls[mapCalls.length - 1].line?.type).toBe('LineString');
    expect(screen.getByTestId('route-plan-preview-status')).toHaveTextContent('route_plans.status.active');
    expect(screen.getByText('Engine 10')).toBeTruthy();
    expect(screen.getByTestId('route-plan-preview-stats-profile')).toHaveTextContent(/route_plans\.profile\.truck/);
    expect(screen.getByTestId('route-plan-preview-stats-with-stops')).toBeTruthy();
    expect(screen.getByTestId('route-plan-preview-start')).toHaveTextContent(/Station 3/);
    expect(screen.getByTestId('route-plan-preview-end')).toHaveTextContent(/General Hospital/);
    expect(screen.getAllByTestId(/^route-plan-preview-stop-/).map((row) => row.props.testID)).toEqual(['route-plan-preview-stop-s1', 'route-plan-preview-stop-s2']);
  });

  it('shows why a plan cannot be read and loads it again on Retry', async () => {
    useRoutesStore.setState({ errors: { planPreview: { code: 'forbidden', status: 403, messageKey: 'errors.data.forbidden' } } });
    await wrap(<RoutePlanPreview planId="p1" />);
    await waitFor(() => expect(screen.getByTestId('route-plan-preview-missing')).toBeTruthy());
    expect(screen.getByText('errors.data.forbidden')).toBeTruthy();
    await fireEvent.press(screen.getByText('common.retry'));
    expect(fetchRoutePlanPreview).toHaveBeenLastCalledWith('p1', { bypassCache: true });
  });
});

describe('RoutePlanPreviewScreen', () => {
  it('previews the plan in the route and goes home when there is nothing to go back to', async () => {
    jest.mocked(useLocalSearchParams).mockReturnValue({ id: 'p1' });
    useRoutesStore.setState({ planPreviewsById: { p1: preview() } });
    await wrap(<RoutePlanPreviewScreen />);
    expect(screen.getByRole('header', { name: 'Plan p1' })).toBeTruthy();
    expect(fetchRoutePlanPreview).toHaveBeenCalledWith('p1', { bypassCache: false });

    jest.mocked(router.canGoBack).mockReturnValueOnce(false);
    await fireEvent.press(screen.getByTestId('back-button'));
    expect(router.replace).toHaveBeenCalledWith('/');
  });
});

describe('Unit routes list: plan preview', () => {
  it('opens the preview from a plan’s Preview button and still opens the start screen from the card', async () => {
    useRoutesStore.setState({ routePlans: [plan('p1')] });
    await wrap(<RoutePlansList />);
    await fireEvent.press(screen.getByTestId('route-card-p1-preview'));
    expect(router.push).toHaveBeenCalledWith('/route-plans/p1');
    await fireEvent.press(screen.getByTestId('route-card-p1'));
    expect(router.push).toHaveBeenLastCalledWith('/routes/start?planId=p1');
  });
});
