import './test-setup';

import { useNetInfo } from '@react-native-community/netinfo';
import { ApiError, buildNewCallInput, type CreateCallRequest } from '@resgrid/api';
import { featureFlagsStore } from '@resgrid/auth';
import { useCallDetailStore, useCallsStore, useContactsStore } from '@resgrid/data';
import type { NewCallFieldRuleData } from '@resgrid/models';
import { useToastStore } from '@resgrid/ui';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import React from 'react';
import { Text } from 'react-native';

import { registerCallFormHookPoints, resetCallFormHookPointsForTests } from '../hook-points';
import { createFieldPolicy } from '../lib/field-policy';
import CallFormScreen, { type CallFormScreenProps } from '../screens/call-form';
import { activateVariant, hidden, makeCall, setRights } from './test-utils';

let mockRules: NewCallFieldRuleData[] = [];
let mockPolicyLoaded = true;

jest.mock('../hooks/use-call-form-data', () => ({
  useNewCallFieldPolicy: () => mockCreatePolicy(mockRules, mockPolicyLoaded),
  useCallTemplates: () => ({ templates: mockTemplates, isLoading: false }),
  useDispatchRecipients: () => ({ recipients: mockRecipients, isLoading: false }),
}));

const mockCreatePolicy = (rules: NewCallFieldRuleData[], isLoaded: boolean) => createFieldPolicy(rules, isLoaded);
const mockLookupAddress = jest.fn();
const mockLookupAddressAt = jest.fn();

jest.mock('../lib/call-geocoding', () => ({
  ...jest.requireActual('../lib/call-geocoding'),
  lookupAddress: (address: string) => mockLookupAddress(address),
  lookupAddressAt: (latitude: number, longitude: number) => mockLookupAddressAt(latitude, longitude),
}));

const mockTemplates = [{ Id: 't1', IsDisabled: false, Name: 'Structure fire', CallName: 'Structure Fire', CallNature: 'Reported structure fire', CallType: 'Fire', CallPriority: 3, CreatedByUserId: '', CreatedOn: '' }];

const mockRecipients = {
  personnel: [{ UserId: 'u1', FirstName: 'Pat', LastName: 'Smith', GroupName: 'Station 1' }],
  groups: [{ GroupId: 'g1', Name: 'Station 1' }],
  roles: [{ RoleId: 'r1', Name: 'Medic' }],
  units: [{ UnitId: '7', Name: 'Engine 7', GroupName: 'Station 1' }],
} as never;

const mockCreateCall = jest.fn();
const mockCorrectQueuedCall = jest.fn();
const mockUpdateCall = jest.fn();

const fillBasics = async () => {
  await fireEvent.changeText(screen.getByTestId('call-form-name'), 'Kitchen fire');
  await fireEvent.changeText(screen.getByTestId('call-form-nature'), 'Smoke from kitchen');
  await fireEvent.press(screen.getByTestId('call-form-type-Fire'));
};

const lastToast = () => {
  const toasts = useToastStore.getState().toasts;

  return toasts[toasts.length - 1];
};

afterEach(() => {
  useToastStore.getState().clearToasts();
  featureFlagsStore.setState({ flags: {} });
});

beforeEach(() => {
  mockRules = [];
  mockPolicyLoaded = true;
  mockLookupAddress.mockReset();
  mockLookupAddressAt.mockReset().mockResolvedValue(null);
  jest.mocked(router.replace).mockClear();
  jest.mocked(router.back).mockClear();
  resetCallFormHookPointsForTests();
  useToastStore.getState().clearToasts();
  jest.mocked(useNetInfo).mockReturnValue({ isConnected: true, isInternetReachable: true } as never);
  setRights({});
  mockCreateCall.mockResolvedValue({ outcome: 'sent', id: 'local-new' });
  mockCorrectQueuedCall.mockResolvedValue(true);
  mockUpdateCall.mockResolvedValue(undefined);
  useCallsStore.setState({
    callPriorities: [],
    callTypes: [{ Id: 'a', Name: 'Fire' }],
    destinationPois: [],
    queuedCalls: {},
    calls: [makeCall('300', { Number: '26-300', Name: 'Open call' })],
    fetchCallFormData: jest.fn(async () => undefined),
    createCall: mockCreateCall,
    correctQueuedCall: mockCorrectQueuedCall,
  });
  useCallDetailStore.setState({ details: {}, fetchCallDetail: jest.fn(async () => undefined), updateCall: mockUpdateCall });
});

