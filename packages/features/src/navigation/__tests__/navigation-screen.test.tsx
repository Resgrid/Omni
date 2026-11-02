// The Jest setup must load before @resgrid/ui (gluestack, NativeWind): keep this side-effect import first.
import './test-setup';

import { useRoutesStore, useUnitsStore } from '@resgrid/data';
import { NavigationHandoffProvider } from '@resgrid/features/contacts';
import { StatusProvider } from '@resgrid/features/status';
import { encodePolyline, type LngLat, type NavigationRouteResult, parseNavRoute, resetNavigationServicesForTests, resetNavigationStoreForTests, setNavigationServices, useNavigationStore } from '@resgrid/navigation';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';
import React from 'react';

import { findOnSceneStatus } from '../components/arrival-panels';
import { navigationRoutes, readNavigationParams, requestPointNavigation, takePointNavigationRequest } from '../routes';
import NavigationScreen from '../screens/navigation-screen';

const { mockNavigationAvailability } = jest.requireMock('../hooks/use-in-app-navigation') as { mockNavigationAvailability: { value: boolean } };

const START: LngLat = [-121.5, 38.5];
const EAST: LngLat[] = Array.from({ length: 6 }, (_, i) => [START[0] + i * 0.001, START[1]] as LngLat);
const END = EAST[EAST.length - 1];

const routeObject = (legs: { stopId: string; points: LngLat[] }[] = [{ stopId: 's1', points: EAST }]) => ({
  distance: 500,
  duration: 60,
  legs: legs.map((leg) => ({
    distance: 500,
    duration: 60,
    steps: [
      {
        distance: 500,
        duration: 60,
        name: 'Main St',
        geometry: encodePolyline(leg.points),
        maneuver: { type: 'depart', location: leg.points[0], instruction: 'Head east' },
        voiceInstructions: [{ distanceAlongGeometry: 500, announcement: 'Head east on Main St' }],
        bannerInstructions: [{ distanceAlongGeometry: 500, primary: { text: 'Main St', type: 'arrive', modifier: null } }],
      },
      {
        distance: 0,
        duration: 0,
        name: 'Main St',
        geometry: encodePolyline([leg.points[leg.points.length - 1], leg.points[leg.points.length - 1]]),
        maneuver: { type: 'arrive', location: leg.points[leg.points.length - 1] },
      },
    ],
  })),
});

const result = (overrides: Partial<NavigationRouteResult> = {}): NavigationRouteResult => ({
  route: parseNavRoute(routeObject()),
  provider: 'valhalla',
  attribution: '© OpenStreetMap',
  isTrafficAware: false,
  vehicleRestricted: true,
  vehicleLimitsEnforced: 'all',
  navigationAvailable: true,
  incidents: [],
  ...overrides,
});

const toCall = jest.fn();
const toRouteStops = jest.fn();
const toPoint = jest.fn();
const openExternal = jest.fn(async () => true);
const navigateTo = jest.fn(async () => true);
let acknowledged = true;

const position = (point: LngLat, speed = 10) => ({ latitude: point[1], longitude: point[0], heading: 90, speed, accuracy: 5, timestamp: Date.now() });

beforeEach(() => {
  mockNavigationAvailability.value = true;
  acknowledged = true;
  toCall.mockReset().mockResolvedValue(result());
  toRouteStops.mockReset();
  toPoint.mockReset().mockResolvedValue(result());
  resetNavigationServicesForTests();
  resetNavigationStoreForTests();
  setNavigationServices({
    routes: { toCall, toRouteStops, toPoint },
    currentFix: () => position(START),
    preferences: {
      isMuted: () => false,
      setMuted: () => undefined,
      hasAcknowledgedSafetyNotice: () => acknowledged,
      acknowledgeSafetyNotice: () => {
        acknowledged = true;
      },
    },
  });
  jest.mocked(useLocalSearchParams).mockReturnValue({});
  useUnitsStore.setState({ units: [], unitInfos: [], unitTypeStatuses: [] });
  useRoutesStore.setState({ instanceStops: [], stopDetails: [] });
});

