import '../../status/__tests__/test-setup';

import { useAuthStore } from '@resgrid/auth';
import { usePersonnelStatusStore, usePersonnelStore, type WriteResult } from '@resgrid/data';
import { StaffingBaseTypes } from '@resgrid/features/status';
import type { PersonnelInfoResultData, StatusesResultData } from '@resgrid/models';
import { useToastStore } from '@resgrid/ui';
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import { StaffingButtons } from '../components/staffing-buttons';
import { StaffingNoteSheet } from '../components/staffing-note-sheet';
import { UserStaffingCard } from '../components/user-staffing-card';
import { useOwnStaffing } from '../hooks/use-own-staffing';
import { useStaffingActions } from '../hooks/use-staffing-actions';
import { labelColor } from '../lib/label-colors';
import { staffingNav } from '../nav';

const q = { includeHiddenElements: true } as const;

const option = (Id: number, Text: string, extra: Partial<StatusesResultData> = {}): StatusesResultData => ({
  Id,
  Type: 0,
  StateId: 0,
  Text,
  BColor: '#2563eb',
  Color: '#ffffff',
  Gps: false,
  Note: 0,
  Detail: 0,
  ...extra,
});

const setStaffing = jest.fn(async (): Promise<WriteResult> => ({ outcome: 'sent', id: 'evt-1' }));

beforeEach(() => {
  setStaffing.mockClear();
  setStaffing.mockImplementation(async () => ({ outcome: 'sent' as const, id: 'evt-1' }));
  useToastStore.getState().clearToasts();
  useAuthStore.setState({ userId: 'me' });
  usePersonnelStore.setState({
    staffingOptions: [
      option(0, 'Available', { BaseType: StaffingBaseTypes.Available }),
      option(5, 'Off Duty', { BaseType: StaffingBaseTypes.OffDuty }),
      option(7, 'Delayed', { Note: 2, BaseType: StaffingBaseTypes.Delayed }),
    ],
    personnel: [{ UserId: 'me', FirstName: 'Pat', LastName: 'Lee', Staffing: 'Off Duty', StaffingId: '5', StaffingColor: 'label-danger', StaffingTimestamp: '2026-10-31T09:05:00' } as PersonnelInfoResultData],
    loading: {},
  });
  usePersonnelStatusStore.setState({ currentStaffing: null, queuedWrites: {}, loading: {}, setStaffing });
});

describe('labelColor', () => {
  it('maps legacy label classes, adds the # to bare hex and falls back to grey', () => {
    expect(labelColor('label-danger')).toBe('#EF4444');
    expect(labelColor('label-unknown')).toBe('#6B7280');
    expect(labelColor('ff0000')).toBe('#ff0000');
    expect(labelColor('#123456')).toBe('#123456');
    expect(labelColor('')).toBe('#6B7280');
  });
});

describe('StaffingButtons', () => {
  it('sets a level with one tap through the outbox and rings the current level', async () => {
    render(<StaffingButtons />);
    expect(screen.getByTestId('staffing-current-ring-5')).toBeTruthy();
    expect(screen.queryByTestId('staffing-current-ring-0')).toBeNull();

    fireEvent.press(screen.getByTestId('staffing-button-0'));
    await waitFor(() => expect(setStaffing).toHaveBeenCalledWith({ staffingType: '0', note: '' }));
    await waitFor(() => expect(useToastStore.getState().toasts[0]).toEqual(expect.objectContaining({ type: 'success', message: 'home.staffing.updated_successfully' })));
  });

  it('opens the note sheet for a level whose note is required and saves it with the note', async () => {
    render(<StaffingButtons />);
    fireEvent.press(screen.getByTestId('staffing-button-7'));
    expect(setStaffing).not.toHaveBeenCalled();
    expect(screen.getByTestId('staffing-note-sheet-selected', q)).toHaveTextContent('Delayed');
    expect(screen.getByTestId('staffing-note-sheet-save', q)).toBeDisabled();

    fireEvent.changeText(screen.getByTestId('staffing-note-sheet-input', q), '  Running 20 min late ');
    fireEvent.press(screen.getByTestId('staffing-note-sheet-save', q));
    await waitFor(() => expect(setStaffing).toHaveBeenCalledWith({ staffingType: '7', note: 'Running 20 min late' }));
  });

  it('long press adds a note to a level that does not need one', () => {
    render(<StaffingButtons />);
    fireEvent(screen.getByTestId('staffing-button-0'), 'longPress');
    expect(screen.getByTestId('staffing-note-sheet-selected', q)).toHaveTextContent('Available');
    expect(screen.getByTestId('staffing-note-sheet-save', q)).not.toBeDisabled();
  });

  it('says so when the department has no staffing levels', () => {
    usePersonnelStore.setState({ staffingOptions: [] });
    render(<StaffingButtons />);
    expect(screen.getByText('home.staffing.no_options_available')).toBeTruthy();
  });
});

