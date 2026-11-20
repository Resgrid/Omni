import './test-setup';

import { useNetInfo } from '@react-native-community/netinfo';
import { buildEditCallInput, buildNewCallInput, type CreateCallRequest, type UpdateCallRequest } from '@resgrid/api';
import { useCallDetailStore, useCallsStore, usePoisStore, useRoutesStore } from '@resgrid/data';
import type { CallRoutePlanResultData, NewCallFieldRuleData, PoiResultData } from '@resgrid/models';
import { useToastStore } from '@resgrid/ui';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import React from 'react';
import { Text } from 'react-native';

import { registerCallFormHookPoints, resetCallFormHookPointsForTests } from '../hook-points';
import { createFieldPolicy } from '../lib/field-policy';
import CallFormScreen from '../screens/call-form';
import { activateVariant, hidden, makeCall, setRights } from './test-utils';

// Core M0322 on the call form: a location picked from a POI, a destination that is a POI or a free location, and a route.
let mockRules: NewCallFieldRuleData[] = [];

jest.mock('../hooks/use-call-form-data', () => ({
  useNewCallFieldPolicy: () => mockCreatePolicy(mockRules),
  useCallTemplates: () => ({ templates: [], isLoading: false }),
  useDispatchRecipients: () => ({ recipients: { personnel: [], groups: [], roles: [], units: [] }, isLoading: false }),
}));

const mockCreatePolicy = (rules: NewCallFieldRuleData[]) => createFieldPolicy(rules, true);
const mockLookupAddress = jest.fn();
const mockLookupAddressAt = jest.fn();

jest.mock('../lib/call-geocoding', () => ({
  ...jest.requireActual('../lib/call-geocoding'),
  lookupAddress: (address: string) => mockLookupAddress(address),
  lookupAddressAt: (latitude: number, longitude: number) => mockLookupAddressAt(latitude, longitude),
}));

const mockCreateCall = jest.fn();
const mockUpdateCall = jest.fn();

// SAFETY: the pickers and the form read only these fields of a POI.
const poi = (PoiId: number, Name: string, overrides: Partial<PoiResultData> = {}): PoiResultData =>
  ({ PoiId, Name, Address: '', PoiTypeName: 'Station', Latitude: 39.5, Longitude: -119.8, IsDestination: false, ...overrides }) as PoiResultData;

const plan = (overrides: Partial<CallRoutePlanResultData> = {}): CallRoutePlanResultData => ({
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
  ...overrides,
});

const fillBasics = async () => {
  await fireEvent.changeText(screen.getByTestId('call-form-name'), 'Transfer');
  await fireEvent.changeText(screen.getByTestId('call-form-nature'), 'Patient transfer');
};

const submit = async () => act(async () => fireEvent.press(screen.getByTestId('call-form-submit')));

// SAFETY: the form hands the store's createCall a CreateCallRequest; the mock only records it.
const lastCreateRequest = () => mockCreateCall.mock.calls.at(-1)?.[0] as CreateCallRequest;

// SAFETY: the form hands the store's updateCall an UpdateCallRequest; the mock only records it.
const lastUpdateRequest = () => mockUpdateCall.mock.calls.at(-1)?.[0] as UpdateCallRequest;

const lastToast = () => useToastStore.getState().toasts.at(-1);

afterEach(() => useToastStore.getState().clearToasts());

