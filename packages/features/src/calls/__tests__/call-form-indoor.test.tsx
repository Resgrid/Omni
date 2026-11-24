import './test-setup';

import { useNetInfo } from '@react-native-community/netinfo';
import { buildEditCallInput, buildNewCallInput, type CreateCallRequest, type UpdateCallRequest } from '@resgrid/api';
import { useCallDetailStore, useCallsStore, useCustomMapsStore, usePoisStore, useRoutesStore } from '@resgrid/data';
import type { MapFeatureResultData, NewCallFieldRuleData } from '@resgrid/models';
import { useToastStore } from '@resgrid/ui';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { Text } from 'react-native';

import { CONTROL_ROOM, facilityMapsState } from '../../map/__tests__/facility-fixtures';
import { INDOOR_SEARCH_DEBOUNCE_MS } from '../components/call-form/indoor-location-picker';
import { registerCallFormHookPoints, resetCallFormHookPointsForTests } from '../hook-points';
import { applyIndoorLocation, type CallFormPickers, callToFormValues, emptyCallFormValues, missingPolicyFields, toCreateCallRequest, toUpdateCallRequest } from '../lib/call-form';
import { createFieldPolicy } from '../lib/field-policy';
import { indoorLocationNames } from '../lib/indoor-location';
import CallFormScreen from '../screens/call-form';
import { activateVariant, hidden, makeCall, setRights } from './test-utils';

// The call's indoor location (a room of an indoor map or a region of a custom map): the field, its search, the map pick,
// and what create and edit send (Core `IndoorMapZoneId` / `IndoorMapFloorId`).
let mockRules: NewCallFieldRuleData[] = [];

jest.mock('../hooks/use-call-form-data', () => ({
  useNewCallFieldPolicy: () => mockCreatePolicy(mockRules),
  useCallTemplates: () => ({ templates: [], isLoading: false }),
  useDispatchRecipients: () => ({ recipients: { personnel: [], groups: [], roles: [], units: [] }, isLoading: false }),
}));

const mockCreatePolicy = (rules: NewCallFieldRuleData[]) => createFieldPolicy(rules, true);

jest.mock('../lib/call-geocoding', () => ({
  ...jest.requireActual('../lib/call-geocoding'),
  lookupAddressAt: jest.fn(async () => null),
}));

const mockCreateCall = jest.fn();
const mockUpdateCall = jest.fn();
const mockSearch = jest.fn();

const PICKERS: CallFormPickers = { protocols: false, linkedCall: false, udf: false, contact: false, dispatchList: false, indoorLocation: true };
const REQUIRED_INDOOR: NewCallFieldRuleData[] = [{ Key: 'indoorLocation', Visible: true, Required: true }];

const searchResult = (overrides: Partial<MapFeatureResultData> = {}): MapFeatureResultData => ({
  FeatureType: 'indoor_zone',
  Id: 'control',
  Name: 'Control room',
  Description: null,
  MapId: 'bldg-a',
  MapName: 'Building A',
  FloorOrLayerId: 'floor-1',
  FloorOrLayerName: 'Ground floor',
  CenterLatitude: 35.006,
  CenterLongitude: -106.494,
  IsDispatchable: true,
  ...overrides,
});

const fillBasics = async () => {
  await fireEvent.changeText(screen.getByTestId('call-form-name'), 'Gas leak');
  await fireEvent.changeText(screen.getByTestId('call-form-nature'), 'Alarm in the control room');
};

const submit = async () => act(async () => fireEvent.press(screen.getByTestId('call-form-submit')));

// SAFETY: the form hands the store's createCall a CreateCallRequest; the mock only records it.
const lastCreateRequest = () => mockCreateCall.mock.calls.at(-1)?.[0] as CreateCallRequest;

// SAFETY: the form hands the store's updateCall an UpdateCallRequest; the mock only records it.
const lastUpdateRequest = () => mockUpdateCall.mock.calls.at(-1)?.[0] as UpdateCallRequest;

afterEach(() => useToastStore.getState().clearToasts());