describe('StaffingNoteSheet', () => {
  it('closes after a queued save and warns that it waits for the connection', async () => {
    setStaffing.mockImplementationOnce(async () => ({ outcome: 'queued' as const, id: 'evt-2' }));
    const onClose = jest.fn();
    render(<StaffingNoteSheet isOpen staffing={option(5, 'Off Duty', { Note: 1 })} onClose={onClose} />);
    expect(screen.getByText('staffing.note_optional')).toBeTruthy();
    fireEvent.press(screen.getByTestId('staffing-note-sheet-save', q));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(useToastStore.getState().toasts[0]).toEqual(expect.objectContaining({ type: 'warning', message: 'status.status_queued' }));
  });

  it('stays open when the server refuses the level', async () => {
    setStaffing.mockImplementationOnce(async () => ({ outcome: 'rejected' as const, id: 'evt-3' }));
    const onClose = jest.fn();
    render(<StaffingNoteSheet isOpen staffing={option(5, 'Off Duty')} onClose={onClose} />);
    fireEvent.press(screen.getByTestId('staffing-note-sheet-save', q));
    await waitFor(() => expect(useToastStore.getState().toasts[0]).toEqual(expect.objectContaining({ type: 'error', message: 'home.staffing.update_failed' })));
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('useStaffingActions', () => {
  it('reports a thrown write as failed and ignores a second tap while one is saving', async () => {
    let release: (value: WriteResult) => void = () => undefined;
    setStaffing.mockImplementationOnce(() => new Promise((resolve) => (release = resolve)));
    const { result } = renderHook(() => useStaffingActions());
    let first: Promise<string> = Promise.resolve('');
    await act(async () => {
      first = result.current.submit(option(0, 'Available'), '');
    });
    await act(async () => {
      expect(await result.current.submit(option(5, 'Off Duty'), '')).toBe('busy');
    });
    await act(async () => {
      release({ outcome: 'sent', id: 'evt-4' });
      expect(await first).toBe('sent');
    });

    setStaffing.mockImplementationOnce(async () => {
      throw new Error('no session');
    });
    await act(async () => {
      expect(await result.current.submit(option(0, 'Available'), '')).toBe('failed');
    });
    expect(await result.current.quickSet(option(7, 'Delayed', { Note: 2 }))).toBe('needs-note');
  });
});

describe('UserStaffingCard and useOwnStaffing', () => {
  it('shows the current level in its colour and the update time', () => {
    render(<UserStaffingCard />);
    expect(screen.getByTestId('user-staffing-card-text')).toHaveTextContent('Off Duty');
    expect(screen.getByTestId('user-staffing-card-text')).toHaveStyle({ color: '#2563eb' });
    expect(screen.getByText('home.user.updated: 9:05 am')).toBeTruthy();
  });

  it('shows a level queued on the device until it syncs', () => {
    usePersonnelStatusStore.setState({
      queuedWrites: { e1: { localId: 'e1', kind: 'staffing', userId: 'me', type: '0', respondingTo: '', note: '', createdAt: 1, state: 'queued' } },
    });
    const onPress = jest.fn();
    render(<UserStaffingCard onPress={onPress} />);
    expect(screen.getByTestId('user-staffing-card-text')).toHaveTextContent('Available');
    expect(screen.getByTestId('user-staffing-card-pending')).toBeTruthy();
    fireEvent.press(screen.getByTestId('user-staffing-card-press'));
    expect(onPress).toHaveBeenCalled();
  });

  it('prefers the server current staffing over a stale personnel row, and falls back to unknown', () => {
    usePersonnelStatusStore.setState({ currentStaffing: { UserId: 'me', DepartmentId: '1', StaffingType: 0, TimestampUtc: '', Timestamp: '', Note: '' } });
    const { result, unmount } = renderHook(() => useOwnStaffing());
    expect(result.current.currentId).toBe('0');
    expect(result.current.text).toBe('Available');
    unmount();

    usePersonnelStore.setState({ personnel: [], staffingOptions: [] });
    usePersonnelStatusStore.setState({ currentStaffing: null });
    render(<UserStaffingCard />);
    expect(screen.getByTestId('user-staffing-card-text')).toHaveTextContent('home.user.staffing_unknown');
  });

  it('maps a legacy label class when the level is not in the department set', () => {
    usePersonnelStore.setState({ staffingOptions: [] });
    render(<UserStaffingCard />);
    expect(screen.getByTestId('user-staffing-card-text')).toHaveStyle({ color: '#EF4444' });
  });

  it('contributes no navigation entries', () => {
    expect(staffingNav).toHaveLength(0);
  });
});