beforeEach(() => {
  mockRules = [];
  mockCreateCall.mockReset().mockResolvedValue({ outcome: 'sent', id: 'local-new' });
  mockUpdateCall.mockReset().mockResolvedValue(undefined);
  mockLookupAddress.mockReset();
  mockLookupAddressAt.mockReset().mockResolvedValue(null);
  jest.mocked(router.push).mockClear();
  resetCallFormHookPointsForTests();
  useToastStore.getState().clearToasts();
  // SAFETY: the form reads only the two connectivity flags of the NetInfo state.
  jest.mocked(useNetInfo).mockReturnValue({ isConnected: true, isInternetReachable: true } as never);
  setRights({});
  useCallsStore.setState({ callPriorities: [], callTypes: [], destinationPois: [], queuedCalls: {}, fetchCallFormData: jest.fn(async () => undefined), createCall: mockCreateCall });
  useCallDetailStore.setState({ details: {}, fetchCallDetail: jest.fn(async () => undefined), updateCall: mockUpdateCall });
  usePoisStore.setState({ pois: [], loading: {}, errors: {}, fetchPois: jest.fn(async () => undefined) });
  useRoutesStore.setState({ callRoutePlans: [], fetchCallRoutePlans: jest.fn(async () => undefined) });
});

describe('call form: location from a POI', () => {
  it('fills the address and point from the POI, links it, and drops the link once the point moves', async () => {
    usePoisStore.setState({ pois: [poi(12, 'Station 4', { Address: '4 Engine Rd' }), poi(13, 'Library', { Latitude: 39.6, Longitude: -119.6 })] });
    activateVariant('dispatch');
    await render(<CallFormScreen mode="create" />);
    await fillBasics();

    expect(screen.getByTestId('call-form-location-poi')).toHaveTextContent('calls.location_poi_select');
    await fireEvent.press(screen.getByTestId('call-form-location-poi'));
    await fireEvent.changeText(screen.getByTestId('call-location-poi-search', hidden), 'engine');
    expect(screen.queryByTestId('call-location-poi-13', hidden)).toBeNull();
    await fireEvent.press(screen.getByTestId('call-location-poi-12', hidden));

    expect(screen.getByTestId('call-form-location-poi')).toHaveTextContent('Station 4');
    expect(screen.getByTestId('call-form-address').props.value).toBe('4 Engine Rd');
    expect(screen.getByTestId('call-form-latitude').props.value).toBe('39.5');
    await submit();
    expect(buildNewCallInput(lastCreateRequest())).toMatchObject({ LocationPoiId: 12, Address: '4 Engine Rd', Geolocation: '39.5,-119.8' });

    // The address alone may change; moving the point unlinks the POI (and says so).
    await fireEvent.changeText(screen.getByTestId('call-form-address'), '4 Engine Rd, Bay 2');
    expect(screen.queryByTestId('call-form-location-poi-moved')).toBeNull();
    await fireEvent.changeText(screen.getByTestId('call-form-latitude'), '39.7');
    expect(screen.getByTestId('call-form-location-poi-moved')).toHaveTextContent('calls.location_poi_moved:Station 4');
    await submit();
    expect(buildNewCallInput(lastCreateRequest())).not.toHaveProperty('LocationPoiId');

    // Clearing it removes it altogether.
    await fireEvent.press(screen.getByTestId('call-form-location-poi-clear'));
    expect(screen.queryByTestId('call-form-location-poi-moved')).toBeNull();
  });

  it('is offered only when the department has POIs and shows the address or coordinates', async () => {
    activateVariant('dispatch');
    const { unmount } = await render(<CallFormScreen mode="create" />);
    expect(screen.queryByTestId('call-form-location-poi')).toBeNull();
    await unmount();

    usePoisStore.setState({ pois: [poi(12, 'Station 4')] });
    mockRules = [
      { Key: 'address', Visible: false, Required: false },
      { Key: 'geolocation', Visible: false, Required: false },
    ];
    await render(<CallFormScreen mode="create" />);
    expect(screen.queryByTestId('call-form-location-poi')).toBeNull();
    expect(usePoisStore.getState().fetchPois).toHaveBeenCalled();
  });
});

