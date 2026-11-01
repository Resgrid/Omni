import './test-setup';

import { useNetInfo } from '@react-native-community/netinfo';
import { buildNewCallInput, type CreateCallRequest } from '@resgrid/api';
import { featureFlagsStore } from '@resgrid/auth';
import { useCallDetailStore, useCallsStore } from '@resgrid/data';
import type { NewCallFieldRuleData } from '@resgrid/models';
import { useToastStore } from '@resgrid/ui';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import React from 'react';
import { Text } from 'react-native';

import { registerCallFormHookPoints, resetCallFormHookPointsForTests } from '../hook-points';
import { createFieldPolicy } from '../lib/field-policy';
import CallFormScreen from '../screens/call-form';
import { activateVariant, hidden, makeCall, setRights } from './test-utils';

let mockRules: NewCallFieldRuleData[] = [];
jest.mock('../hooks/use-call-form-data', () => ({
  useNewCallFieldPolicy: () => mockCreatePolicy(mockRules),
  useCallTemplates: () => ({ templates: mockTemplates, isLoading: false }),
  useDispatchRecipients: () => ({ recipients: mockRecipients, isLoading: false }),
}));
const mockCreatePolicy = (rules: NewCallFieldRuleData[]) => createFieldPolicy(rules);
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

const fillBasics = () => {
  fireEvent.changeText(screen.getByTestId('call-form-name'), 'Kitchen fire');
  fireEvent.changeText(screen.getByTestId('call-form-nature'), 'Smoke from kitchen');
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
  it('quick create shows the core fields only; full shows contact, references, dispatch and pickers', () => {
    activateVariant('unit', { calls: { create: 'quick' } });
    const { unmount } = render(<CallFormScreen mode="create" />);
    expect(screen.getByTestId('call-form-name')).toBeTruthy();
    expect(screen.getByTestId('call-form-address')).toBeTruthy();
    expect(screen.queryByTestId('call-form-contact-name')).toBeNull();
    expect(screen.queryByTestId('call-form-external-id')).toBeNull();
    expect(screen.queryByTestId('call-form-dispatch')).toBeNull();
    expect(screen.queryByTestId('call-form-protocols')).toBeNull();
    unmount();

    activateVariant('unit');
    render(<CallFormScreen mode="create" />);
    expect(screen.getByTestId('call-form-contact-name')).toBeTruthy();
    expect(screen.getByTestId('call-form-external-id')).toBeTruthy();
    expect(screen.getByTestId('call-form-dispatch')).toBeTruthy();
    expect(screen.getByTestId('call-form-protocols')).toBeTruthy();
    expect(screen.getByTestId('call-form-linked')).toBeTruthy();
    // Scheduling and pending need calls.queues (Dispatch).
    expect(screen.queryByTestId('call-form-scheduling')).toBeNull();
  });

  it('honours the field policy: hidden fields are not rendered, a quick form shows fields the policy requires', () => {
    mockRules = [
      { Key: 'contactName', Visible: true, Required: true },
      { Key: 'externalId', Visible: false, Required: false },
    ];
    activateVariant('unit', { calls: { create: 'quick' } });
    render(<CallFormScreen mode="create" />);
    expect(screen.getByTestId('call-form-contact-name')).toBeTruthy();
    expect(screen.queryByTestId('call-form-external-id')).toBeNull();
  });

  it('blocks submit while a policy-required field is blank and says which', async () => {
    mockRules = [{ Key: 'address', Visible: true, Required: true }];
    activateVariant('responder');
    render(<CallFormScreen mode="create" />);
    fillBasics();
    await act(async () => fireEvent.press(screen.getByTestId('call-form-submit')));
    expect(mockCreateCall).not.toHaveBeenCalled();
    expect(lastToast().message).toBe('calls.required_fields_missing:calls.address');
    expect(screen.getByTestId('call-form-address-error')).toBeTruthy();
  });

  it('creates a call through the store (outbox) with a default priority and dispatch selection', async () => {
    activateVariant('responder');
    render(<CallFormScreen mode="create" />);
    fillBasics();
    fireEvent.changeText(screen.getByTestId('call-form-coordinates'), '39.74, -104.99');
    fireEvent.press(screen.getByTestId('call-form-dispatch'));
    fireEvent.press(screen.getByTestId('dispatch-option-units-7', hidden));
    fireEvent.press(screen.getByTestId('dispatch-selection-confirm', hidden));
    await act(async () => fireEvent.press(screen.getByTestId('call-form-submit')));
    expect(mockCreateCall).toHaveBeenCalledWith(expect.objectContaining({ name: 'Kitchen fire', nature: 'Smoke from kitchen', priority: 0, latitude: 39.74, longitude: -104.99, dispatchUnits: ['7'], protocolIds: [] }));
    expect(lastToast().message).toBe('calls.create_success');
    expect(router.back).toHaveBeenCalled();
  });

  it('offline: shows the banner, queues the call and says it is not dispatched yet', async () => {
    jest.mocked(useNetInfo).mockReturnValue({ isConnected: false, isInternetReachable: false } as never);
    mockCreateCall.mockResolvedValue({ outcome: 'queued', id: 'local-q' });
    activateVariant('dispatch');
    render(<CallFormScreen mode="create" />);
    expect(screen.getByTestId('offline-call-banner')).toBeTruthy();
    expect(screen.getByText('calls.offline.no_geocoding')).toBeTruthy();
    fillBasics();
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
    render(<CallFormScreen mode="create" />);
    fillBasics();
    await act(async () => fireEvent.press(screen.getByTestId('call-form-submit')));
    expect(lastToast().message).toBe('calls.queued.rejected_on_create');
    expect(screen.getByTestId('call-form-correction')).toBeTruthy();
    fireEvent.changeText(screen.getByTestId('call-form-address'), '12 Oak St');
    await act(async () => fireEvent.press(screen.getByTestId('call-form-submit')));
    expect(mockCorrectQueuedCall).toHaveBeenCalledWith('local-r', expect.objectContaining({ address: '12 Oak St', name: 'Kitchen fire' }));
    expect(mockCreateCall).toHaveBeenCalledTimes(1);
  });

  it('corrects a rejected queued call opened from Pending sync', async () => {
    activateVariant('unit');
    const request: CreateCallRequest = { name: 'Offline call', nature: 'Downed lines', priority: 0, address: 'Wrong St' };
    useCallsStore.setState({ queuedCalls: { 'local-7': { localId: 'local-7', request, input: buildNewCallInput(request), createdAt: 1, state: 'rejected' } } });
    render(<CallFormScreen mode="create" correctLocalId="local-7" />);
    expect(screen.getByText('calls.queued.rejected_badge')).toBeTruthy();
    expect(screen.getByTestId('call-form-name').props.value).toBe('Offline call');
    fireEvent.changeText(screen.getByTestId('call-form-address'), 'Right St');
    await act(async () => fireEvent.press(screen.getByTestId('call-form-submit')));
    expect(mockCorrectQueuedCall).toHaveBeenCalledWith('local-7', expect.objectContaining({ address: 'Right St' }));
    expect(lastToast().message).toBe('calls.queued.resubmitted');
  });

  it('applies a call template', () => {
    activateVariant('dispatch');
    render(<CallFormScreen mode="create" />);
    fireEvent.press(screen.getByTestId('call-form-templates'));
    fireEvent.press(screen.getByTestId('call-template-t1', hidden));
    expect(screen.getByTestId('call-form-name').props.value).toBe('Structure Fire');
    expect(screen.getByTestId('call-form-priority-3').props.accessibilityState).toEqual({ selected: true });
  });

  it('offers pending/scheduling with calls.queues and drops "Everyone" for a pending call', async () => {
    activateVariant('dispatch');
    render(<CallFormScreen mode="create" />);
    fireEvent(screen.getByTestId('call-form-pending'), 'valueChange', true);
    fireEvent.press(screen.getByTestId('call-form-dispatch'));
    expect(screen.queryByTestId('dispatch-selection-everyone', hidden)).toBeNull();
    fireEvent.press(screen.getByTestId('dispatch-selection-confirm', hidden));
    fillBasics();
    await act(async () => fireEvent.press(screen.getByTestId('call-form-submit')));
    expect(mockCreateCall).toHaveBeenCalledWith(expect.objectContaining({ isPending: true }));
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
    const { unmount } = render(<CallFormScreen mode="create" />);
    expect(screen.queryByTestId('run-card')).toBeNull();
    expect(screen.getByTestId('call-form-contact-picker')).toBeTruthy();
    unmount();

    activateVariant('dispatch');
    render(<CallFormScreen mode="create" />);
    fireEvent.press(screen.getByTestId('run-card'));
    fillBasics();
    await act(async () => fireEvent.press(screen.getByTestId('call-form-submit')));
    expect(mockCreateCall).toHaveBeenCalledWith(expect.objectContaining({ dispatchUnits: ['7'], runCardOutcomeNodeKey: 'node-1', contactId: null }));
  });

  it('renders the map slot placeholder with the typed coordinates', () => {
    activateVariant('unit');
    const mapSlot = jest.fn(() => <Text>Map</Text>);
    render(<CallFormScreen mode="create" mapSlot={mapSlot} />);
    fireEvent.changeText(screen.getByTestId('call-form-coordinates'), '39.5, -105');
    expect(screen.getByTestId('call-form-map-slot')).toBeTruthy();
    expect(mapSlot).toHaveBeenLastCalledWith({ latitude: 39.5, longitude: -105 }, expect.any(Function));
  });

  it('refuses to create where calls.create is none or without the right', () => {
    activateVariant('bigboard');
    const { unmount } = render(<CallFormScreen mode="create" />);
    expect(screen.getByTestId('call-form-not-allowed')).toBeTruthy();
    unmount();
    activateVariant('responder');
    setRights({ CanCreateCalls: false });
    render(<CallFormScreen mode="create" />);
    expect(screen.getByTestId('call-form-not-allowed')).toBeTruthy();
  });
});

