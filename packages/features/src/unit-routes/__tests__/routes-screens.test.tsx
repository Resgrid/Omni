// The Jest setup must load before @resgrid/ui (gluestack, NativeWind): keep this side-effect import first.
import '../../unit-status/__tests__/test-setup';

import { RouteInstanceStatus, RouteStopStatus, usePoisStore, useRoutesStore, useUnitsStore, useUnitStatusStore } from '@resgrid/data';
import { NavigationHandoffProvider } from '@resgrid/features/contacts';
import { StatusProvider } from '@resgrid/features/status';
import type { PoiResultData, RouteStopContactResultData, UnitResultData } from '@resgrid/models';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { Text } from 'react-native';

import { activateUnitVariant, hidden } from '../../unit-status/__tests__/test-helpers';
import { type RouteMapSlotProps, UnitRoutesMapProvider } from '../map-slot';
import RouteActiveScreen from '../screens/route-active';
import RouteDirectionsScreen from '../screens/route-directions';
import RouteHistoryScreen from '../screens/route-history';
import RouteInstanceScreen from '../screens/route-instance';
import RoutePoiScreen from '../screens/route-poi';
import RouteStartScreen from '../screens/route-start';
import RouteStopScreen from '../screens/route-stop';
import RouteStopContactScreen from '../screens/route-stop-contact';
import RoutesHomeScreen from '../screens/routes-home';
import { detailStop, directions, instance, plan, planDetail } from './fixtures';

const navigateTo = jest.fn(async () => true);
const mapCalls: RouteMapSlotProps[] = [];
const renderMap = (props: RouteMapSlotProps) => {
  mapCalls.push(props);
  return <Text testID={`map-${props.kind}`}>{`${props.stops.length} stops`}</Text>;
};

const wrap = (node: React.ReactElement, activeUnitId: string | null = '10') =>
  render(
    <NavigationHandoffProvider value={{ navigateTo }}>
      <UnitRoutesMapProvider renderMap={renderMap}>
        <StatusProvider activeUnitId={activeUnitId}>{node}</StatusProvider>
      </UnitRoutesMapProvider>
    </NavigationHandoffProvider>
  );

const store = {
  fetchAllRoutePlans: jest.fn(async () => undefined),
  fetchActiveRoute: jest.fn(async () => undefined),
  fetchRoutePlan: jest.fn(async () => undefined),
  fetchRouteProgress: jest.fn(async () => undefined),
  fetchStopsForInstance: jest.fn(async () => undefined),
  fetchDeviations: jest.fn(async () => undefined),
  fetchDirections: jest.fn(async () => undefined),
  fetchRouteHistory: jest.fn(async () => undefined),
  fetchInstanceDetail: jest.fn(async () => null),
  fetchStopContact: jest.fn(async () => null),
  startRouteInstance: jest.fn(async () => true),
  endRouteInstance: jest.fn(async () => true),
  cancelRouteInstance: jest.fn(async () => true),
  pauseRouteInstance: jest.fn(async () => true),
  resumeRouteInstance: jest.fn(async () => true),
  ackDeviation: jest.fn(async () => true),
  updateNotes: jest.fn(async () => true),
  checkIn: jest.fn(async () => ({ outcome: 'sent' as const, id: 'evt-1' })),
  checkOut: jest.fn(async () => ({ outcome: 'queued' as const, id: 'evt-2' })),
  skip: jest.fn(async () => ({ outcome: 'sent' as const, id: 'evt-3' })),
};

beforeEach(() => {
  activateUnitVariant();
  navigateTo.mockClear();
  mapCalls.length = 0;
  Object.values(store).forEach((fn) => fn.mockClear());
  jest.mocked(useLocalSearchParams).mockReturnValue({});
  useRoutesStore.setState({
    ...store,
    routePlans: [],
    activePlan: null,
    activeInstance: null,
    instanceStops: [],
    stopDetails: [],
    directions: null,
    deviations: [],
    routeHistory: [],
    stopContactsById: {},
    instanceDetailsById: {},
    loading: {},
    errors: {},
    actionError: null,
  });
  useUnitsStore.setState({ units: [{ UnitId: '10', Name: 'Engine 10' } as UnitResultData, { UnitId: '11', Name: 'Truck 11' } as UnitResultData], fetchUnits: jest.fn(async () => undefined) });
  usePoisStore.setState({ pois: [], poiTypes: [], poiDetailsById: {}, loading: {}, fetchPois: jest.fn(async () => undefined), fetchPoiTypes: jest.fn(async () => undefined), fetchPoi: jest.fn(async () => null) });
});

