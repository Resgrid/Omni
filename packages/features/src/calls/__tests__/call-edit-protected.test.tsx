import './test-setup';

import { useNetInfo } from '@react-native-community/netinfo';
import { useCallDetailStore, useCallsStore, useContactsStore } from '@resgrid/data';
import type { CallResultData, NewCallFieldRuleData } from '@resgrid/models';
import { useToastStore } from '@resgrid/ui';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import { registerCallFormHookPoints, resetCallFormHookPointsForTests } from '../hook-points';
import { type CallFormEditContext, callToFormValues, keepWithheldEditFieldsUnchanged, syncWithheldEditFields, toUpdateCallRequest, validateCallForm, withheldEditFields } from '../lib/call-form';
import { createFieldPolicy } from '../lib/field-policy';
import CallFormScreen from '../screens/call-form';
import { activateVariant, makeCall, setRights } from './test-utils';

let mockRules: NewCallFieldRuleData[] = [];

jest.mock('../hooks/use-call-form-data', () => ({
  useNewCallFieldPolicy: () => mockCreatePolicy(mockRules),
  useCallTemplates: () => ({ templates: [], isLoading: false }),
  useDispatchRecipients: () => ({ recipients: { personnel: [], groups: [], roles: [], units: [] }, isLoading: false }),
}));

const mockCreatePolicy = (rules: NewCallFieldRuleData[]) => createFieldPolicy(rules, true);

const WITHHELD = ['calls.name', 'calls.natureofcall', 'calls.address', 'calls.geolocationdata', 'calls.contactname'];

/** A call as the server sends it without a grant: the withheld fields hold the sentinel and are listed. */
const withheldCall = (overrides: Partial<CallResultData> = {}): CallResultData =>
  makeCall('42', {
    Name: 'REDACTED',
    Nature: 'REDACTED',
    Address: 'REDACTED',
    Geolocation: 'REDACTED',
    Latitude: 'REDACTED',
    Longitude: 'REDACTED',
    ContactName: 'REDACTED',
    ContactInfo: '555-0100',
    Note: 'Gate code 1234',
    RedactedFields: WITHHELD,
    ...overrides,
  });

const revealedCall = (): CallResultData =>
  makeCall('42', {
    Name: 'Overdose',
    Nature: 'Unresponsive male',
    Address: '9 Elm St',
    Geolocation: '39.1,-104.8',
    Latitude: '39.1',
    Longitude: '-104.8',
    ContactName: 'Sam Doe',
    ContactInfo: '555-0100',
    RedactedFields: [],
  });

const editOf = (call: CallResultData): CallFormEditContext => ({ call, storedProtocolCount: 0, initialDispatchOnUtc: '' });

const pickers = { protocols: false, linkedCall: false, udf: false, contact: false, dispatchList: false };

describe('edit form values for withheld fields (lib)', () => {
  it('lists the withheld fields by the server list, the sentinel only as the fallback', () => {
    expect([...withheldEditFields(withheldCall())].sort()).toEqual(['address', 'contactName', 'coordinates', 'name', 'nature']);
    expect([...withheldEditFields(makeCall('1', { Name: 'REDACTED' }))]).toEqual(['name']);
    expect([...withheldEditFields(makeCall('1', { Name: 'REDACTED', RedactedFields: [] }))]).toEqual([]);
  });

  it('never starts the form from the sentinel', () => {
    const values = callToFormValues(withheldCall());

    expect(Object.values(values)).not.toContain('REDACTED');
    expect(values).toEqual(expect.objectContaining({ name: '', nature: '', address: '', latitude: '', longitude: '', contactName: '', contactInfo: '555-0100', note: 'Gate code 1234' }));
  });

  it('does not ask for a withheld name or nature, and a withheld point meets a required location', () => {
    const call = withheldCall();

    const validation = validateCallForm(callToFormValues(call), {
      policy: createFieldPolicy([{ Key: 'geolocation', Visible: true, Required: true }], true),
      validPriorityIds: [1],
      validTypeNames: ['Fire'],
      edit: editOf(call),
    });

    expect(validation.errors).toEqual({});
    expect(validation.isValid).toBe(true);
  });

  it('saves withheld fields as stored: the sentinel for name and nature, blank text, no point', () => {
    const call = withheldCall();
    const request = toUpdateCallRequest('42', { ...callToFormValues(call), address: '1 Picked Rd', latitude: '40', longitude: '-105' }, pickers, { edit: editOf(call), isVisible: () => true });

    expect(request).toEqual(expect.objectContaining({ name: 'REDACTED', nature: 'REDACTED', address: '', contactName: '', contactInfo: '555-0100', note: 'Gate code 1234' }));
    expect(request.latitude).toBeUndefined();
    expect(request.longitude).toBeUndefined();
    expect(keepWithheldEditFieldsUnchanged(request, revealedCall())).toEqual(request);
  });

  it('fills fields a reveal made readable and empties fields withheld again, keeping other edits', () => {
    const withheld = withheldCall();
    const typed = { ...callToFormValues(withheld), note: 'Typed note' };
    const revealed = syncWithheldEditFields(typed, revealedCall(), withheldEditFields(withheld));

    expect(revealed).toEqual(expect.objectContaining({ name: 'Overdose', nature: 'Unresponsive male', address: '9 Elm St', latitude: '39.1', longitude: '-104.8', contactName: 'Sam Doe', note: 'Typed note' }));
    const concealed = syncWithheldEditFields({ ...revealed, name: 'Overdose, second patient' }, withheld, new Set());

    expect(concealed).toEqual(expect.objectContaining({ name: '', nature: '', address: '', latitude: '', longitude: '', contactName: '', note: 'Typed note' }));
  });
});

