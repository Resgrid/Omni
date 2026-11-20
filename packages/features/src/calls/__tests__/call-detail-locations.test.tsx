import './test-setup';

import type { SecurityView } from '@resgrid/auth';
import { getActiveVariant } from '@resgrid/config';
import { RouteInstanceStatus, useRoutesStore, useUnitsStore } from '@resgrid/data';
import type { CallExtraDataResultData, CallRouteInstanceResultData, CallRoutePlanResultData } from '@resgrid/models';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import React from 'react';
import { Text } from 'react-native';

import { CallInfoPanel } from '../components/detail/call-info-panel';
import { CallMapSection } from '../components/detail/call-map-section';
import { CallRoutePanel } from '../components/detail/call-route-panel';
import { registerBuiltInCallDetailTabs } from '../detail-tabs/built-in-tabs';
import { type CallDetailTabContext, resolveCallDetailTabs } from '../detail-tabs/registry';
import { registerCallFormHookPoints, resetCallFormHookPointsForTests } from '../hook-points';
import { activateVariant, makeCall } from './test-utils';

// Core M0322 on the call detail: the location POI, a free destination, the route and its runs.
const run = (RouteInstanceId: string, overrides: Partial<CallRouteInstanceResultData> = {}): CallRouteInstanceResultData => ({
  RouteInstanceId,
  RoutePlanId: 'rp-1',
  RoutePlanName: 'Hydrant loop',
  UnitId: 7,
  UnitName: 'Engine 7',
  Status: RouteInstanceStatus.InProgress,
  StopsCompleted: 2,
  StopsTotal: 5,
  ActualStartOn: '2026-11-19T09:00:00Z',
  ActualEndOn: null,
  StartReachedOn: null,
  ...overrides,
});

// SAFETY: the route panel and the tab registry read only the route runs from the extra data.
const extraWith = (runs: CallRouteInstanceResultData[]): CallExtraDataResultData => ({ RouteInstances: runs }) as CallExtraDataResultData;

const plan: CallRoutePlanResultData = {
  RoutePlanId: 'rp-1',
  Name: 'Hydrant loop',
  Description: null,
  RouteColor: null,
  UnitId: null,
  StopsCount: 5,
  EstimatedDistanceMeters: 12400,
  EstimatedDurationSeconds: 1500,
  RoutingProfile: 0,
  Start: { Latitude: 39.1, Longitude: -119.1, DepartmentGroupId: 3, Name: 'Station 1' },
  End: { Latitude: 39.2, Longitude: -119.2, DepartmentGroupId: null, Name: 'General Hospital' },
  StartIsStop: false,
  EndIsStop: false,
};

const contextFor = (overrides: Partial<CallDetailTabContext>): CallDetailTabContext => {
  const variant = getActiveVariant();

  return {
    callId: '10',
    call: makeCall('10'),
    extraData: null,
    capabilities: variant.capabilities,
    variantId: variant.id,
    // SAFETY: none of the tab visibility rules under test reads the security view.
    security: {} as SecurityView,
    formFactor: 'phone',
    isFeatureEnabled: () => false,
    overdueCheckIns: 0,
    refresh: async () => undefined,
    openNotes: jest.fn(),
    openImages: jest.fn(),
    openFiles: jest.fn(),
    ...overrides,
  };
};

beforeEach(() => {
  jest.mocked(router.push).mockClear();
  resetCallFormHookPointsForTests();
  useRoutesStore.setState({ callRoutePlans: [], fetchCallRoutePlans: jest.fn(async () => undefined) });
  useUnitsStore.setState({ units: [] });
});

describe('call info: location POI, destination and route', () => {
  it('names the location POI, a free destination’s address, point and what3words, and the route', async () => {
    activateVariant('dispatch');

    const call = makeCall('10', {
      LocationPoiId: 12,
      LocationPoiName: 'Station 4',
      DestinationAddress: '5 Oak Ave',
      DestinationLatitude: 39.3,
      DestinationLongitude: -119.3,
      DestinationGeolocation: '39.3,-119.3',
      DestinationWhat3Words: 'filled.count.soap',
      RoutePlanId: 'rp-1',
      RoutePlanName: 'Hydrant loop',
    });

    await render(<CallInfoPanel call={call} />);
    expect(screen.getByTestId('call-info-location-poi')).toHaveTextContent('call_detail.location_poiStation 4');
    expect(screen.getByTestId('call-info-destination')).toHaveTextContent('call_detail.destination5 Oak Ave');
    expect(screen.getByTestId('call-info-destination-coordinates')).toHaveTextContent('call_detail.destination_coordinates39.3, -119.3');
    expect(screen.getByTestId('call-info-destination-w3w')).toHaveTextContent('call_detail.destination_what3wordsfilled.count.soap');
    expect(screen.getByTestId('call-info-route')).toHaveTextContent('call_detail.routeHydrant loop');
  });

  it('shows a POI destination as before, with no free-destination rows', async () => {
    activateVariant('dispatch');
    await render(<CallInfoPanel call={makeCall('10', { DestinationPoiId: 3, DestinationName: 'Mercy', DestinationAddress: '1 Health Way', DestinationLatitude: 39.3, DestinationLongitude: -119.3 })} />);
    expect(screen.getByTestId('call-info-destination')).toHaveTextContent('call_detail.destinationMercy — 1 Health Way');
    expect(screen.queryByTestId('call-info-destination-coordinates')).toBeNull();
    expect(screen.queryByTestId('call-info-location-poi')).toBeNull();
    expect(screen.queryByTestId('call-info-route')).toBeNull();
  });
});