describe('RoutesHomeScreen', () => {
  it('lists active plans with the unit’s own marked and opens a plan to start it', () => {
    useRoutesStore.setState({ routePlans: [plan('p1', { UnitId: 10 }), plan('p2', { UnitId: 11 }), plan('p3', { RouteStatus: 3, Name: 'Archived' })] });
    wrap(<RoutesHomeScreen />);
    expect(store.fetchAllRoutePlans).toHaveBeenCalled();
    expect(store.fetchActiveRoute).toHaveBeenCalledWith('10');
    expect(screen.getByTestId('route-card-p1-mine')).toBeTruthy();
    expect(within(screen.getByTestId('route-card-p2')).getByText('Truck 11')).toBeTruthy();
    expect(screen.queryByText('Archived')).toBeNull();
    fireEvent.press(screen.getByTestId('route-card-p2'));
    expect(router.push).toHaveBeenCalledWith('/routes/start?planId=p2');
  });

  it('searches by name and unit, and sends the running plan to the active route', () => {
    useRoutesStore.setState({ routePlans: [plan('p1', { Name: 'North loop' }), plan('p2', { Name: 'South loop', UnitId: 11 })], activeInstance: instance('ri-1', { RoutePlanId: 'p1' }) });
    wrap(<RoutesHomeScreen />);
    fireEvent.changeText(screen.getByTestId('route-plans-list-search'), 'truck');
    expect(screen.queryByTestId('route-card-p1')).toBeNull();
    expect(screen.getByTestId('route-card-p2')).toBeTruthy();
    fireEvent.press(screen.getByTestId('route-plans-list-active-banner'));
    expect(router.push).toHaveBeenCalledWith('/routes/active?planId=p1&instanceId=ri-1');
  });

  it('shows the empty state when there are no plans', () => {
    wrap(<RoutesHomeScreen />);
    expect(screen.getByText('routes.no_routes')).toBeTruthy();
  });
});

describe('RouteStartScreen', () => {
  it('shows the plan with its stops in order, the map and the start button, and starts for this unit', async () => {
    useRoutesStore.setState({ activePlan: planDetail('p1') });
    store.startRouteInstance.mockImplementation(async () => {
      useRoutesStore.setState({ activeInstance: instance('ri-9') });
      return true;
    });
    wrap(<RouteStartScreen planId="p1" />);
    expect(store.fetchRoutePlan).toHaveBeenCalledWith('p1');
    const stops = screen.getAllByTestId(/^route-start-stop-/).map((row) => row.props.testID);
    expect(stops).toEqual(['route-start-stop-s1', 'route-start-stop-s2']);
    expect(screen.getByTestId('map-plan')).toHaveTextContent('2 stops');
    expect(mapCalls[0].line?.type).toBe('LineString');

    fireEvent.press(screen.getByTestId('route-start-contact-s1'));
    expect(router.push).toHaveBeenCalledWith('/routes/stop/contact?stopId=s1');

    fireEvent.press(screen.getByTestId('route-start-button'));
    await waitFor(() => expect(store.startRouteInstance).toHaveBeenCalledWith('p1', 10));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/routes/active?planId=p1&instanceId=ri-9'));
  });

  it('cannot start a plan assigned to another unit', () => {
    useRoutesStore.setState({ activePlan: planDetail('p1', { UnitId: 11 }) });
    wrap(<RouteStartScreen planId="p1" />);
    expect(screen.getByTestId('route-start-assigned-elsewhere')).toBeTruthy();
    expect(screen.queryByTestId('route-start-button')).toBeNull();
  });

  it('cannot start while another route runs on the unit', () => {
    useRoutesStore.setState({ activePlan: planDetail('p1'), activeInstance: instance('ri-1', { RoutePlanId: 'p7', RoutePlanName: 'Other' }) });
    wrap(<RouteStartScreen planId="p1" />);
    expect(screen.getByTestId('route-start-other-active')).toBeTruthy();
    expect(screen.queryByTestId('route-start-button')).toBeNull();
  });

  it('reads the plan id from the route params and shows the server error when the plan cannot load', () => {
    jest.mocked(useLocalSearchParams).mockReturnValue({ planId: 'p5' });
    useRoutesStore.setState({ errors: { plan: { code: 'network', messageKey: 'errors.data.network' } } });
    wrap(<RouteStartScreen />);
    expect(store.fetchRoutePlan).toHaveBeenCalledWith('p5');
    expect(screen.getByText('errors.data.network')).toBeTruthy();
  });
});