describe('CallFormScreen: create', () => {
  it('quick create shows the core fields only; full shows contact, references, dispatch and pickers', async () => {
    activateVariant('unit', { calls: { create: 'quick' } });
    const { unmount } = await render(<CallFormScreen mode="create" />);
    expect(screen.getByTestId('call-form-name')).toBeTruthy();
    expect(screen.getByTestId('call-form-address')).toBeTruthy();
    expect(screen.queryByTestId('call-form-contact-name')).toBeNull();
    expect(screen.queryByTestId('call-form-external-id')).toBeNull();
    expect(screen.queryByTestId('call-form-dispatch')).toBeNull();
    expect(screen.queryByTestId('call-form-protocols')).toBeNull();
    await unmount();

    activateVariant('unit');
    await render(<CallFormScreen mode="create" />);
    expect(screen.getByTestId('call-form-contact-name')).toBeTruthy();
    expect(screen.getByTestId('call-form-external-id')).toBeTruthy();
    expect(screen.getByTestId('call-form-dispatch')).toBeTruthy();
    expect(screen.getByTestId('call-form-protocols')).toBeTruthy();
    expect(screen.getByTestId('call-form-linked')).toBeTruthy();
    // Scheduling and pending need calls.queues (Dispatch).
    expect(screen.queryByTestId('call-form-scheduling')).toBeNull();
  });

  it('honours the field policy: hidden fields are not rendered, a quick form shows fields the policy requires', async () => {
    mockRules = [
      { Key: 'contactName', Visible: true, Required: true },
      { Key: 'externalId', Visible: false, Required: false },
    ];
    activateVariant('unit', { calls: { create: 'quick' } });
    await render(<CallFormScreen mode="create" />);
    expect(screen.getByTestId('call-form-contact-name')).toBeTruthy();
    expect(screen.queryByTestId('call-form-external-id')).toBeNull();
  });

  it('blocks submit while a policy-required field is blank and says which', async () => {
    mockRules = [{ Key: 'address', Visible: true, Required: true }];
    activateVariant('responder');
    await render(<CallFormScreen mode="create" />);
    await fillBasics();
    await act(async () => fireEvent.press(screen.getByTestId('call-form-submit')));
    expect(mockCreateCall).not.toHaveBeenCalled();
    expect(lastToast().message).toBe('calls.required_fields_missing:calls.address');
    expect(screen.getByTestId('call-form-address-error')).toBeTruthy();
  });

  it('creates a call through the store (outbox) with a default priority and dispatch selection', async () => {
    activateVariant('responder');
    await render(<CallFormScreen mode="create" />);
    await fillBasics();
    // A pasted "lat, lon" fills both fields.
    await fireEvent.changeText(screen.getByTestId('call-form-latitude'), '39.74, -104.99');
    expect(screen.getByTestId('call-form-longitude').props.value).toBe('-104.99');
    await fireEvent.press(screen.getByTestId('call-form-dispatch'));
    await fireEvent.press(screen.getByTestId('dispatch-option-units-7', hidden));
    await fireEvent.press(screen.getByTestId('dispatch-selection-confirm', hidden));
    await act(async () => fireEvent.press(screen.getByTestId('call-form-submit')));
    expect(mockCreateCall).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Kitchen fire', nature: 'Smoke from kitchen', priority: 0, type: 'Fire', latitude: 39.74, longitude: -104.99, dispatchUnits: ['7'], protocolIds: [] })
    );
    expect(lastToast().message).toBe('calls.create_success');
    expect(router.back).toHaveBeenCalled();
  });

  it('creates a call with no one picked as dispatched to nobody, not everyone', async () => {
    activateVariant('responder');
    await render(<CallFormScreen mode="create" />);
    await fillBasics();
    expect(screen.getByTestId('call-form-dispatch-summary')).toHaveTextContent('calls.dispatch.none_pages_nobody');
    await act(async () => fireEvent.press(screen.getByTestId('call-form-submit')));
    expect(mockCreateCall).toHaveBeenCalledWith(expect.objectContaining({ dispatchPicked: true, dispatchEveryone: false, dispatchUsers: [], dispatchGroups: [], dispatchRoles: [], dispatchUnits: [] }));
  });

  it('offline: shows the banner, queues the call and says it is not dispatched yet', async () => {
    jest.mocked(useNetInfo).mockReturnValue({ isConnected: false, isInternetReachable: false } as never);
    mockCreateCall.mockResolvedValue({ outcome: 'queued', id: 'local-q' });
    activateVariant('dispatch');
    await render(<CallFormScreen mode="create" />);
    expect(screen.getByTestId('offline-call-banner')).toBeTruthy();
    expect(screen.getByText('calls.offline.no_geocoding')).toBeTruthy();
    await fillBasics();
    await act(async () => fireEvent.press(screen.getByTestId('call-form-submit')));
    expect(mockCreateCall).toHaveBeenCalled();
    expect(lastToast()).toMatchObject({ type: 'info', message: 'calls.queued.created_offline' });
  });

  it('keeps a call the server refused open for correction and resends it under the same client GUID', async () => {
    activateVariant('responder');
    const request: CreateCallRequest = { name: 'Kitchen fire', nature: 'Smoke from kitchen', priority: 0 };
    mockCreateCall.mockImplementation(async () => {
      useCallsStore.setState({ queuedCalls: { 'local-r': { localId: 'local-r', request, input: buildNewCallInput(request), createdAt: 1, state: 'rejected' } } });

      return { outcome: 'rejected', id: 'local-r' };
    });
    await render(<CallFormScreen mode="create" />);
    await fillBasics();
    await act(async () => fireEvent.press(screen.getByTestId('call-form-submit')));
    expect(lastToast().message).toBe('calls.queued.rejected_on_create');
    expect(screen.getByTestId('call-form-correction')).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('call-form-address'), '12 Oak St');
    await act(async () => fireEvent.press(screen.getByTestId('call-form-submit')));
    expect(mockCorrectQueuedCall).toHaveBeenCalledWith('local-r', expect.objectContaining({ address: '12 Oak St', name: 'Kitchen fire' }));
    expect(mockCreateCall).toHaveBeenCalledTimes(1);
  });

  it('corrects a rejected queued call opened from Pending sync', async () => {
    activateVariant('unit');
    const request: CreateCallRequest = { name: 'Offline call', nature: 'Downed lines', priority: 0, type: 'Fire', address: 'Wrong St' };
    useCallsStore.setState({ queuedCalls: { 'local-7': { localId: 'local-7', request, input: buildNewCallInput(request), createdAt: 1, state: 'rejected' } } });
    await render(<CallFormScreen mode="create" correctLocalId="local-7" />);
    expect(screen.getByText('calls.queued.rejected_badge')).toBeTruthy();
    expect(screen.getByTestId('call-form-name').props.value).toBe('Offline call');
    await fireEvent.changeText(screen.getByTestId('call-form-address'), 'Right St');
    await act(async () => fireEvent.press(screen.getByTestId('call-form-submit')));
    expect(mockCorrectQueuedCall).toHaveBeenCalledWith('local-7', expect.objectContaining({ address: 'Right St' }));
    expect(lastToast().message).toBe('calls.queued.resubmitted');
  });

  it('applies a call template', async () => {
    activateVariant('dispatch');
    await render(<CallFormScreen mode="create" />);
    await fireEvent.press(screen.getByTestId('call-form-templates'));
    await fireEvent.press(screen.getByTestId('call-template-t1', hidden));
    expect(screen.getByTestId('call-form-name').props.value).toBe('Structure Fire');
    expect(screen.getByTestId('call-form-priority-3').props.accessibilityState).toEqual({ selected: true });
  });

  it('offers pending/scheduling with calls.queues, drops "Everyone" for a pending call and then shows the pending queue', async () => {
    // A pending call is not dispatched or scheduled yet, so neither requirement applies to it (Dispatch).
    mockRules = [
      { Key: 'dispatchList', Visible: true, Required: true },
      { Key: 'dispatchOn', Visible: true, Required: true },
    ];
    activateVariant('dispatch');
    await render(<CallFormScreen mode="create" />);
    // "Everyone" picked before the call is made pending is not sent with it, and comes back when Pending is turned off.
    await fireEvent.press(screen.getByTestId('call-form-dispatch'));
    await fireEvent(screen.getByTestId('dispatch-selection-everyone', hidden), 'valueChange', true);
    await fireEvent.press(screen.getByTestId('dispatch-selection-confirm', hidden));
    expect(screen.getByTestId('call-form-dispatch-summary').props.children).toBe('calls.everyone');
    await fireEvent(screen.getByTestId('call-form-pending'), 'valueChange', true);
    expect(screen.getByTestId('call-form-dispatch-summary').props.children).toBe('common.none');
    await fireEvent(screen.getByTestId('call-form-pending'), 'valueChange', false);
    expect(screen.getByTestId('call-form-dispatch-summary').props.children).toBe('calls.everyone');
    await fireEvent(screen.getByTestId('call-form-pending'), 'valueChange', true);
    expect(screen.getByTestId('call-form-submit').props.accessibilityLabel).toBe('calls.save_pending_call');
    await fireEvent.press(screen.getByTestId('call-form-dispatch'));
    expect(screen.queryByTestId('dispatch-selection-everyone', hidden)).toBeNull();
    await fireEvent.press(screen.getByTestId('dispatch-selection-confirm', hidden));
    await fillBasics();
    await act(async () => fireEvent.press(screen.getByTestId('call-form-submit')));
    expect(mockCreateCall).toHaveBeenCalledWith(expect.objectContaining({ isPending: true, dispatchEveryone: false }));
    expect(lastToast().message).toBe('calls.pending_saved');
    expect(router.replace).toHaveBeenCalledWith('/pending-calls');
  });

  it('holds the save back until the field policy has loaded', async () => {
    mockPolicyLoaded = false;
    activateVariant('responder');
    await render(<CallFormScreen mode="create" />);
    await fillBasics();
    expect(screen.getByTestId('call-form-submit').props.accessibilityState).toMatchObject({ disabled: true });
    expect(mockCreateCall).not.toHaveBeenCalled();
  });

  it('needs a type when the department has types', async () => {
    activateVariant('responder');
    await render(<CallFormScreen mode="create" />);
    await fireEvent.changeText(screen.getByTestId('call-form-name'), 'Kitchen fire');
    await fireEvent.changeText(screen.getByTestId('call-form-nature'), 'Smoke from kitchen');
    await act(async () => fireEvent.press(screen.getByTestId('call-form-submit')));
    expect(mockCreateCall).not.toHaveBeenCalled();
    expect(screen.getByTestId('call-form-type-error')).toBeTruthy();
  });

  it('refuses a scheduled dispatch less than 15 minutes ahead', async () => {
    activateVariant('dispatch');
    await render(<CallFormScreen mode="create" />);
    await fillBasics();
    await fireEvent(screen.getByTestId('call-form-dispatch-on'), 'change', new Date(Date.now() + 5 * 60 * 1000).toISOString());
    await act(async () => fireEvent.press(screen.getByTestId('call-form-submit')));
    expect(mockCreateCall).not.toHaveBeenCalled();
    expect(lastToast().message).toBe('calls.dispatch_on_too_soon:15');
  });

  it('never blocks a call on indoor location, which the form cannot pick', async () => {
    mockRules = [{ Key: 'indoorLocation', Visible: true, Required: true }];
    activateVariant('responder');
    await render(<CallFormScreen mode="create" />);
    await fillBasics();
    await act(async () => fireEvent.press(screen.getByTestId('call-form-submit')));
    expect(mockCreateCall).toHaveBeenCalled();
  });

  it('looks an address up on the server and fills a blank address for typed coordinates', async () => {
    mockLookupAddress.mockResolvedValue({ succeeded: true, place: { latitude: 39.7, longitude: -104.9, address: '1 Main St, Denver' } });
    activateVariant('dispatch');
    await render(<CallFormScreen mode="create" />);
    await fireEvent.changeText(screen.getByTestId('call-form-address'), '1 main');
    await act(async () => fireEvent.press(screen.getByTestId('call-form-address-search')));
    expect(mockLookupAddress).toHaveBeenCalledWith('1 main');
    expect(screen.getByTestId('call-form-latitude').props.value).toBe('39.7');
    expect(screen.getByTestId('call-form-longitude').props.value).toBe('-104.9');
    expect(screen.getByTestId('call-form-address').props.value).toBe('1 Main St, Denver');
    expect(lastToast().message).toBe('calls.address_found');

    mockLookupAddress.mockResolvedValue({ succeeded: true, place: null });
    await act(async () => fireEvent.press(screen.getByTestId('call-form-address-search')));
    expect(lastToast().message).toBe('calls.address_not_found');

    await fireEvent.changeText(screen.getByTestId('call-form-address'), '');
    mockLookupAddressAt.mockResolvedValue('5 Elm St');
    await fireEvent.changeText(screen.getByTestId('call-form-latitude'), '39.8');
    await fireEvent.changeText(screen.getByTestId('call-form-longitude'), '-105');
    // Leaving a field looks nothing up: placing the point does.
    await act(async () => fireEvent(screen.getByTestId('call-form-longitude'), 'blur'));
    expect(mockLookupAddressAt).not.toHaveBeenCalled();
    await act(async () => fireEvent.press(screen.getByTestId('call-form-place-on-map')));
    expect(mockLookupAddressAt).toHaveBeenCalledWith(39.8, -105);
    expect(screen.getByTestId('call-form-address').props.value).toBe('5 Elm St');
  });

  it('picks the destination from a searchable list rather than a row of chips', async () => {
    const poi = (PoiId: number, Name: string, PoiTypeName: string, Address = '') => ({ PoiId, Name, PoiTypeName, Address, IsDestination: true });
    // SAFETY: the picker reads only the id, name, type and address of a destination.
    useCallsStore.setState({ destinationPois: [poi(3, 'St. Mary Hospital', 'Hospital', '200 Oak Ave'), poi(1, 'Mercy Medical Center', 'Hospital'), poi(2, 'Station 9', 'Fire Station')] as never });
    activateVariant('dispatch');
    await render(<CallFormScreen mode="create" />);
    await fillBasics();
    expect(screen.getByTestId('call-form-destination')).toHaveTextContent('calls.destination_poi_select');
    expect(screen.queryByTestId('call-form-destination-1')).toBeNull();

    await fireEvent.press(screen.getByTestId('call-form-destination'));
    await fireEvent.changeText(screen.getByTestId('call-destination-search', hidden), 'hosp');
    expect(screen.getByTestId('call-destination-poi-1', hidden)).toBeTruthy();
    expect(screen.getByTestId('call-destination-poi-3', hidden)).toBeTruthy();
    expect(screen.queryByTestId('call-destination-poi-2', hidden)).toBeNull();

    await fireEvent.changeText(screen.getByTestId('call-destination-search', hidden), 'oak ave');
    await fireEvent.press(screen.getByTestId('call-destination-poi-3', hidden));
    expect(screen.getByTestId('call-form-destination')).toHaveTextContent('St. Mary Hospital');

    await fireEvent.press(screen.getByTestId('call-form-destination-clear'));
    expect(screen.getByTestId('call-form-destination')).toHaveTextContent('calls.destination_poi_select');
    await fireEvent.press(screen.getByTestId('call-form-destination'));
    await fireEvent.press(screen.getByTestId('call-destination-poi-2', hidden));
    await fireEvent.press(screen.getByTestId('call-form-dispatch'));
    await fireEvent.press(screen.getByTestId('dispatch-option-units-7', hidden));
    await fireEvent.press(screen.getByTestId('dispatch-selection-confirm', hidden));
    await act(async () => fireEvent.press(screen.getByTestId('call-form-submit')));
    expect(mockCreateCall).toHaveBeenCalledWith(expect.objectContaining({ destinationPoiId: 2 }));
  });

  it('places typed coordinates on the map and keeps an address the dispatcher typed', async () => {
    activateVariant('unit');
    const mapSlot = jest.fn(() => <Text>Map</Text>);
    await render(<CallFormScreen mode="create" mapSlot={mapSlot} />);
    await fireEvent.changeText(screen.getByTestId('call-form-address'), 'Gate 4, County Fairgrounds');
    await fireEvent.changeText(screen.getByTestId('call-form-latitude'), '39.5');
    await fireEvent.changeText(screen.getByTestId('call-form-longitude'), '-105');
    // Typing alone does not move the map.
    expect(mapSlot).toHaveBeenLastCalledWith(null, expect.any(Function));

    await act(async () => fireEvent.press(screen.getByTestId('call-form-place-on-map')));
    expect(mapSlot).toHaveBeenLastCalledWith({ latitude: 39.5, longitude: -105 }, expect.any(Function));
    expect(mockLookupAddressAt).not.toHaveBeenCalled();
    expect(screen.getByTestId('call-form-address').props.value).toBe('Gate 4, County Fairgrounds');
  });

  it('checks each coordinate field and places nothing that is not a valid point', async () => {
    activateVariant('unit');
    const mapSlot = jest.fn(() => <Text>Map</Text>);
    await render(<CallFormScreen mode="create" mapSlot={mapSlot} />);
    await fireEvent.changeText(screen.getByTestId('call-form-latitude'), '95');
    await act(async () => fireEvent(screen.getByTestId('call-form-latitude'), 'blur'));
    expect(screen.getByTestId('call-form-latitude-error')).toHaveTextContent(/calls.latitude_invalid/);
    expect(screen.getByTestId('call-form-place-on-map')).toBeDisabled();

    await fireEvent.changeText(screen.getByTestId('call-form-longitude'), 'west');
    await act(async () => fireEvent.press(screen.getByTestId('call-form-place-on-map')));
    expect(screen.getByTestId('call-form-longitude-error')).toHaveTextContent(/calls.longitude_invalid/);
    expect(mapSlot).toHaveBeenLastCalledWith(null, expect.any(Function));
    expect(mockLookupAddressAt).not.toHaveBeenCalled();

    await fillBasics();
    await fireEvent.changeText(screen.getByTestId('call-form-longitude'), '');
    await act(async () => fireEvent.press(screen.getByTestId('call-form-submit')));
    expect(screen.getByTestId('call-form-longitude-error')).toHaveTextContent(/calls.coordinates_incomplete/);
    expect(mockCreateCall).not.toHaveBeenCalled();
  });

  it('drops the coordinate errors once the map or a lookup fills in a valid point', async () => {
    mockRules = [{ Key: 'geolocation', Visible: true, Required: true }];
    mockLookupAddress.mockResolvedValue({ succeeded: true, place: { latitude: 39.7, longitude: -104.9, address: '1 Main St, Denver' } });
    activateVariant('dispatch');
    const mapSlot = jest.fn<React.ReactNode, Parameters<NonNullable<CallFormScreenProps['mapSlot']>>>(() => <Text>Map</Text>);
    await render(<CallFormScreen mode="create" mapSlot={mapSlot} />);

    // The department requires a location: submitting without one says so on the latitude field.
    await fillBasics();
    await act(async () => fireEvent.press(screen.getByTestId('call-form-submit')));
    expect(screen.getByTestId('call-form-latitude-error')).toHaveTextContent(/calls.validation.required/);

    const onPick = mapSlot.mock.calls.at(-1)?.[1];
    await act(async () => onPick?.({ latitude: 39.6, longitude: -105.1 }));
    expect(screen.getByTestId('call-form-latitude').props.value).toBe('39.6');
    expect(screen.queryByTestId('call-form-latitude-error')).toBeNull();

    await fireEvent.changeText(screen.getByTestId('call-form-longitude'), 'west');
    await act(async () => fireEvent(screen.getByTestId('call-form-longitude'), 'blur'));
    expect(screen.getByTestId('call-form-longitude-error')).toHaveTextContent(/calls.longitude_invalid/);

    await fireEvent.changeText(screen.getByTestId('call-form-address'), '1 main');
    await act(async () => fireEvent.press(screen.getByTestId('call-form-address-search')));
    expect(screen.getByTestId('call-form-longitude').props.value).toBe('-104.9');
    expect(screen.queryByTestId('call-form-longitude-error')).toBeNull();
  });

  it('picks the call contact from the department contacts (built-in picker)', async () => {
    useContactsStore.setState({
      // SAFETY: the picker reads only these fields of a contact record.
      contacts: [{ ContactId: 'c9', CompanyName: 'Acme Corp', Email: 'ops@acme.test', ContactType: 1 } as never],
      fetchContacts: jest.fn(async () => undefined),
    });
    activateVariant('responder');
    await render(<CallFormScreen mode="create" />);
    await fireEvent.press(screen.getByTestId('call-form-contact-picker'));
    await fireEvent.press(screen.getByTestId('call-contact-c9', hidden));
    expect(screen.getByTestId('call-form-contact-name').props.value).toBe('Acme Corp');
    expect(screen.getByTestId('call-form-contact-info').props.value).toBe('ops@acme.test');
    await fillBasics();
    await act(async () => fireEvent.press(screen.getByTestId('call-form-submit')));
    expect(mockCreateCall).toHaveBeenCalledWith(expect.objectContaining({ contactId: 'c9', contactName: 'Acme Corp' }));
  });

  it('starts custom fields at their defaults, sends them and requires the required ones', async () => {
    registerCallFormHookPoints({
      loadUdfFields: async () => [
        // SAFETY: the form reads only these definition fields.
        { UdfFieldId: 'f1', Name: 'Hazmat', Label: 'Hazmat class', IsEnabled: true, IsVisibleOnMobile: true, IsRequired: true, IsReadOnly: false, SortOrder: 1, FieldDataType: 0, DefaultValue: '' } as never,
        // SAFETY: as above.
        { UdfFieldId: 'f2', Name: 'Sector', Label: '', IsEnabled: true, IsVisibleOnMobile: true, IsRequired: false, IsReadOnly: false, SortOrder: 2, FieldDataType: 0, DefaultValue: 'North' } as never,
      ],
    });
    activateVariant('dispatch');
    await render(<CallFormScreen mode="create" />);
    await waitFor(() => expect(screen.getByTestId('call-form-udf')).toBeTruthy());
    await fillBasics();
    await act(async () => fireEvent.press(screen.getByTestId('call-form-submit')));
    expect(mockCreateCall).not.toHaveBeenCalled();
    expect(lastToast().message).toBe('calls.required_fields_missing:Hazmat class');
    await fireEvent.changeText(screen.getByTestId('udf-input-f1'), '3');
    await act(async () => fireEvent.press(screen.getByTestId('call-form-submit')));
    expect(mockCreateCall).toHaveBeenCalledWith(
      expect.objectContaining({
        udfValues: expect.arrayContaining([
          { UdfFieldId: 'f1', Value: '3' },
          { UdfFieldId: 'f2', Value: 'North' },
        ]),
      })
    );
  });

  it('renders hook points: run-card recommendation only with calls.runCards and the Dispatch.RunCards flag, plus contact picker', async () => {
    featureFlagsStore.setState({ flags: { 'Dispatch.RunCards': { enabled: true } } as never });
    registerCallFormHookPoints({
      RunCardRecommendation: ({ onApply }) => (
        <Text testID="run-card" onPress={() => onApply({ everyone: false, users: [], groups: [], roles: [], units: ['7'] }, { outcomeNodeKey: 'node-1' })}>
          Recommendation
        </Text>
      ),
      ContactPicker: () => null,
    });
    activateVariant('responder');
    const { unmount } = await render(<CallFormScreen mode="create" />);
    expect(screen.queryByTestId('run-card')).toBeNull();
    expect(screen.getByTestId('call-form-contact-picker')).toBeTruthy();
    await unmount();

    activateVariant('dispatch');
    await render(<CallFormScreen mode="create" />);
    await fireEvent.press(screen.getByTestId('run-card'));
    await fillBasics();
    await act(async () => fireEvent.press(screen.getByTestId('call-form-submit')));
    expect(mockCreateCall).toHaveBeenCalledWith(expect.objectContaining({ dispatchUnits: ['7'], runCardOutcomeNodeKey: 'node-1', contactId: null }));
  });

  it('renders the map slot placeholder with the placed coordinates', async () => {
    activateVariant('unit');
    const mapSlot = jest.fn(() => <Text>Map</Text>);
    await render(<CallFormScreen mode="create" mapSlot={mapSlot} />);
    await fireEvent.changeText(screen.getByTestId('call-form-latitude'), '39.5, -105');
    await act(async () => fireEvent.press(screen.getByTestId('call-form-place-on-map')));
    expect(screen.getByTestId('call-form-map-slot')).toBeTruthy();
    expect(mapSlot).toHaveBeenLastCalledWith({ latitude: 39.5, longitude: -105 }, expect.any(Function));
  });

  it('refuses to create where calls.create is none or without the right', async () => {
    activateVariant('bigboard');
    const { unmount } = await render(<CallFormScreen mode="create" />);
    expect(screen.getByTestId('call-form-not-allowed')).toBeTruthy();
    await unmount();
    activateVariant('responder');
    setRights({ CanCreateCalls: false });
    await render(<CallFormScreen mode="create" />);
    expect(screen.getByTestId('call-form-not-allowed')).toBeTruthy();
  });
});