describe('call form: destination', () => {
  it('takes a free destination — looked up, typed or picked on the map — and a POI replaces it', async () => {
    useCallsStore.setState({ destinationPois: [poi(3, 'Mercy Hospital', { IsDestination: true })] });
    mockLookupAddress.mockResolvedValue({ succeeded: true, place: { latitude: 39.3, longitude: -119.3, address: '5 Oak Ave, Reno' } });
    registerCallFormHookPoints({
      LocationPicker: ({ isOpen, onSelect, initial }) => (isOpen ? <Text testID="map-picker" onPress={() => onSelect({ latitude: 39.35, longitude: -119.35 })}>{`${initial?.latitude ?? ''}`}</Text> : null),
    });
    mockLookupAddressAt.mockResolvedValue('7 Pine St');
    activateVariant('dispatch');
    await render(<CallFormScreen mode="create" />);
    await fillBasics();

    expect(screen.getByTestId('call-form-destination')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('call-form-destination-kind-location'));
    expect(screen.queryByTestId('call-form-destination')).toBeNull();
    await fireEvent.changeText(screen.getByTestId('call-form-destination-address'), '5 oak');
    await act(async () => fireEvent.press(screen.getByTestId('call-form-destination-address-search')));
    expect(mockLookupAddress).toHaveBeenCalledWith('5 oak');
    expect(screen.getByTestId('call-form-destination-latitude').props.value).toBe('39.3');
    expect(screen.getByTestId('call-form-destination-address').props.value).toBe('5 Oak Ave, Reno');
    expect(lastToast()?.message).toBe('calls.destination_found');
    await fireEvent.changeText(screen.getByTestId('call-form-destination-w3w'), 'filled.count.soap');
    await submit();
    expect(buildNewCallInput(lastCreateRequest())).toMatchObject({ DestinationPoiId: null, DestinationAddress: '5 Oak Ave, Reno', DestinationGeolocation: '39.3,-119.3', DestinationWhat3Words: 'filled.count.soap' });

    // The map picker opens on the destination and its spot replaces the point (the address stays as given).
    await fireEvent.press(screen.getByTestId('call-form-destination-pick-on-map'));
    expect(screen.getByTestId('map-picker')).toHaveTextContent('39.3');
    await act(async () => fireEvent.press(screen.getByTestId('map-picker')));
    expect(screen.getByTestId('call-form-destination-latitude').props.value).toBe('39.35');
    expect(screen.getByTestId('call-form-destination-address').props.value).toBe('5 Oak Ave, Reno');

    // A pasted "lat, lon" fills both fields.
    await fireEvent.changeText(screen.getByTestId('call-form-destination-latitude'), '39.4, -119.4');
    expect(screen.getByTestId('call-form-destination-longitude').props.value).toBe('-119.4');

    // Switching to a POI clears the free destination.
    await fireEvent.press(screen.getByTestId('call-form-destination-kind-poi'));
    await fireEvent.press(screen.getByTestId('call-form-destination'));
    await fireEvent.press(screen.getByTestId('call-destination-poi-3', hidden));
    await submit();
    const input = buildNewCallInput(lastCreateRequest());
    expect(input.DestinationPoiId).toBe(3);
    expect(input).not.toHaveProperty('DestinationAddress');
    expect(input).not.toHaveProperty('DestinationGeolocation');
  });

  it('without destination POIs offers the free location, which meets a required destination', async () => {
    mockRules = [{ Key: 'destinationPoi', Visible: true, Required: true }];
    activateVariant('unit');
    await render(<CallFormScreen mode="create" />);
    await fillBasics();

    expect(screen.queryByTestId('call-form-destination-kind-poi')).toBeNull();
    await submit();
    expect(mockCreateCall).not.toHaveBeenCalled();
    expect(lastToast()?.message).toBe('calls.required_fields_missing:calls.destination');
    expect(screen.getByTestId('call-form-destination-error')).toBeTruthy();

    await fireEvent.changeText(screen.getByTestId('call-form-destination-address'), '5 Oak Ave');
    expect(screen.queryByTestId('call-form-destination-error')).toBeNull();
    await submit();
    expect(mockCreateCall).toHaveBeenCalledWith(expect.objectContaining({ destinationAddress: '5 Oak Ave', destinationGeolocation: null }));
  });

  it('refuses a destination point that is not decimal degrees', async () => {
    activateVariant('dispatch');
    await render(<CallFormScreen mode="create" />);
    await fillBasics();
    await fireEvent.changeText(screen.getByTestId('call-form-destination-latitude'), '95');
    await fireEvent.changeText(screen.getByTestId('call-form-destination-longitude'), '10');
    await submit();
    expect(mockCreateCall).not.toHaveBeenCalled();
    expect(screen.getByTestId('call-form-destination-latitude-error')).toHaveTextContent('calls.latitude_invalid');
  });

  it('is left out when the department hides the destination', async () => {
    mockRules = [{ Key: 'destinationPoi', Visible: false, Required: false }];
    activateVariant('dispatch');
    await render(<CallFormScreen mode="create" />);
    await fillBasics();
    expect(screen.queryByTestId('call-form-destination-section')).toBeNull();
    await submit();
    expect(lastCreateRequest()).not.toHaveProperty('destinationAddress');
  });
});