describe('RouteActiveScreen', () => {
  const activeState = () =>
    useRoutesStore.setState({
      activeInstance: instance('ri-1'),
      stopDetails: [detailStop('a', 1, RouteStopStatus.CheckedOut), detailStop('b', 2, RouteStopStatus.Pending), detailStop('c', 3, RouteStopStatus.Pending)],
      routePlans: [plan('p1')],
      deviations: [
        {
          RouteDeviationId: 'd1',
          RouteInstanceId: 'ri-1',
          DetectedOn: '2026-11-01T10:00:00Z',
          Latitude: 0,
          Longitude: 0,
          DeviationDistanceMeters: 420,
          DeviationType: 0,
          IsAcknowledged: false,
          AcknowledgedByUserId: null,
          AcknowledgedOn: null,
          Notes: 'Detour',
        },
        {
          RouteDeviationId: 'd2',
          RouteInstanceId: 'other',
          DetectedOn: '2026-11-01T11:00:00Z',
          Latitude: 0,
          Longitude: 0,
          DeviationDistanceMeters: 10,
          DeviationType: 1,
          IsAcknowledged: false,
          AcknowledgedByUserId: null,
          AcknowledgedOn: null,
          Notes: null,
        },
      ],
    });

  it('offers the routes list when the unit runs no route', () => {
    wrap(<RouteActiveScreen pollMs={0} />);
    expect(screen.getByTestId('route-active-none')).toBeTruthy();
    fireEvent.press(screen.getByTestId('route-active-to-list'));
    expect(router.replace).toHaveBeenCalledWith('/routes');
  });

  it('shows progress, this route’s deviation and the current stop, and refreshes the instance', () => {
    activeState();
    wrap(<RouteActiveScreen pollMs={0} />);
    expect(store.fetchRouteProgress).toHaveBeenCalledWith('ri-1', { bypassCache: false });
    expect(store.fetchStopsForInstance).toHaveBeenCalledWith('ri-1');
    expect(store.fetchDirections).toHaveBeenCalledWith('ri-1');
    expect(screen.getByTestId('route-active-progress')).toHaveTextContent('routes.progress:33');
    expect(screen.getByTestId('route-deviation-banner-type')).toHaveTextContent('routes.deviation_type_off_route');
    expect(screen.getByTestId('route-active-current')).toBeTruthy();
    expect(within(screen.getByTestId('route-active-current')).getByText('Stop 2')).toBeTruthy();
    expect(mapCalls[mapCalls.length - 1]).toMatchObject({ kind: 'active', showUserLocation: true });
    expect(mapCalls[mapCalls.length - 1].geofence).not.toBeNull();
  });

  it('checks in at the current stop through the outbox and tells the crew when a write is queued', async () => {
    activeState();
    wrap(<RouteActiveScreen pollMs={0} />);
    fireEvent.press(screen.getByTestId('route-active-current-checkIn'));
    await waitFor(() => expect(store.checkIn).toHaveBeenCalledWith('b'));
  });

  it('asks for a skip reason and skips with it', async () => {
    activeState();
    wrap(<RouteActiveScreen pollMs={0} />);
    fireEvent.press(screen.getByTestId('route-active-current-skip'));
    fireEvent.changeText(screen.getByTestId('skip-stop-dialog-reason', hidden), 'Gate locked');
    fireEvent.press(screen.getByTestId('skip-stop-dialog-confirm', hidden));
    await waitFor(() => expect(store.skip).toHaveBeenCalledWith('b', 'Gate locked'));
  });

  it('acknowledges a deviation', async () => {
    activeState();
    wrap(<RouteActiveScreen pollMs={0} />);
    fireEvent.press(screen.getByTestId('route-deviation-banner-ack'));
    await waitFor(() => expect(store.ackDeviation).toHaveBeenCalledWith('d1'));
  });

  it('ends the route after confirming and returns to the list', async () => {
    activeState();
    wrap(<RouteActiveScreen pollMs={0} />);
    fireEvent.press(screen.getByTestId('route-active-end'));
    fireEvent.press(screen.getByTestId('route-active-confirm-confirm', hidden));
    await waitFor(() => expect(store.endRouteInstance).toHaveBeenCalledWith('ri-1'));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/routes'));
  });

  it('pauses, and offers resume on a paused route', async () => {
    activeState();
    const { unmount } = wrap(<RouteActiveScreen pollMs={0} />);
    fireEvent.press(screen.getByTestId('route-active-pause'));
    await waitFor(() => expect(store.pauseRouteInstance).toHaveBeenCalledWith('ri-1'));
    unmount();
    useRoutesStore.setState({ activeInstance: instance('ri-1', { Status: RouteInstanceStatus.Paused }) });
    wrap(<RouteActiveScreen pollMs={0} />);
    expect(screen.getByTestId('route-active-paused')).toBeTruthy();
    fireEvent.press(screen.getByTestId('route-active-resume'));
    await waitFor(() => expect(store.resumeRouteInstance).toHaveBeenCalledWith('ri-1'));
  });
});

