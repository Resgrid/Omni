import './test-setup';

import type { VariantId } from '@resgrid/config';
import { RouteStopStatus, useCustomMapsStore, useMapMarkersStore, useRoutesStore } from '@resgrid/data';
import { NavigationHandoffProvider } from '@resgrid/features/contacts';
import { StatusProvider } from '@resgrid/features/status';
import type { RouteDirectionsResultData, RouteInstanceResultData, RoutePlanDetailResultData, RouteStopWithDetailsResultData } from '@resgrid/models';
import { defaultResetRegistry } from '@resgrid/offline';
import { useToastStore } from '@resgrid/ui';
import { fireEvent, render, renderHook, screen } from '@testing-library/react-native';
import { useLocalSearchParams } from 'expo-router';
import React from 'react';

import { activateVariant, setRights } from '../../calls/__tests__/test-utils';
import { activeRouteShapes } from '../components/active-route-overlay';
import { useActiveRouteOverlay } from '../hooks/use-active-route-overlay';
import { useMapViewStore } from '../hooks/use-map-view-store';
import { MAP_TRAFFIC_STORE_NAME, TRAFFIC_SURFACES, useMapTrafficPreferenceStore, useTrafficPreference } from '../hooks/use-traffic-preference';
import MapScreen from '../screens/map-screen';

const LINE = {
  type: 'LineString',
  coordinates: [
    [-119.9, 38.9],
    [-119.8, 39.0],
    [-119.7, 39.1],
  ],
};
const LIVE_LINE = {
  type: 'LineString',
  coordinates: [
    [-120, 38],
    [-121, 37],
  ],
};

const instance = (overrides: Partial<RouteInstanceResultData> = {}): RouteInstanceResultData => ({
  RouteInstanceId: 'ri1',
  RoutePlanId: 'rp1',
  RoutePlanName: 'Hydrant loop',
  UnitId: 7,
  Status: 1,
  ActualStartOn: null,
  ActualEndOn: null,
  StopsCompleted: 1,
  StopsTotal: 3,
  TotalDistanceMeters: null,
  TotalDurationSeconds: null,
  Notes: null,
  AddedOn: '2026-11-01T10:00:00Z',
  ...overrides,
});

const stop = (id: string, order: number, status: number, overrides: Partial<RouteStopWithDetailsResultData> = {}): RouteStopWithDetailsResultData =>
  ({
    RouteStopId: `s${id}`,
    RoutePlanId: 'rp1',
    StopOrder: order,
    Name: `Stop ${order}`,
    Latitude: 38.9 + order / 100,
    Longitude: -119.9,
    GeofenceRadiusMeters: null,
    RouteInstanceStopId: `is${id}`,
    RouteInstanceId: 'ri1',
    Status: status,
    ...overrides,
  }) as RouteStopWithDetailsResultData;

const plan = (overrides: Partial<RoutePlanDetailResultData> = {}): RoutePlanDetailResultData =>
  ({ RoutePlanId: 'rp1', Name: 'Hydrant loop', RouteColor: 'ff8800', MapboxRouteGeometry: JSON.stringify(LINE), GeofenceRadiusMeters: 50, Stops: [], Schedules: [], ...overrides }) as RoutePlanDetailResultData;

const mocks = {
  fetchActiveRoute: jest.fn(async () => undefined),
  fetchStopsForInstance: jest.fn(async () => undefined),
  fetchRoutePlan: jest.fn(async () => undefined),
};

const setRoutes = (state: Partial<ReturnType<typeof useRoutesStore.getState>>) =>
  useRoutesStore.setState({
    activeInstance: null,
    stopDetails: [],
    directions: null,
    activePlan: null,
    routePlans: [],
    fetchActiveRoute: mocks.fetchActiveRoute,
    fetchStopsForInstance: mocks.fetchStopsForInstance,
    fetchRoutePlan: mocks.fetchRoutePlan,
    ...state,
  });

const renderMap = async (variant: VariantId, activeUnitId: string | null) => {
  activateVariant(variant);
  return render(
    <NavigationHandoffProvider value={{ navigateTo: jest.fn(async () => true) }}>
      <StatusProvider activeCallId={null} activeUnitId={activeUnitId} onActiveCallChange={jest.fn()}>
        <MapScreen realtime={false} />
      </StatusProvider>
    </NavigationHandoffProvider>
  );
};

beforeEach(() => {
  jest.clearAllMocks();
  setRights({ CanViewPII: true });
  (useLocalSearchParams as jest.Mock).mockReturnValue({});
  useToastStore.setState({ toasts: [] });
  useMapViewStore.getState().reset();
  useMapTrafficPreferenceStore.setState({ traffic: {} });
  useMapMarkersStore.setState({ markers: [], centerLatitude: 40, centerLongitude: -105, zoomLevel: 12, loading: {}, errors: {}, fetchedAt: { markers: 1 }, fetchMarkers: jest.fn(async () => undefined) });
  useCustomMapsStore.setState({ activeLayers: [], layerGeoJSON: {}, fetchActiveLayers: jest.fn(async () => undefined), fetchLayerGeoJSON: jest.fn(async () => null) });
  setRoutes({});
});

afterEach(() => useToastStore.getState().clearToasts());