const wrap = async () =>
  render(
    <NavigationHandoffProvider value={{ navigateTo, openExternal }}>
      <StatusProvider activeUnitId="10">
        <NavigationScreen />
      </StatusProvider>
    </NavigationHandoffProvider>
  );

describe('navigation routes', () => {
  it('builds and reads /navigate links and hands a point over in memory', () => {
    expect(navigationRoutes.toCall(12)).toBe('/navigate?callId=12');
    expect(navigationRoutes.toRouteStops('ri-1')).toBe('/navigate?instanceId=ri-1');
    expect(() => navigationRoutes.toCall(-1)).toThrow();
    expect(readNavigationParams({ callId: '12' })).toEqual({ kind: 'call', callId: 12 });
    expect(readNavigationParams({ instanceId: 'ri-1' })).toEqual({ kind: 'route', routeInstanceId: 'ri-1' });
    expect(readNavigationParams({ callId: 'abc' })).toBeNull();
    requestPointNavigation({ latitude: 1, longitude: 2, name: 'Hydrant' });
    expect(takePointNavigationRequest()).toEqual({ latitude: 1, longitude: 2, name: 'Hydrant' });
    expect(takePointNavigationRequest()).toBeNull();
  });

  it('finds the On Scene option in the unit’s own status set', () => {
    const sets = [
      { UnitType: '0', StatusId: 0, Statuses: [{ Id: 3, Text: 'On Scene', BaseType: 3 }] },
      {
        UnitType: 'Engine',
        StatusId: 9,
        Statuses: [
          { Id: 41, Text: 'Arrived', BaseType: 3 },
          { Id: 42, Text: 'Clear', BaseType: 7 },
        ],
      },
    ] as never;
    expect(findOnSceneStatus(sets, { Type: 'Engine', CustomStatusSetId: 9 })?.Id).toBe(41);
    expect(findOnSceneStatus(sets, { Type: 'Tanker', CustomStatusSetId: 0 })?.Id).toBe(3);
  });
});

