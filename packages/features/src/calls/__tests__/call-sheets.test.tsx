import './test-setup';

import { ApiError } from '@resgrid/api';
import { useCallDetailStore, useCallsStore, useCommandStore } from '@resgrid/data';
import { useToastStore } from '@resgrid/ui';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { CallNotesPanel } from '../components/call-notes-panel';
import { CloseCallSheet } from '../components/close-call-sheet';
import { DispatchSelectionModal, summarizeDispatchSelection } from '../components/dispatch-selection';
import { EMPTY_DISPATCH_SELECTION } from '../lib/call-form';
import { activateVariant, hidden, setRights } from './test-utils';

const mockCloseCall = jest.fn();
const mockAddNote = jest.fn();

const recipients = {
  personnel: [{ UserId: 'u1', FirstName: 'Pat', LastName: 'Smith', GroupName: 'Station 1' }],
  groups: [{ GroupId: 'g1', Name: 'Station 1' }],
  roles: [{ RoleId: 'r1', Name: 'Medic' }],
  units: [{ UnitId: '7', Name: 'Engine 7', GroupName: 'Station 1' }],
} as never;

const lastToast = () => useToastStore.getState().toasts.at(-1);

beforeEach(() => {
  activateVariant('responder');
  setRights({});
  useToastStore.getState().clearToasts();
  mockCloseCall.mockResolvedValue(undefined);
  useCallDetailStore.setState({ details: {}, queuedNotes: {}, loading: {}, closeCall: mockCloseCall, addNote: mockAddNote, fetchCallNotes: jest.fn(async () => undefined) });
  useCallsStore.setState({ fetchCalls: jest.fn(async () => undefined) });
  useCommandStore.setState({ boards: {}, summaries: [] });
});

afterEach(() => useToastStore.getState().clearToasts());