describe('CallFormScreen: edit with withheld fields', () => {
  const mockUpdateCall = jest.fn();

  const setDetail = (call: CallResultData) =>
    useCallDetailStore.setState((state) => ({
      // SAFETY: the edit reads only the dispatches and protocols from the extra data.
      details: { ...state.details, '42': { call, extraData: { Dispatches: [] } as never, notes: [], images: null, files: null, audio: null, fetchedAt: 1 } },
    }));

  beforeEach(() => {
    mockRules = [];
    mockUpdateCall.mockReset().mockResolvedValue(undefined);
    resetCallFormHookPointsForTests();
    useToastStore.getState().clearToasts();
    // SAFETY: the form reads only isConnected and isInternetReachable from NetInfo.
    jest.mocked(useNetInfo).mockReturnValue({ isConnected: true, isInternetReachable: true } as never);
    setRights({});
    useCallsStore.setState({ callPriorities: [], callTypes: [{ Id: 'a', Name: 'Fire' }], destinationPois: [], queuedCalls: {}, calls: [], fetchCallFormData: jest.fn(async () => undefined) });
    useCallDetailStore.setState({ details: {}, fetchCallDetail: jest.fn(async () => undefined), updateCall: mockUpdateCall });
    setDetail(withheldCall());
    activateVariant('dispatch');
  });

  it('shows withheld fields locked, never the sentinel, and saves them unchanged', async () => {
    registerCallFormHookPoints({ LocationPicker: () => null });
    await render(<CallFormScreen mode="edit" callId="42" />);
    await waitFor(() => expect(screen.getByTestId('call-form-name-protected')).toBeTruthy());

    for (const field of ['name', 'nature', 'address', 'latitude', 'longitude', 'contact-name']) {
      expect(screen.getByTestId(`call-form-${field}-protected-label`)).toBeTruthy();
    }

    expect(screen.queryByTestId('call-form-name')).toBeNull();
    expect(screen.queryByText(/REDACTED/)).toBeNull();
    // Nothing to pick on: a picked point would be dropped by the save.
    expect(screen.queryByTestId('call-form-pick-location')).toBeNull();
    expect(screen.queryByTestId('call-form-place-on-map')).toBeNull();
    expect(screen.getByTestId('call-form-contact-info').props.value).toBe('555-0100');
    await act(async () => fireEvent.press(screen.getByTestId('call-form-submit')));
    expect(mockUpdateCall).toHaveBeenCalledWith(expect.objectContaining({ callId: '42', name: 'REDACTED', nature: 'REDACTED', address: '', contactName: '', contactInfo: '555-0100', type: 'Fire' }));
    expect(mockUpdateCall.mock.calls[0][0].latitude).toBeUndefined();
  });

  it('unlocks the fields once a reveal re-reads the call and drops typed plaintext when the grant ends', async () => {
    await render(<CallFormScreen mode="edit" callId="42" />);
    await waitFor(() => expect(screen.getByTestId('call-form-name-protected')).toBeTruthy());
    await act(async () => setDetail(revealedCall()));
    await waitFor(() => expect(screen.getByTestId('call-form-name').props.value).toBe('Overdose'));
    await fireEvent.changeText(screen.getByTestId('call-form-name'), 'Overdose, second patient');
    await act(async () => setDetail(withheldCall()));
    await waitFor(() => expect(screen.getByTestId('call-form-name-protected')).toBeTruthy());
    await act(async () => fireEvent.press(screen.getByTestId('call-form-submit')));
    expect(mockUpdateCall).toHaveBeenCalledWith(expect.objectContaining({ name: 'REDACTED', address: '' }));
  });

  it('names the call’s contact as protected after a conceal, even when it was picked while revealed', async () => {
    mockRules = [{ Key: 'primaryContact', Visible: true, Required: false }];
    const contact = (Name: string) => [{ ContactId: 'c9', Name, ContactType: 1, CallContactType: 0, HasPreplan: false, AlertNoteCount: 0, HazardCount: 0 }];
    useContactsStore.setState({
      // SAFETY: the picker reads only these fields of a contact record.
      contacts: [{ ContactId: 'c9', CompanyName: 'Acme Corp', ContactType: 1 } as never],
      fetchContacts: jest.fn(async () => undefined),
    });
    setDetail({ ...revealedCall(), Contacts: contact('Acme Corp') });

    await render(<CallFormScreen mode="edit" callId="42" />);
    await waitFor(() => expect(screen.getByTestId('call-form-linked-contact')).toHaveTextContent('calls.contact_picker.linked:Acme Corp'));
    await fireEvent.press(screen.getByTestId('call-form-contact-picker'));
    await fireEvent.press(screen.getByTestId('call-contact-c9', { includeHiddenElements: true }));
    expect(screen.getByTestId('call-form-linked-contact')).toHaveTextContent('calls.contact_picker.linked:Acme Corp');

    await act(async () => setDetail({ ...withheldCall(), Contacts: contact('REDACTED') }));
    await waitFor(() => expect(screen.getByTestId('call-form-linked-contact')).toHaveTextContent('calls.contact_picker.linked:data_protection.protected_value'));
    expect(screen.queryByText(/Acme Corp/)).toBeNull();
  });
});