describe('CallFormScreen: edit', () => {
  beforeEach(() => {
    useCallDetailStore.setState({
      details: {
        '42': { call: makeCall('42', { Name: 'Edit me', ContactName: 'Hidden contact', Latitude: '39.1', Longitude: '-104.8' }), extraData: null, notes: [], images: null, files: null, audio: null, fetchedAt: 1 },
      },
    });
  });

  it('starts from the call and resends fields the policy hides', async () => {
    mockRules = [{ Key: 'contactName', Visible: false, Required: false }];
    activateVariant('responder');
    render(<CallFormScreen mode="edit" callId="42" />);
    await waitFor(() => expect(screen.getByTestId('call-form-name').props.value).toBe('Edit me'));
    expect(screen.queryByTestId('call-form-contact-name')).toBeNull();
    await act(async () => fireEvent.press(screen.getByTestId('call-form-submit')));
    expect(mockUpdateCall).toHaveBeenCalledWith(expect.objectContaining({ callId: '42', name: 'Edit me', contactName: 'Hidden contact', latitude: 39.1, longitude: -104.8 }));
    expect(lastToast().message).toBe('call_detail.update_call_success');
  });

  it('does not save an edit offline', async () => {
    jest.mocked(useNetInfo).mockReturnValue({ isConnected: false, isInternetReachable: false } as never);
    activateVariant('dispatch');
    render(<CallFormScreen mode="edit" callId="42" />);
    await act(async () => fireEvent.press(screen.getByTestId('call-form-submit')));
    expect(mockUpdateCall).not.toHaveBeenCalled();
    expect(lastToast().message).toBe('calls.edit.offline');
  });
});