beforeEach(() => {
  mockRules = [];
  mockCreateCall.mockReset().mockResolvedValue({ outcome: 'sent', id: 'local-new' });
  mockUpdateCall.mockReset().mockResolvedValue(undefined);
  resetCallFormHookPointsForTests();
  // SAFETY: the form reads only the two connectivity flags of the NetInfo state.
  jest.mocked(useNetInfo).mockReturnValue({ isConnected: true, isInternetReachable: true } as never);
  setRights({});
  useCallsStore.setState({ callPriorities: [], callTypes: [], destinationPois: [], queuedCalls: {}, fetchCallFormData: jest.fn(async () => undefined), createCall: mockCreateCall });
  useCallDetailStore.setState({ details: {}, fetchCallDetail: jest.fn(async () => undefined), updateCall: mockUpdateCall });
  usePoisStore.setState({ pois: [], loading: {}, errors: {}, fetchPois: jest.fn(async () => undefined) });
  useRoutesStore.setState({ callRoutePlans: [], fetchCallRoutePlans: jest.fn(async () => undefined) });
  mockSearch.mockReset().mockImplementation(async (term: string) => {
    useCustomMapsStore.setState({
      searchTerm: term,
      searchResults: [searchResult(), searchResult({ FeatureType: 'custom_region', Id: 'yard', Name: 'Tank yard', MapId: 'site', MapName: 'Site emergency plan', FloorOrLayerId: 'site-base' })],
    });
  });
  useCustomMapsStore.setState({
    ...facilityMapsState(),
    searchResults: [],
    searchTerm: '',
    loading: {},
    errors: {},
    fetchCustomMaps: jest.fn(async () => undefined),
    fetchIndoorMaps: jest.fn(async () => undefined),
    fetchIndoorFloor: jest.fn(async () => undefined),
    fetchCustomMapLayer: jest.fn(async () => undefined),
    searchMapFeatures: mockSearch,
  });
});

describe('indoor location requests', () => {
  it('sends the room and its floor with the indoor picker, "" for none, and nothing without the picker', () => {
    const values = applyIndoorLocation(emptyCallFormValues(1), { zoneId: 'control', floorId: 'floor-1', name: 'Control room, Building A', point: { latitude: 35.006, longitude: -106.494 } });
    expect(values).toMatchObject({ address: 'Control room, Building A', latitude: '35.006', longitude: '-106.494', indoorMapZoneId: 'control', indoorMapFloorId: 'floor-1' });
    expect(buildNewCallInput(toCreateCallRequest(values, PICKERS))).toMatchObject({ IndoorMapZoneId: 'control', IndoorMapFloorId: 'floor-1' });
    expect(buildNewCallInput(toCreateCallRequest(emptyCallFormValues(1), PICKERS))).toMatchObject({ IndoorMapZoneId: '', IndoorMapFloorId: '' });
    expect(buildNewCallInput(toCreateCallRequest(values, { ...PICKERS, indoorLocation: false }))).not.toHaveProperty('IndoorMapZoneId');
  });

  it('keeps an address the caller gave and a point-less room leaves the point alone', () => {
    const values = applyIndoorLocation({ ...emptyCallFormValues(1), address: '1 Refinery Rd', latitude: '35.1', longitude: '-106.6' }, { zoneId: 'yard', floorId: 'site-base', name: 'Tank yard, Site', point: null });
    expect(values).toMatchObject({ address: '1 Refinery Rd', latitude: '35.1', longitude: '-106.6', indoorMapZoneId: 'yard', indoorLocationName: 'Tank yard, Site' });
  });

  it('a room changed replaces the previous room’s name in the address, but not an address typed over it', () => {
    const first = applyIndoorLocation(emptyCallFormValues(1), { zoneId: 'control', floorId: 'floor-1', name: 'Control room, Building A', point: null });
    const changed = applyIndoorLocation(first, { zoneId: 'shop', floorId: 'floor-1', name: 'Shop, Building A', point: null });
    expect(changed).toMatchObject({ address: 'Shop, Building A', indoorMapZoneId: 'shop', indoorLocationName: 'Shop, Building A' });

    const typed = applyIndoorLocation({ ...first, address: 'Gate 3, then Control room' }, { zoneId: 'shop', floorId: 'floor-1', name: 'Shop, Building A', point: null });
    expect(typed.address).toBe('Gate 3, then Control room');
  });

  it('edit: starts from the call’s room, clears it with "", and leaves alone what an older server does not report', () => {
    const call = makeCall('42', { IndoorMapZoneId: 'control', IndoorMapFloorId: 'floor-1' });
    const values = callToFormValues(call, []);
    expect(values).toMatchObject({ indoorMapZoneId: 'control', indoorMapFloorId: 'floor-1', indoorLocationName: '' });
    const edit = { call, storedProtocolCount: 0, initialDispatchOnUtc: '' };
    const isVisible = () => true;
    expect(buildEditCallInput(toUpdateCallRequest('42', values, PICKERS, { edit, isVisible }))).toMatchObject({ IndoorMapZoneId: 'control', IndoorMapFloorId: 'floor-1' });
    const cleared = { ...values, indoorMapZoneId: null, indoorMapFloorId: null };
    expect(buildEditCallInput(toUpdateCallRequest('42', cleared, PICKERS, { edit, isVisible }))).toMatchObject({ IndoorMapZoneId: '', IndoorMapFloorId: '' });

    // Hidden by the department, or not reported by the server: the stored room stays.
    expect(buildEditCallInput(toUpdateCallRequest('42', cleared, PICKERS, { edit, isVisible: (key) => key !== 'indoorLocation' }))).not.toHaveProperty('IndoorMapZoneId');
    const older = makeCall('43');
    expect(buildEditCallInput(toUpdateCallRequest('43', callToFormValues(older, []), PICKERS, { edit: { ...edit, call: older }, isVisible }))).not.toHaveProperty('IndoorMapZoneId');
  });

  it('requires a room when the department does, except on an edit the server cannot report it for', () => {
    const policy = createFieldPolicy(REQUIRED_INDOOR, true);
    expect(missingPolicyFields(emptyCallFormValues(1), policy)).toEqual(['indoorLocation']);
    expect(missingPolicyFields({ ...emptyCallFormValues(1), indoorMapZoneId: 'control' }, policy)).toEqual([]);
    const reported = makeCall('42', { IndoorMapZoneId: null });
    expect(missingPolicyFields(callToFormValues(reported, []), policy, { call: reported, storedProtocolCount: 0, initialDispatchOnUtc: '' })).toEqual(['indoorLocation']);
    const older = makeCall('43');
    expect(missingPolicyFields(callToFormValues(older, []), policy, { call: older, storedProtocolCount: 0, initialDispatchOnUtc: '' })).toEqual([]);
  });

  it('names a stored room from the floor or custom map layer the device has read', () => {
    const snapshot = { ...facilityMapsState(), customMapLayerById: {} };
    expect(indoorLocationNames(snapshot, 'control', 'floor-1')).toEqual({ zone: 'Control room', map: 'Building A' });
    expect(indoorLocationNames(snapshot, 'yard', 'site-base')).toEqual({ zone: 'Tank yard', map: 'Site emergency plan' });
    expect(indoorLocationNames(snapshot, 'yard', 'floor-1')).toBeNull();
    expect(indoorLocationNames(snapshot, 'missing', null)).toBeNull();
  });
});