describe('NavigationScreen', () => {
  it('says in-app navigation is not available where the install cannot navigate', async () => {
    mockNavigationAvailability.value = false;
    jest.mocked(useLocalSearchParams).mockReturnValue({ callId: '12' });
    await wrap();
    expect(screen.getByText('navigation.error.unavailable')).toBeTruthy();
    expect(toCall).not.toHaveBeenCalled();
  });

  it('routes to the call for the active unit, guides, and ends back to the previous screen', async () => {
    jest.mocked(useLocalSearchParams).mockReturnValue({ callId: '12' });
    await wrap();
    await waitFor(() => expect(screen.getByTestId('navigation-session')).toBeTruthy());
    expect(toCall).toHaveBeenCalledWith(expect.objectContaining({ callId: 12, unitId: 10 }));
    expect(screen.getByTestId('navigation-banner-primary')).toHaveTextContent('Main St');
    expect(screen.getByTestId('mock-traffic')).toBeTruthy();
    expect(screen.getByTestId('navigation-session-attribution')).toHaveTextContent(/OpenStreetMap · navigation\.vehicle_limits_all/);
    await fireEvent.press(screen.getByTestId('navigation-trip-bar-external'));
    await waitFor(() => expect(openExternal).toHaveBeenCalledWith(expect.objectContaining({ latitude: END[1], longitude: END[0] })));
    expect(navigateTo).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('navigation-trip-bar-end'));
    expect(useNavigationStore.getState().status).toBe('idle');
    expect(router.back).toHaveBeenCalled();
  });

  it('shows the incidents ahead on the route and drops each once passed', async () => {
    const crash = { Type: 'accident', Description: 'Two vehicles', Impact: 'major', Latitude: EAST[2][1], Longitude: EAST[2][0], Closed: false };
    const closure = { Type: 'road_closure', Description: null, Impact: 'critical', Latitude: EAST[4][1], Longitude: EAST[4][0], Closed: true };
    toCall.mockResolvedValue(result({ incidents: [closure, crash] }));
    jest.mocked(useLocalSearchParams).mockReturnValue({ callId: '12' });
    await wrap();
    await waitFor(() => expect(screen.getByTestId('navigation-session')).toBeTruthy());
    await act(async () => useNavigationStore.getState().handleFix(position(EAST[0])));
    expect(screen.getByTestId('navigation-session-incidents-0')).toHaveTextContent(/navigation.incident.accident/);
    expect(screen.getByTestId('navigation-session-incidents-1')).toHaveTextContent(/navigation.incident.road_closure/);
    await act(async () => useNavigationStore.getState().handleFix(position(EAST[3])));
    expect(screen.getByTestId('navigation-session-incidents-0')).toHaveTextContent(/navigation.incident.road_closure/);
    expect(screen.queryByTestId('navigation-session-incidents-1')).toBeNull();
  });

  it('explains a route the server will not navigate and offers the crew’s app', async () => {
    toCall.mockResolvedValue(result({ navigationAvailable: false, provider: 'osrm' }));
    jest.mocked(useLocalSearchParams).mockReturnValue({ callId: '12' });
    await wrap();
    await waitFor(() => expect(screen.getByTestId('navigation-error')).toBeTruthy());
    expect(screen.getByText('navigation.error.unavailable')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('navigation-retry'));
    expect(toCall).toHaveBeenCalledTimes(2);
  });

  it('shows the safety notice once', async () => {
    acknowledged = false;
    jest.mocked(useLocalSearchParams).mockReturnValue({ callId: '12' });
    await wrap();
    await waitFor(() => expect(screen.getByTestId('navigation-session-safety-notice')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('navigation-session-safety-ok'));
    expect(acknowledged).toBe(true);
  });

  it('offers the unit’s On Scene status on arrival at a call', async () => {
    useUnitsStore.setState({
      units: [{ UnitId: '10', Name: 'E1', Type: 'Engine', CustomStatusSetId: '9' }] as never,
      unitTypeStatuses: [{ UnitType: 'Engine', StatusId: 9, Statuses: [{ Id: 41, Text: 'Arrived', BaseType: 3 }] }] as never,
    });
    jest.mocked(useLocalSearchParams).mockReturnValue({ callId: '12' });
    await wrap();
    await waitFor(() => expect(screen.getByTestId('navigation-session')).toBeTruthy());
    await act(async () => useNavigationStore.getState().handleFix(position(END)));
    expect(screen.getByTestId('navigation-arrival-call')).toBeTruthy();
    expect(screen.getByTestId('navigation-arrival-on-scene')).toHaveTextContent('navigation.arrival.set_status:Arrived');
    await fireEvent.press(screen.getByTestId('navigation-arrival-call-not-yet'));
    expect(useNavigationStore.getState().status).toBe('navigating');
  });

  it('checks in by itself after standing still at a route stop, unless cancelled, then drives on', async () => {
    jest.useFakeTimers();
    try {
      const geofence = jest.fn(async () => true);
      const checkOut = jest.fn(async () => ({ outcome: 'sent' as const, id: 'w1' }));
      useRoutesStore.setState({ performGeofenceCheckIn: geofence, checkOut, instanceStops: [{ RouteInstanceStopId: 'is1', Status: 0 }] as never });
      toRouteStops.mockResolvedValue(
        result({
          route: parseNavRoute(
            routeObject([
              { stopId: 's1', points: EAST.slice(0, 3) },
              { stopId: 's2', points: EAST.slice(2) },
            ])
          ),
          legs: [
            { RouteStopId: 's1', RouteInstanceStopId: 'is1', Name: 'Stop 1', DistanceMeters: 200, DurationSeconds: 30, OffsetSeconds: 30, EtaUtc: null },
            { RouteStopId: 's2', RouteInstanceStopId: 'is2', Name: 'Stop 2', DistanceMeters: 300, DurationSeconds: 30, OffsetSeconds: 60, EtaUtc: null },
          ],
        })
      );
      jest.mocked(useLocalSearchParams).mockReturnValue({ instanceId: 'ri-1' });
      await wrap();
      await waitFor(() => expect(screen.getByTestId('navigation-session')).toBeTruthy());
      await act(async () => useNavigationStore.getState().handleFix(position(EAST[2], 0)));
      expect(screen.getByTestId('navigation-arrival-stop')).toBeTruthy();
      expect(screen.getByTestId('navigation-arrival-auto-check-in')).toHaveTextContent(/navigation.arrival.auto_check_in:10/);
      await act(async () => {
        jest.advanceTimersByTime(10_000);
      });
      expect(geofence).toHaveBeenCalledWith(10, EAST[2][1], EAST[2][0]);

      await act(async () => useRoutesStore.setState({ instanceStops: [{ RouteInstanceStopId: 'is1', Status: 1 }] as never }));
      await fireEvent.press(screen.getByTestId('navigation-arrival-continue'));
      await waitFor(() => expect(checkOut).toHaveBeenCalledWith('is1', { latitude: EAST[2][1], longitude: EAST[2][0] }));
      expect(useNavigationStore.getState()).toMatchObject({ status: 'navigating', activeLegIndex: 1 });
    } finally {
      jest.useRealTimers();
    }
  });

  it('does not check in by itself once the crew cancels', async () => {
    jest.useFakeTimers();
    try {
      const geofence = jest.fn(async () => true);
      useRoutesStore.setState({ performGeofenceCheckIn: geofence, instanceStops: [{ RouteInstanceStopId: 'is1', Status: 0 }] as never });
      toRouteStops.mockResolvedValue(result({ legs: [{ RouteStopId: 's1', RouteInstanceStopId: 'is1', Name: 'Stop 1', DistanceMeters: 500, DurationSeconds: 60, OffsetSeconds: 60, EtaUtc: null }] }));
      jest.mocked(useLocalSearchParams).mockReturnValue({ instanceId: 'ri-1' });
      await wrap();
      await waitFor(() => expect(screen.getByTestId('navigation-session')).toBeTruthy());
      await act(async () => useNavigationStore.getState().handleFix(position(END, 0)));
      await fireEvent.press(screen.getByTestId('navigation-arrival-auto-cancel'));
      await act(async () => {
        jest.advanceTimersByTime(15_000);
      });
      expect(geofence).not.toHaveBeenCalled();
      expect(screen.getByTestId('navigation-arrival-check-in')).toBeTruthy();
    } finally {
      jest.useRealTimers();
    }
  });

  it('treats the live route’s last leg to the route end (no stop) as the end: no check-in, only ending the guidance', async () => {
    jest.useFakeTimers();
    try {
      const geofence = jest.fn(async () => true);
      useRoutesStore.setState({ performGeofenceCheckIn: geofence, instanceStops: [] as never });
      toRouteStops.mockResolvedValue(result({ legs: [{ RouteStopId: null, RouteInstanceStopId: null, Name: 'Station 1', DistanceMeters: 500, DurationSeconds: 60, OffsetSeconds: 60, EtaUtc: null }] }));
      jest.mocked(useLocalSearchParams).mockReturnValue({ instanceId: 'ri-1' });
      await wrap();
      await waitFor(() => expect(screen.getByTestId('navigation-session')).toBeTruthy());
      await act(async () => useNavigationStore.getState().handleFix(position(END, 0)));
      expect(screen.getByTestId('navigation-arrival-route-end')).toHaveTextContent(/navigation.arrival.at/);
      expect(screen.queryByTestId('navigation-arrival-check-in')).toBeNull();
      await act(async () => {
        jest.advanceTimersByTime(15_000);
      });
      expect(geofence).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });
});