describe('MapScreen live traffic (§11.1)', () => {
  it('starts with traffic off and remembers the member turning it on', async () => {
    await renderMap('dispatch', null);
    expect(screen.getByTestId('mock-traffic-map-screen-traffic').props.accessibilityLabel).toBe('hidden');
    const button = screen.getByTestId('map-screen-traffic-button');
    expect(button.props.accessibilityState).toEqual({ selected: false });
    // Stacked just above the legend button.
    expect(button.props.accessibilityHint).toBe('right:140');
    await fireEvent.press(button);
    expect(screen.getByTestId('mock-traffic-map-screen-traffic').props.accessibilityLabel).toBe('visible');
    expect(useMapTrafficPreferenceStore.getState().traffic).toEqual({ map: true });
  });

  it('keeps the choice as a device preference: persisted and never wiped on logout', async () => {
    expect(defaultResetRegistry.getPreservedKeys('any')).toContain(MAP_TRAFFIC_STORE_NAME);
    useMapTrafficPreferenceStore.setState({ traffic: { map: true } });
    const { result } = await renderHook(() => useTrafficPreference(TRAFFIC_SURFACES.map.id, TRAFFIC_SURFACES.map.defaultOn));
    expect(result.current[0]).toBe(true);
    const consoleSurface = await renderHook(() => useTrafficPreference(TRAFFIC_SURFACES.dispatchConsole.id, TRAFFIC_SURFACES.dispatchConsole.defaultOn));
    expect(consoleSurface.result.current[0]).toBe(true);
  });
});

describe('MapScreen Unit active-route overlay', () => {
  it('draws the running route, the remaining numbered stops and the next stop’s check-in radius', async () => {
    setRoutes({
      activeInstance: instance(),
      stopDetails: [stop('1', 1, RouteStopStatus.CheckedOut), stop('2', 2, RouteStopStatus.CheckedIn), stop('3', 3, RouteStopStatus.Pending), stop('x', 4, RouteStopStatus.Pending, { RouteInstanceId: 'old' })],
      activePlan: plan(),
    });
    await renderMap('unit', '7');
    expect(mocks.fetchActiveRoute).toHaveBeenCalledWith('7');
    expect(mocks.fetchStopsForInstance).toHaveBeenCalledWith('ri1');
    // A plan detail is loaded: never refetched (another plan may be open on a routes screen).
    expect(mocks.fetchRoutePlan).not.toHaveBeenCalled();
    expect(screen.getByTestId('mock-source-map-screen-route-stops').props.accessibilityLabel).toBe('2');
    expect(screen.getByTestId('mock-source-map-screen-route-line')).toBeTruthy();
    expect(screen.getByTestId('mock-source-map-screen-route-geofence')).toBeTruthy();
  });

  it('shows nothing for another unit’s or a finished route, and not at all outside the routes module', async () => {
    setRoutes({ activeInstance: instance({ UnitId: 9 }), stopDetails: [stop('3', 3, RouteStopStatus.Pending)], activePlan: plan() });
    await renderMap('unit', '7');
    expect(screen.queryByTestId('mock-source-map-screen-route-stops')).toBeNull();
    await screen.unmount();

    setRoutes({ activeInstance: instance({ Status: 2 }), stopDetails: [stop('3', 3, RouteStopStatus.Pending)], activePlan: plan() });
    await renderMap('unit', '7');
    expect(screen.queryByTestId('mock-source-map-screen-route-stops')).toBeNull();
    await screen.unmount();

    jest.clearAllMocks();
    setRoutes({ activeInstance: instance(), stopDetails: [stop('3', 3, RouteStopStatus.Pending)], activePlan: plan() });
    await renderMap('responder', '7');
    expect(screen.queryByTestId('mock-source-map-screen-route-stops')).toBeNull();
    expect(mocks.fetchActiveRoute).not.toHaveBeenCalled();
  });
});

describe('useActiveRouteOverlay', () => {
  it('prefers the live instance directions, loads the plan only when none is loaded, and colours the route', async () => {
    setRoutes({
      activeInstance: instance({ Status: 5 }),
      stopDetails: [stop('2', 2, RouteStopStatus.Pending, { GeofenceRadiusMeters: 30 })],
      directions: { RouteInstanceId: 'ri1', Geometry: JSON.stringify(LIVE_LINE) } as RouteDirectionsResultData,
      routePlans: [{ RoutePlanId: 'rp1', RouteColor: '#123456' } as never],
    });
    const { result, unmount } = await renderHook(() => useActiveRouteOverlay(true, '7'));
    expect(result.current?.line).toEqual(LIVE_LINE);
    expect(result.current?.color).toBe('#123456');
    expect(result.current?.stops.map((entry) => [entry.order, entry.isCurrent])).toEqual([[2, true]]);
    expect(mocks.fetchRoutePlan).not.toHaveBeenCalled();
    await unmount();

    setRoutes({ activeInstance: instance(), stopDetails: [] });
    const fallback = await renderHook(() => useActiveRouteOverlay(true, '7'));
    expect(mocks.fetchRoutePlan).toHaveBeenCalledWith('rp1');
    expect(fallback.result.current?.line).toBeNull();
    expect(fallback.result.current?.color).toBe('#3b82f6');
    await fallback.unmount();

    const disabled = await renderHook(() => useActiveRouteOverlay(false, '7'));
    expect(disabled.result.current).toBeNull();
  });

  it('builds closed geofence rings and numbered stop features', () => {
    const shapes = activeRouteShapes({
      line: null,
      geofence: [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 0],
      ],
      stops: [{ id: 'is2', order: 2, name: 'Stop 2', latitude: 1, longitude: 2, status: 0, isCurrent: true, color: '#9ca3af' }],
    });
    expect(shapes.line).toBeNull();
    expect(shapes.geofence?.geometry).toEqual({
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 0],
        ],
      ],
    });
    expect(shapes.stops.features[0]).toMatchObject({ geometry: { coordinates: [2, 1] }, properties: { label: '2', current: true } });
  });
});