describe('CallFormScreen: edit', () => {
  beforeEach(() => {
    useCallDetailStore.setState({
      details: {
        // SAFETY: the edit reads only the dispatches and protocols from the extra data.
        '42': {
          call: makeCall('42', { Name: 'Edit me', ContactName: 'Hidden contact', Latitude: '39.1', Longitude: '-104.8' }),
          extraData: { Dispatches: [] } as never,
          notes: [],
          images: null,
          files: null,
          audio: null,
          fetchedAt: 1,
        },
      },
    });
  });

  it("never starts an edit without the call's dispatches (saving would un-dispatch them), and offers a retry", async () => {
    const fetchCallDetail = jest.fn(async () => undefined);

    useCallDetailStore.setState({
      details: { '42': { call: makeCall('42', { Name: 'Edit me' }), extraData: null, notes: [], images: null, files: null, audio: null, fetchedAt: 1 } },
      fetchCallDetail,
    });
    activateVariant('dispatch');
    await render(<CallFormScreen mode="edit" callId="42" />);
    await waitFor(() => expect(screen.getByTestId('call-form-load-error')).toBeTruthy());
    expect(screen.queryByTestId('call-form-submit')).toBeNull();
    await act(async () => fireEvent.press(screen.getByTestId('call-form-load-retry')));
    expect(fetchCallDetail).toHaveBeenLastCalledWith('42', { bypassCache: true });
  });

  it("refuses to edit someone else's call for a non-admin, a closed call, or without the right", async () => {
    activateVariant('dispatch');

    const editRefused = async () => {
      const view = await render(<CallFormScreen mode="edit" callId="42" />);
      await waitFor(() => expect(screen.queryByTestId('call-form-edit-not-allowed') ?? screen.queryByTestId('call-form-submit')).toBeTruthy());
      const refused = screen.queryByTestId('call-form-edit-not-allowed') !== null;
      await view.unmount();

      return refused;
    };

    const setCall = (overrides: Parameters<typeof makeCall>[1]) => useCallDetailStore.setState((state) => ({ details: { '42': { ...state.details['42'], call: makeCall('42', { Name: 'Edit me', ...overrides }) } } }));

    setCall({ ReportingUserId: 'someone-else' });
    expect(await editRefused()).toBe(true);

    setRights({ IsAdmin: true });
    expect(await editRefused()).toBe(false);

    setCall({ ReportingUserId: 'someone-else', State: 1 });
    expect(await editRefused()).toBe(true);

    setCall({});
    setRights({ CanCreateCalls: false });
    expect(await editRefused()).toBe(true);
  });

  it('starts from the call and leaves fields the policy hides as the call stores them', async () => {
    mockRules = [{ Key: 'contactName', Visible: false, Required: false }];
    activateVariant('responder');
    await render(<CallFormScreen mode="edit" callId="42" />);
    await waitFor(() => expect(screen.getByTestId('call-form-name').props.value).toBe('Edit me'));
    expect(screen.queryByTestId('call-form-contact-name')).toBeNull();
    await act(async () => fireEvent.press(screen.getByTestId('call-form-submit')));
    // A hidden text field goes up blank, which EditCall reads as "keep the stored value" (Dispatch).
    expect(mockUpdateCall).toHaveBeenCalledWith(expect.objectContaining({ callId: '42', name: 'Edit me', type: 'Fire', contactName: '', latitude: 39.1, longitude: -104.8, notifyCancelledEntities: false }));
    expect(lastToast().message).toBe('call_detail.update_call_success');
  });

  it('shows a nature and note the web wrote as rich text as plain text, and saves them as stored unless they change', async () => {
    const nature = '<p>JUST A TEST!</p><p>Smoke &amp; flames</p>';
    const note = '<p><strong>Gate</strong> code 1234</p>';
    useCallDetailStore.setState({
      details: {
        // SAFETY: the edit reads only the dispatches from the extra data.
        '42': { call: makeCall('42', { Name: 'Smith &amp; Sons', Nature: nature, Note: note }), extraData: { Dispatches: [] } as never, notes: [], images: null, files: null, audio: null, fetchedAt: 1 },
      },
    });
    activateVariant('dispatch');
    await render(<CallFormScreen mode="edit" callId="42" />);
    await waitFor(() => expect(screen.getByTestId('call-form-nature').props.value).toBe('JUST A TEST!\nSmoke & flames'));
    expect(screen.getByTestId('call-form-name').props.value).toBe('Smith & Sons');
    expect(screen.getByTestId('call-form-note').props.value).toBe('Gate code 1234');
    await act(async () => fireEvent.press(screen.getByTestId('call-form-submit')));
    expect(mockUpdateCall).toHaveBeenLastCalledWith(expect.objectContaining({ name: 'Smith & Sons', nature, note }));
    await fireEvent.changeText(screen.getByTestId('call-form-nature'), 'JUST A TEST!\nFire out');
    await act(async () => fireEvent.press(screen.getByTestId('call-form-submit')));
    expect(mockUpdateCall).toHaveBeenLastCalledWith(expect.objectContaining({ nature: '<p>JUST A TEST!</p><p>Fire out</p>', note }));
  });

  it('adds protocols to the ones attached, can notify removed resources and names fields the server refused', async () => {
    useCallDetailStore.setState({
      details: {
        // SAFETY: the edit reads only the protocols' names and count from the extra data.
        '42': { call: makeCall('42', { Name: 'Edit me' }), extraData: { Protocols: [{ Name: 'Cardiac' }], Dispatches: [] } as never, notes: [], images: null, files: null, audio: null, fetchedAt: 1 },
      },
    });
    activateVariant('dispatch');
    await render(<CallFormScreen mode="edit" callId="42" />);
    await waitFor(() => expect(screen.getByTestId('call-form-protocols-attached')).toBeTruthy());
    expect(screen.getByText('calls.protocols.attached:Cardiac')).toBeTruthy();
    expect(screen.getByText('calls.linked_calls.edit_hint')).toBeTruthy();
    await fireEvent(screen.getByTestId('call-form-notify-cancelled'), 'valueChange', true);
    mockUpdateCall.mockRejectedValueOnce(new ApiError({ kind: 'http', status: 400, data: 'Required call fields are missing: address' }));
    await act(async () => fireEvent.press(screen.getByTestId('call-form-submit')));
    expect(mockUpdateCall).toHaveBeenCalledWith(expect.objectContaining({ notifyCancelledEntities: true, protocolIds: [] }));
    expect(lastToast().message).toBe('calls.required_fields_missing_edit:calls.address');
  });

  it('does not save an edit offline', async () => {
    jest.mocked(useNetInfo).mockReturnValue({ isConnected: false, isInternetReachable: false } as never);
    activateVariant('dispatch');
    await render(<CallFormScreen mode="edit" callId="42" />);
    await act(async () => fireEvent.press(screen.getByTestId('call-form-submit')));
    expect(mockUpdateCall).not.toHaveBeenCalled();
    expect(lastToast().message).toBe('calls.edit.offline');
  });
});