describe('call form: indoor location field', () => {
  it('finds a room by name and sends it with the call, moved to the room', async () => {
    jest.useFakeTimers();

    try {
      activateVariant('dispatch');
      await render(<CallFormScreen mode="create" />);
      await fillBasics();
      expect(screen.getByTestId('call-form-indoor-location')).toHaveTextContent('calls.indoor_location_select');

      await fireEvent.press(screen.getByTestId('call-form-indoor-location'));
      await fireEvent.changeText(screen.getByTestId('call-indoor-location-search', hidden), 'control');
      await act(async () => jest.advanceTimersByTime(INDOOR_SEARCH_DEBOUNCE_MS));
      expect(mockSearch).toHaveBeenCalledWith('control', 'all');
      await fireEvent.press(screen.getByTestId('call-indoor-location-control', hidden));

      expect(screen.getByTestId('call-form-indoor-location')).toHaveTextContent('maps.facility.feature_address:Control room,Building A');
      expect(screen.getByTestId('call-form-address').props.value).toBe('maps.facility.feature_address:Control room,Building A');
      await submit();
      expect(buildNewCallInput(lastCreateRequest())).toMatchObject({ IndoorMapZoneId: 'control', IndoorMapFloorId: 'floor-1', Geolocation: '35.006,-106.494' });
    } finally {
      jest.useRealTimers();
    }
  });

  it('takes the room tapped on a facility map in the location picker', async () => {
    const pickerProps = jest.fn();
    registerCallFormHookPoints({
      LocationPicker: (props) => {
        pickerProps(props);

        return props.isOpen ? (
          <Text
            testID="map-picker"
            onPress={() => props.onSelect({ latitude: 35.004, longitude: -106.496, address: 'Tank yard, Site emergency plan', indoor: { zoneId: 'yard', floorId: 'site-base', name: 'Tank yard, Site emergency plan' } })}
          />
        ) : null;
      },
    });
    activateVariant('responder');
    await render(<CallFormScreen mode="create" />);
    await fillBasics();
    await fireEvent.press(screen.getByTestId('call-form-indoor-location-map'));
    expect(pickerProps).toHaveBeenLastCalledWith(expect.objectContaining({ isOpen: true, facilityMaps: true, initialIndoor: null }));
    await fireEvent.press(screen.getByTestId('map-picker'));
    expect(screen.getByTestId('call-form-indoor-location')).toHaveTextContent('Tank yard, Site emergency plan');
    await submit();
    expect(buildNewCallInput(lastCreateRequest())).toMatchObject({ IndoorMapZoneId: 'yard', IndoorMapFloorId: 'site-base', Geolocation: '35.004,-106.496', Address: 'Tank yard, Site emergency plan' });
  });

  it('holds the save while a required room is missing', async () => {
    mockRules = REQUIRED_INDOOR;
    activateVariant('dispatch');
    await render(<CallFormScreen mode="create" />);
    await fillBasics();
    expect(screen.getByText('calls.indoor_location *')).toBeTruthy();
    await submit();
    expect(mockCreateCall).not.toHaveBeenCalled();
    expect(screen.getByTestId('call-form-indoor-location-error')).toBeTruthy();
  });

  it('shows no indoor location field for a department without facility maps (nothing sent), unless it is required', async () => {
    useCustomMapsStore.setState({ customMaps: [], indoorMaps: [] });
    activateVariant('dispatch');
    const { unmount } = await render(<CallFormScreen mode="create" />);
    await fillBasics();
    expect(screen.queryByTestId('call-form-indoor-location-field')).toBeNull();
    await submit();
    expect(buildNewCallInput(lastCreateRequest())).not.toHaveProperty('IndoorMapZoneId');
    await unmount();

    mockRules = REQUIRED_INDOOR;
    await render(<CallFormScreen mode="create" />);
    expect(screen.getByTestId('call-form-indoor-location-field')).toBeTruthy();
  });

  it('edit: names the call’s room, passes it to the map picker and clears it with ""', async () => {
    const pickerProps = jest.fn();
    registerCallFormHookPoints({
      LocationPicker: (props) => {
        pickerProps(props);

        return null;
      },
    });
    const call = makeCall('42', { Latitude: String(CONTROL_ROOM.CenterLatitude), Longitude: String(CONTROL_ROOM.CenterLongitude), IndoorMapZoneId: 'control', IndoorMapFloorId: 'floor-1' });
    useCallDetailStore.setState({
      // SAFETY: the edit reads only the dispatches from the extra data.
      details: { '42': { call, extraData: { Dispatches: [] } as never, notes: [], images: null, files: null, audio: null, fetchedAt: 1 } },
    });
    activateVariant('dispatch');
    await render(<CallFormScreen mode="edit" callId="42" />);
    expect(screen.getByTestId('call-form-indoor-location')).toHaveTextContent('maps.facility.feature_address:Control room,Building A');
    await fireEvent.press(screen.getByTestId('call-form-indoor-location-map'));
    expect(pickerProps).toHaveBeenLastCalledWith(expect.objectContaining({ isOpen: true, initialIndoor: { zoneId: 'control', floorId: 'floor-1' } }));

    await fireEvent.press(screen.getByTestId('call-form-indoor-location-clear'));
    expect(screen.getByTestId('call-form-indoor-location')).toHaveTextContent('calls.indoor_location_select');
    await submit();
    expect(buildEditCallInput(lastUpdateRequest())).toMatchObject({ IndoorMapZoneId: '', IndoorMapFloorId: '' });
  });

  it('edit: reads the floor of a room the device has not seen to name it', async () => {
    useCustomMapsStore.setState({ floorById: {}, indoorMapById: {}, customMapById: {} });
    const call = makeCall('42', { IndoorMapZoneId: 'r-9', IndoorMapFloorId: 'floor-9' });
    useCallDetailStore.setState({
      // SAFETY: the edit reads only the dispatches from the extra data.
      details: { '42': { call, extraData: { Dispatches: [] } as never, notes: [], images: null, files: null, audio: null, fetchedAt: 1 } },
    });
    activateVariant('dispatch');
    await render(<CallFormScreen mode="edit" callId="42" />);
    await act(async () => undefined);
    expect(useCustomMapsStore.getState().fetchIndoorFloor).toHaveBeenCalledWith('floor-9');
    // Not an indoor floor: then a custom map layer.
    expect(useCustomMapsStore.getState().fetchCustomMapLayer).toHaveBeenCalledWith('floor-9');
    expect(screen.getByTestId('call-form-indoor-location')).toHaveTextContent('calls.indoor_location_unnamed');
  });
});