describe('RouteDirectionsScreen', () => {
  it('shows the server route summary and waypoints, and hands the next stop to the navigation app', async () => {
    useRoutesStore.setState({ activeInstance: instance('ri-1'), directions: directions() });
    wrap(<RouteDirectionsScreen />);
    expect(store.fetchDirections).toHaveBeenCalledWith('ri-1');
    expect(screen.getByTestId('route-stats-distance')).toHaveTextContent(/4\.2 km/);
    expect(screen.getByTestId('route-directions-waypoint-a')).toBeTruthy();
    expect(screen.queryByTestId('route-directions-navigate-a')).toBeNull();
    fireEvent.press(screen.getByTestId('route-directions-open-next'));
    await waitFor(() => expect(navigateTo).toHaveBeenCalledWith({ latitude: 39.5, longitude: -119.78, label: 'Stop 2' }));
    expect(mapCalls[mapCalls.length - 1].line?.type).toBe('LineString');
  });

  it('says so when there are no directions', () => {
    useRoutesStore.setState({ activeInstance: instance('ri-1') });
    wrap(<RouteDirectionsScreen />);
    expect(screen.getByTestId('route-directions-none')).toBeTruthy();
  });
});

describe('RouteStopScreen', () => {
  it('labels the stop with Core’s priority and type, links the contact by plan stop id and saves notes', async () => {
    useRoutesStore.setState({ activeInstance: instance('ri-1'), stopDetails: [detailStop('b', 2, RouteStopStatus.CheckedIn, { ContactId: 'c1', ContactName: 'Pat Lee', InstanceNotes: 'old' })] });
    jest.mocked(useLocalSearchParams).mockReturnValue({ id: 'b' });
    wrap(<RouteStopScreen />);
    expect(screen.getByTestId('route-stop-priority')).toHaveTextContent('routes.priority_high');
    expect(screen.getByTestId('route-stop-type')).toHaveTextContent('unit_routes.stop_type.station');
    expect(screen.getByTestId('route-stop-status')).toHaveTextContent('routes.in_progress');
    fireEvent.press(screen.getByTestId('route-stop-contact'));
    expect(router.push).toHaveBeenCalledWith('/routes/stop/contact?stopId=rs-b');
    fireEvent.changeText(screen.getByTestId('route-stop-notes'), 'Hydrant painted');
    fireEvent.press(screen.getByTestId('route-stop-save-notes'));
    await waitFor(() => expect(store.updateNotes).toHaveBeenCalledWith('b', 'Hydrant painted'));
    fireEvent.press(screen.getByTestId('route-stop-actions-checkOut'));
    await waitFor(() => expect(store.checkOut).toHaveBeenCalledWith('b'));
  });

  it('explains when the stop is not on the active route', () => {
    wrap(<RouteStopScreen stopId="zzz" />);
    expect(screen.getByTestId('route-stop-missing')).toBeTruthy();
  });
});

describe('RouteStopContactScreen', () => {
  const contact: RouteStopContactResultData = {
    ContactId: 'c1',
    RouteStopId: 'rs-b',
    StopName: 'Stop 2',
    ContactType: 0,
    FirstName: 'Pat',
    LastName: 'Lee',
    CompanyName: null,
    Email: 'pat@example.com',
    HomePhoneNumber: null,
    CellPhoneNumber: '555-0100',
    OfficePhoneNumber: null,
    Website: null,
    LocationGpsCoordinates: '39.5,-119.8',
    EntranceGpsCoordinates: '39.51,-119.81',
    ExitGpsCoordinates: null,
    LocationGeofence: null,
    Description: 'Gate code at the office',
  };

  it('reads the contact by plan stop id and shows name, phone and the location points on the map', async () => {
    store.fetchStopContact.mockImplementation(async () => {
      useRoutesStore.setState({ stopContactsById: { 'rs-b': contact } });
      return contact as never;
    });
    jest.mocked(useLocalSearchParams).mockReturnValue({ stopId: 'rs-b' });
    wrap(<RouteStopContactScreen />);
    await waitFor(() => expect(screen.getByTestId('route-stop-contact-name')).toHaveTextContent('Pat Lee'));
    expect(store.fetchStopContact).toHaveBeenCalledWith('rs-b', { bypassCache: true });
    expect(screen.getByText('555-0100')).toBeTruthy();
    expect(screen.getByTestId('map-contact')).toHaveTextContent('2 stops');
  });

  it('says when the stop has no contact', async () => {
    wrap(<RouteStopContactScreen stopId="rs-x" />);
    await waitFor(() => expect(screen.getByTestId('route-stop-contact-missing')).toBeTruthy());
  });
});