describe('CloseCallSheet', () => {
  it('requires a close type, then closes with the note and "notify everyone" on by default', async () => {
    const onClosed = jest.fn();
    render(<CloseCallSheet isOpen onClose={jest.fn()} callId="5" onClosed={onClosed} />);
    await act(async () => fireEvent.press(screen.getByTestId('close-call-submit', hidden)));
    expect(mockCloseCall).not.toHaveBeenCalled();
    expect(lastToast()?.message).toBe('call_detail.close_call_type_required');

    fireEvent.press(screen.getByTestId('close-call-type-3', hidden));
    fireEvent.changeText(screen.getByTestId('close-call-note', hidden), 'Nothing found');
    await act(async () => fireEvent.press(screen.getByTestId('close-call-submit', hidden)));
    expect(mockCloseCall).toHaveBeenCalledWith({ callId: '5', type: 3, note: 'Nothing found', sendNotification: true });
    expect(onClosed).toHaveBeenCalled();
  });

  it('is blocked with an explanation while the call has an active incident command', async () => {
    useCommandStore.setState({ summaries: [{ IncidentCommandId: 'ic1', DepartmentId: 1, CallId: 5, Status: 0, EstablishedOn: '', AssignedPersonnelCount: 0, AssignedUnitCount: 0 }] });
    render(<CloseCallSheet isOpen onClose={jest.fn()} callId="5" />);
    expect(screen.getByTestId('close-call-blocked', hidden)).toBeTruthy();
    expect(screen.getByText('calls.close.blocked_by_command', hidden)).toBeTruthy();
    fireEvent.press(screen.getByTestId('close-call-type-1', hidden));
    await act(async () => fireEvent.press(screen.getByTestId('close-call-submit', hidden)));
    expect(mockCloseCall).not.toHaveBeenCalled();
  });

  it('treats a command established offline (provisional board) as active', () => {
    useCommandStore.setState({ boards: { '5': { callId: '5', board: null, adHocUnits: [], adHocPersonnel: [], isProvisional: true, lastRefreshed: null } } });
    render(<CloseCallSheet isOpen onClose={jest.fn()} callId="5" />);
    expect(screen.getByTestId('close-call-blocked', hidden)).toBeTruthy();
  });

  it("shows the server's reason when it refuses the close", async () => {
    mockCloseCall.mockRejectedValue(new ApiError({ kind: 'http', status: 400, data: 'Close the incident command first.' }));
    const onClose = jest.fn();
    render(<CloseCallSheet isOpen onClose={onClose} callId="5" />);
    fireEvent.press(screen.getByTestId('close-call-type-1', hidden));
    await act(async () => fireEvent.press(screen.getByTestId('close-call-submit', hidden)));
    expect(lastToast()?.message).toBe('Close the incident command first.');
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('DispatchSelectionModal', () => {
  it('selects personnel, groups, roles and units, with search', () => {
    const onConfirm = jest.fn();
    render(<DispatchSelectionModal isOpen onClose={jest.fn()} recipients={recipients} value={EMPTY_DISPATCH_SELECTION} onConfirm={onConfirm} />);
    fireEvent.press(screen.getByTestId('dispatch-option-users-u1', hidden));
    fireEvent.press(screen.getByTestId('dispatch-option-groups-g1', hidden));
    fireEvent.press(screen.getByTestId('dispatch-option-roles-r1', hidden));
    fireEvent.press(screen.getByTestId('dispatch-option-units-7', hidden));
    expect(screen.getByTestId('dispatch-option-units-7', hidden).props.accessibilityState).toEqual({ checked: true });
    fireEvent.changeText(screen.getByTestId('dispatch-selection-search', hidden), 'engine');
    expect(screen.queryByTestId('dispatch-option-users-u1', hidden)).toBeNull();
    fireEvent.press(screen.getByTestId('dispatch-selection-confirm', hidden));
    expect(onConfirm).toHaveBeenCalledWith({ everyone: false, users: ['u1'], groups: ['g1'], roles: ['r1'], units: ['7'] });
  });

  it('"Everyone" clears the individual picks', () => {
    const onConfirm = jest.fn();
    render(<DispatchSelectionModal isOpen onClose={jest.fn()} recipients={recipients} value={{ ...EMPTY_DISPATCH_SELECTION, units: ['7'] }} onConfirm={onConfirm} />);
    fireEvent(screen.getByTestId('dispatch-selection-everyone', hidden), 'valueChange', true);
    fireEvent.press(screen.getByTestId('dispatch-selection-confirm', hidden));
    expect(onConfirm).toHaveBeenCalledWith({ ...EMPTY_DISPATCH_SELECTION, everyone: true });
  });

  it('summarizes a selection', () => {
    const labels = { everyone: 'ALL', none: 'NONE' };
    expect(summarizeDispatchSelection(EMPTY_DISPATCH_SELECTION, recipients, labels)).toBe('NONE');
    expect(summarizeDispatchSelection({ ...EMPTY_DISPATCH_SELECTION, everyone: true }, recipients, labels)).toBe('ALL');
    expect(summarizeDispatchSelection({ everyone: false, users: ['u1'], groups: ['g1'], roles: ['r1'], units: ['7'] }, recipients, labels)).toBe('Pat Smith, Station 1, Medic +1');
  });
});

describe('CallNotesPanel', () => {
  it('adds a note offline: it queues and shows with a "Queued" marker', async () => {
    mockAddNote.mockImplementation(async (input: { callId: string; note: string }) => {
      useCallDetailStore.setState({ queuedNotes: { n1: { localId: 'n1', callId: input.callId, note: input.note, latitude: null, longitude: null, createdAt: Date.now(), state: 'queued' } } });
      return { outcome: 'queued', id: 'n1' };
    });
    render(<CallNotesPanel callId="5" />);
    fireEvent.changeText(screen.getByTestId('call-notes-input'), 'Second alarm requested');
    await act(async () => fireEvent.press(screen.getByTestId('call-notes-add')));
    expect(mockAddNote).toHaveBeenCalledWith({ callId: '5', note: 'Second alarm requested', latitude: null, longitude: null });
    expect(screen.getByText('Second alarm requested')).toBeTruthy();
    expect(screen.getByTestId('call-note-n1-queued')).toBeTruthy();
    expect(lastToast()?.message).toBe('callNotes.queued');
  });

  it('hides the composer without the CanAddNote right and never shows a withheld note', () => {
    setRights({ CanAddNote: false });
    useCallDetailStore.setState({
      details: {
        '5': {
          call: null,
          extraData: null,
          notes: [{ CallId: '5', CallNoteId: 'a', UserId: '', Source: 0, TimestampFormatted: '', Timestamp: '', TimestampUtc: '', Note: 'REDACTED', Latitude: null, Longitude: null, FullName: 'Dispatcher' }],
          images: null,
          files: null,
          audio: null,
          fetchedAt: 1,
        },
      },
    });
    render(<CallNotesPanel callId="5" />);
    expect(screen.queryByTestId('call-notes-input')).toBeNull();
    expect(screen.getByText('data_protection.protected_value')).toBeTruthy();
    expect(screen.queryByText('REDACTED')).toBeNull();
  });
});