describe('call form: route', () => {
  it('is hidden without a route a call may run', async () => {
    activateVariant('dispatch');
    await render(<CallFormScreen mode="create" />);
    expect(screen.queryByTestId('call-form-route')).toBeNull();
    expect(useRoutesStore.getState().fetchCallRoutePlans).toHaveBeenCalled();
  });

  it('fills a blank location and destination from the route, previews it in Dispatch and sends it with a pending call', async () => {
    useRoutesStore.setState({ callRoutePlans: [plan(), plan({ RoutePlanId: 'rp-2', Name: 'Market run' })] });
    mockLookupAddressAt.mockResolvedValue('1 Station Rd');
    activateVariant('dispatch');
    await render(<CallFormScreen mode="create" />);
    await fillBasics();

    await fireEvent.press(screen.getByTestId('call-form-route'));
    await fireEvent.changeText(screen.getByTestId('call-route-search', hidden), 'hydrant');
    expect(screen.queryByTestId('call-route-plan-rp-2', hidden)).toBeNull();
    await act(async () => fireEvent.press(screen.getByTestId('call-route-plan-rp-1', hidden)));

    expect(screen.getByTestId('call-form-route')).toHaveTextContent('Hydrant loop');
    expect(screen.getByTestId('call-form-route-endpoints')).toHaveTextContent('calls.route_start_end:Station 1,General Hospital');
    expect(screen.getByTestId('call-form-latitude').props.value).toBe('39.1');
    await waitFor(() => expect(screen.getByTestId('call-form-address').props.value).toBe('1 Station Rd'));
    expect(mockLookupAddressAt).toHaveBeenCalledWith(39.1, -119.1);
    expect(screen.getByTestId('call-form-destination-address').props.value).toBe('General Hospital');
    expect(screen.getByTestId('call-form-destination-latitude').props.value).toBe('39.2');

    await fireEvent.press(screen.getByTestId('call-form-route-preview'));
    expect(router.push).toHaveBeenCalledWith('/route-plans/rp-1');

    await fireEvent(screen.getByTestId('call-form-pending'), 'valueChange', true);
    await submit();
    expect(buildNewCallInput(lastCreateRequest())).toMatchObject({ IsPending: true, RoutePlanId: 'rp-1', Geolocation: '39.1,-119.1', DestinationAddress: 'General Hospital', DestinationGeolocation: '39.2,-119.2' });

    // Clearing the route leaves what it filled in.
    await fireEvent.press(screen.getByTestId('call-form-route-clear'));
    await submit();
    expect(buildNewCallInput(lastCreateRequest())).not.toHaveProperty('RoutePlanId');
    expect(screen.getByTestId('call-form-latitude').props.value).toBe('39.1');
  });

  it('offers no preview where the app does not preview routes', async () => {
    useRoutesStore.setState({ callRoutePlans: [plan()] });
    activateVariant('responder');
    await render(<CallFormScreen mode="create" />);
    await fireEvent.press(screen.getByTestId('call-form-route'));
    await act(async () => fireEvent.press(screen.getByTestId('call-route-plan-rp-1', hidden)));
    expect(screen.getByTestId('call-form-route')).toHaveTextContent('Hydrant loop');
    expect(screen.queryByTestId('call-form-route-preview')).toBeNull();
  });
});