describe('route history', () => {
  it('lists past runs of the plan and opens one', () => {
    useRoutesStore.setState({ routeHistory: [instance('ri-1', { Status: RouteInstanceStatus.Completed, StopsCompleted: 3, StopsTotal: 3, TotalDistanceMeters: 5000 })], routePlans: [plan('p1', { Name: 'North loop' })] });
    wrap(<RouteHistoryScreen planId="p1" />);
    expect(store.fetchRouteHistory).toHaveBeenCalledWith('p1');
    expect(screen.getByText('routes.history · North loop')).toBeTruthy();
    expect(within(screen.getByTestId('route-history-ri-1')).getByText('routes.completed')).toBeTruthy();
    fireEvent.press(screen.getByTestId('route-history-ri-1'));
    expect(router.push).toHaveBeenCalledWith('/routes/history/instance/ri-1');
  });

  it('shows a past instance with its stops without touching the live route', async () => {
    store.fetchInstanceDetail.mockImplementation(async () => {
      useRoutesStore.setState({
        instanceDetailsById: {
          'ri-7': {
            progress: { Instance: instance('ri-7', { Status: RouteInstanceStatus.Cancelled }), TotalStops: 2, CompletedStops: 1, SkippedStops: 1, PendingStops: 0, Stops: [] },
            stops: [detailStop('x', 1, RouteStopStatus.CheckedOut, { CheckInOn: '2026-11-01T09:10:00Z' }), detailStop('y', 2, RouteStopStatus.Skipped, { SkipReason: 'Road closed' })],
          },
        },
      });
      return null;
    });
    wrap(<RouteInstanceScreen instanceId="ri-7" />);
    await waitFor(() => expect(screen.getByTestId('route-instance-status')).toHaveTextContent('unit_routes.instance_status.cancelled'));
    expect(screen.getByText('routes.skip_reason: Road closed')).toBeTruthy();
    expect(screen.getByTestId('route-stats-stops')).toHaveTextContent(/^1\/2/);
    expect(useRoutesStore.getState().activeInstance).toBeNull();
  });
});

describe('RoutePoiScreen', () => {
  const poi: PoiResultData = {
    PoiId: 5,
    PoiTypeId: 2,
    PoiTypeName: 'Hospital',
    Name: 'General',
    Address: '9 Care Way',
    Note: 'ER entrance north',
    Latitude: 39.6,
    Longitude: -119.7,
    Color: '#ff0000',
    ImagePath: '',
    Marker: '',
    IsDestination: true,
  };

  it('shows the POI, hands directions to the navigation app and sets it as a destination via the status sheet', async () => {
    usePoisStore.setState({ pois: [poi], fetchPoi: jest.fn(async () => poi) });
    useUnitStatusStore.setState({ destinationsByUnit: {}, fetchDestinationData: jest.fn(async () => undefined), fetchCurrentStatus: jest.fn(async () => undefined) });
    jest.mocked(useLocalSearchParams).mockReturnValue({ id: '5' });
    wrap(<RoutePoiScreen />);
    expect(screen.getAllByText('General').length).toBeGreaterThan(0);
    expect(screen.getByText('routes.poi_address: 9 Care Way')).toBeTruthy();
    expect(screen.getByTestId('map-poi')).toHaveTextContent('1 stops');
    fireEvent.press(screen.getByTestId('route-poi-directions'));
    await waitFor(() => expect(navigateTo).toHaveBeenCalledWith({ latitude: 39.6, longitude: -119.7, label: 'General' }));
    fireEvent.press(screen.getByTestId('route-poi-set-destination'));
    await waitFor(() => expect(screen.getByTestId('unit-status-sheet', hidden)).toBeTruthy());
  });

  it('hides "Set destination" for a POI that is not a destination', async () => {
    const fetchPoi = jest.fn(async () => ({ ...poi, IsDestination: false }));
    usePoisStore.setState({ pois: [{ ...poi, IsDestination: false }], fetchPoi });
    wrap(<RoutePoiScreen poiId={5} />);
    await act(async () => {
      await fetchPoi.mock.results[0]?.value;
    });
    expect(fetchPoi).toHaveBeenCalledWith(5);
    expect(screen.queryByTestId('route-poi-set-destination')).toBeNull();
  });
});