describe('call detail Route tab', () => {
  beforeEach(() => registerBuiltInCallDetailTabs());

  it('shows for a call with a route or route runs, with the runs still going as its badge', () => {
    activateVariant('dispatch');
    const tab = (context: CallDetailTabContext) => resolveCallDetailTabs(context).find((definition) => definition.id === 'route');

    expect(tab(contextFor({}))).toBeUndefined();
    expect(tab(contextFor({ call: makeCall('10', { RoutePlanId: 'rp-1' }) }))).toBeDefined();

    const context = contextFor({ extraData: extraWith([run('a'), run('b', { Status: RouteInstanceStatus.Paused }), run('c', { Status: RouteInstanceStatus.Completed })]) });
    expect(tab(context)?.badge?.(context)).toBe(2);
  });

  it('describes the route, links its preview and lists the runs units started', async () => {
    useRoutesStore.setState({ callRoutePlans: [plan] });
    activateVariant('dispatch');
    const runs = [run('a', { StartReachedOn: '2026-11-19T09:05:00Z' }), run('b', { UnitName: null, UnitId: 8, Status: RouteInstanceStatus.Completed, ActualEndOn: '2026-11-19T10:00:00Z', StopsCompleted: 5 })];

    // SAFETY: the panel reads only a unit's id and name.
    useUnitsStore.setState({ units: [{ UnitId: '8', Name: 'Medic 8' }] as never });
    await render(<CallRoutePanel call={makeCall('10', { RoutePlanId: 'rp-1', RoutePlanName: 'Hydrant loop' })} extraData={extraWith(runs)} />);

    expect(screen.getByTestId('call-route-name')).toHaveTextContent('Hydrant loop');
    expect(screen.getByTestId('call-route-endpoints')).toHaveTextContent('calls.route_start_end:Station 1,General Hospital');
    expect(screen.getByTestId('call-route-run-a')).toHaveTextContent(/Engine 7/);
    expect(screen.getByTestId('call-route-run-a')).toHaveTextContent(/unit_routes\.stops_done:2,5/);
    expect(screen.getByTestId('call-route-run-a')).toHaveTextContent(/call_detail\.route_run_start_reached/);
    expect(screen.getByTestId('call-route-run-a-status')).toHaveTextContent('routes.active');
    expect(screen.getByTestId('call-route-run-b')).toHaveTextContent(/Medic 8/);
    expect(screen.getByTestId('call-route-run-b')).toHaveTextContent(/call_detail\.route_run_ended/);

    await fireEvent.press(screen.getByTestId('call-route-preview'));
    expect(router.push).toHaveBeenCalledWith('/route-plans/rp-1');
    expect(useRoutesStore.getState().fetchCallRoutePlans).toHaveBeenCalled();
  });

  it('says no unit has started it, and offers no preview where the app does not preview routes', async () => {
    activateVariant('responder');
    await render(<CallRoutePanel call={makeCall('10', { RoutePlanId: 'rp-1', RoutePlanName: 'Hydrant loop' })} extraData={null} />);
    expect(screen.getByTestId('call-route-no-runs')).toBeTruthy();
    expect(screen.queryByTestId('call-route-preview')).toBeNull();
  });
});

describe('call map: free destination', () => {
  it('toggles to a free destination, read from DestinationGeolocation when the point fields are empty', async () => {
    registerCallFormHookPoints({ StaticLocationMap: ({ latitude, longitude, address }) => <Text testID="static-map">{`${latitude},${longitude} ${address ?? ''}`}</Text> });
    activateVariant('dispatch');
    await render(<CallMapSection call={makeCall('10', { Latitude: '39.5', Longitude: '-105', DestinationAddress: '5 Oak Ave', DestinationGeolocation: '39.3,-119.3' })} />);

    expect(screen.getByTestId('static-map')).toHaveTextContent('39.5,-105 10 Main St');
    await fireEvent.press(screen.getByTestId('call-detail-map-destination'));
    expect(screen.getByTestId('static-map')).toHaveTextContent('39.3,-119.3 5 Oak Ave');
  });
});