describe('call form: edit', () => {
  const call = makeCall('42', {
    Name: 'Edit me',
    Address: '4 Engine Rd',
    Latitude: '39.5',
    Longitude: '-119.8',
    Geolocation: '39.5,-119.8',
    LocationPoiId: 12,
    LocationPoiName: 'Station 4',
    DestinationAddress: '5 Oak Ave',
    DestinationLatitude: 39.3,
    DestinationLongitude: -119.3,
    DestinationGeolocation: '39.3,-119.3',
    DestinationWhat3Words: 'filled.count.soap',
    RoutePlanId: 'rp-9',
    RoutePlanName: 'Old route',
  });

  beforeEach(() => {
    useCallDetailStore.setState({
      // SAFETY: the edit reads only the dispatches from the extra data.
      details: { '42': { call, extraData: { Dispatches: [] } as never, notes: [], images: null, files: null, audio: null, fetchedAt: 1 } },
    });
  });

  it('starts from the call’s location POI, free destination and route, and clears what the dispatcher removes', async () => {
    activateVariant('dispatch');
    await render(<CallFormScreen mode="edit" callId="42" />);
    await waitFor(() => expect(screen.getByTestId('call-form-name').props.value).toBe('Edit me'));

    // The call's POI shows (by its stored name) even though the department's POIs have not loaded.
    expect(screen.getByTestId('call-form-location-poi')).toHaveTextContent('Station 4');
    expect(screen.getByTestId('call-form-destination-address').props.value).toBe('5 Oak Ave');
    expect(screen.getByTestId('call-form-destination-latitude').props.value).toBe('39.3');
    expect(screen.getByTestId('call-form-destination-w3w').props.value).toBe('filled.count.soap');
    // A route no longer offered still shows by the name the call stores.
    expect(screen.getByTestId('call-form-route')).toHaveTextContent('Old route');

    await submit();
    expect(buildEditCallInput(lastUpdateRequest())).toMatchObject({
      LocationPoiId: 12,
      DestinationAddress: '5 Oak Ave',
      DestinationGeolocation: '39.3,-119.3',
      DestinationWhat3Words: 'filled.count.soap',
      RoutePlanId: 'rp-9',
    });

    await fireEvent.press(screen.getByTestId('call-form-location-poi-clear'));
    await fireEvent.press(screen.getByTestId('call-form-destination-location-clear'));
    await fireEvent.press(screen.getByTestId('call-form-route-clear'));
    await submit();
    expect(buildEditCallInput(lastUpdateRequest())).toMatchObject({ LocationPoiId: 0, DestinationAddress: '', DestinationGeolocation: '', DestinationWhat3Words: '', RoutePlanId: '' });
  });

  it('leaves the stored destination when the department hides it', async () => {
    mockRules = [{ Key: 'destinationPoi', Visible: false, Required: false }];
    activateVariant('dispatch');
    await render(<CallFormScreen mode="edit" callId="42" />);
    await waitFor(() => expect(screen.getByTestId('call-form-name').props.value).toBe('Edit me'));
    await submit();
    const input = buildEditCallInput(lastUpdateRequest());

    expect(input).not.toHaveProperty('DestinationAddress');
    expect(input).not.toHaveProperty('DestinationGeolocation');
    expect(input.DestinationPoiId).toBeNull();
  });
});
