import '../../calls/__tests__/test-setup';

import { useCheckInTimersStore, useUnitRolesStore } from '@resgrid/data';
import type { CallPersonnelCheckInStatusResultData, CheckInTimerStatusResultData } from '@resgrid/models';
import { useToastStore } from '@resgrid/ui';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { activateVariant, hidden } from '../../calls/__tests__/test-utils';
import { CheckInTab } from '../components/check-in-tab';
import { CheckInTimerCard } from '../components/check-in-timer-card';
import { checkInSeverity, CheckInType, parState, timerProgress } from '../lib/check-in-status';
import { canCheckInTimer, checkInTimerTitle } from '../lib/check-in-target';

const timer = (overrides: Partial<CheckInTimerStatusResultData>): CheckInTimerStatusResultData => ({
  TargetType: CheckInType.Personnel,
  TargetTypeName: 'Personnel',
  TargetEntityId: 'u1',
  TargetName: 'Pat Smith',
  UnitId: null,
  LastCheckIn: '2026-10-31T11:50:00Z',
  DurationMinutes: 20,
  WarningThresholdMinutes: 15,
  ElapsedMinutes: 10,
  Status: 'Ok',
  ...overrides,
});

const par = (overrides: Partial<CallPersonnelCheckInStatusResultData>): CallPersonnelCheckInStatusResultData => ({
  UserId: 'u2',
  FullName: 'Sam Lee',
  LastCheckIn: null,
  NeedsCheckIn: true,
  MinutesRemaining: 4,
  Status: 'Warning',
  ...overrides,
});

const mockPerformCheckIn = jest.fn();
const lastToast = () => useToastStore.getState().toasts.at(-1);

beforeEach(() => {
  useToastStore.getState().clearToasts();
  mockPerformCheckIn.mockResolvedValue({ outcome: 'sent', id: 'c1' });
  useUnitRolesStore.setState({ roles: [] });
  useCheckInTimersStore.setState({
    statusesByCall: {
      '10': [
        timer({}),
        timer({ TargetEntityId: 'u9', TargetName: 'Other Person', Status: 'Overdue' }),
        timer({ TargetType: CheckInType.Unit, TargetTypeName: 'UnitType', TargetEntityId: '3', TargetName: 'UnitType', UnitId: 7, Status: 'Warning' }),
      ],
    },
    historyByCall: {
      '10': [{ CheckInRecordId: 'h1', CallId: 10, CheckInType: 3, CheckInTypeName: 'PAR', UserId: 'u1', UnitId: null, Latitude: '', Longitude: '', Timestamp: '2026-10-31T11:00:00Z', Note: 'All accounted' }],
    },
    personnelStatusesByCall: { '10': [par({})] },
    queuedCheckIns: {},
    loading: {},
    performCheckIn: mockPerformCheckIn,
    fetchTimerStatuses: jest.fn(async () => undefined),
    fetchCheckInHistory: jest.fn(async () => undefined),
    fetchCallPersonnelStatuses: jest.fn(async () => undefined),
    toggleTimers: jest.fn(async () => true),
  });
});

afterEach(() => useToastStore.getState().clearToasts());

describe('check-in rules', () => {
  it('self may check in only themselves and their unit; others may check in anyone; neither is read-only', () => {
    const identity = { userId: 'u1', unitIds: ['7'] };
    expect(canCheckInTimer(timer({}), { self: true, others: false }, identity)).toBe(true);
    expect(canCheckInTimer(timer({ TargetEntityId: 'u9' }), { self: true, others: false }, identity)).toBe(false);
    expect(canCheckInTimer(timer({ TargetType: CheckInType.Unit, UnitId: 7 }), { self: true, others: false }, identity)).toBe(true);
    expect(canCheckInTimer(timer({ TargetType: CheckInType.Unit, UnitId: 8 }), { self: true, others: false }, identity)).toBe(false);
    expect(canCheckInTimer(timer({ TargetType: CheckInType.Par }), { self: true, others: false }, identity)).toBe(true);
    expect(canCheckInTimer(timer({ TargetEntityId: 'u9' }), { self: false, others: true }, identity)).toBe(true);
    expect(canCheckInTimer(timer({}), { self: false, others: false }, identity)).toBe(false);
  });

  it('derives severity, progress, PAR state and titles (no API placeholders)', () => {
    expect(checkInSeverity('Red')).toBe('critical');
    expect(checkInSeverity('Yellow')).toBe('warning');
    expect(timerProgress(timer({ ElapsedMinutes: 30 }))).toBe(1);
    expect(parState(par({ NeedsCheckIn: false, Status: 'Ok' }))).toBe('ok');
    expect(parState(par({ MinutesRemaining: 0 }))).toBe('overdue');
    expect(parState(par({}))).toBe('needs');
    expect(checkInTimerTitle(timer({ TargetType: CheckInType.Unit, TargetName: 'UnitType', TargetTypeName: 'UnitType' }))).toBe('');
    expect(checkInTimerTitle(timer({ TargetType: CheckInType.Rehab, TargetTypeName: 'Rehab', TargetName: '' }))).toBe('Rehab');
  });
});

describe('CheckInTimerCard', () => {
  it('shows status, progress and the check-in button with an accessible label', () => {
    const onCheckIn = jest.fn();
    render(<CheckInTimerCard timer={timer({ Status: 'Warning' })} onCheckIn={onCheckIn} testID="card" />);
    expect(screen.getByText('check_in.status_warning')).toBeTruthy();
    expect(screen.getByRole('progressbar').props.accessibilityValue).toMatchObject({ max: 20, now: 10 });
    fireEvent.press(screen.getByLabelText('check_in.perform_check_in: Pat Smith'));
    expect(onCheckIn).toHaveBeenCalled();
  });

  it('marks a check-in queued offline and hides the button when not allowed', () => {
    render(<CheckInTimerCard timer={timer({})} onCheckIn={jest.fn()} showCheckInButton={false} isQueued testID="card" />);
    expect(screen.getByTestId('card-queued')).toBeTruthy();
    expect(screen.queryByTestId('card-button')).toBeNull();
  });
});

describe('CheckInTab', () => {
  it('self (Responder): buttons only on own timers, no PAR list, free check-in of types for self', async () => {
    activateVariant('responder');
    render(<CheckInTab callId="10" timersEnabled identity={{ userId: 'u1', unitIds: [] }} pollMs={0} />);
    expect(screen.getByTestId('check-in-timer-0-u1-button')).toBeTruthy();
    expect(screen.queryByTestId('check-in-timer-0-u9-button')).toBeNull();
    expect(screen.queryByTestId('check-in-timer-1-3-button')).toBeNull();
    expect(screen.queryByTestId('check-in-par-list')).toBeNull();
    expect(screen.getByText('All accounted')).toBeTruthy();

    fireEvent.press(screen.getByTestId('check-in-quick'));
    expect(screen.queryByTestId('check-in-sheet-type-1', hidden)).toBeNull();
    expect(screen.getByTestId('check-in-sheet-type-3', hidden)).toBeTruthy();
    fireEvent.press(screen.getByTestId('check-in-sheet-type-3', hidden));
    await act(async () => fireEvent.press(screen.getByTestId('check-in-sheet-confirm', hidden)));
    expect(mockPerformCheckIn).toHaveBeenCalledWith({ callId: 10, checkInType: 3, userId: null, unitId: null, note: null });
    expect(lastToast()?.message).toBe('check_in.check_in_success');
  });

  it("others (IC/Dispatch): every timer and the PAR list check in on the person's behalf; offline it queues", async () => {
    activateVariant('dispatch');
    mockPerformCheckIn.mockResolvedValue({ outcome: 'queued', id: 'c2' });
    render(<CheckInTab callId="10" timersEnabled identity={{ userId: 'd1', unitIds: [] }} pollMs={0} />);
    expect(screen.getByTestId('check-in-timer-0-u9-button')).toBeTruthy();
    expect(screen.getByTestId('check-in-par-list')).toBeTruthy();
    fireEvent.press(screen.getByTestId('par-row-u2-check-in'));
    await act(async () => fireEvent.press(screen.getByTestId('check-in-sheet-confirm', hidden)));
    expect(mockPerformCheckIn).toHaveBeenCalledWith(expect.objectContaining({ callId: 10, checkInType: CheckInType.Personnel, userId: 'u2' }));
    expect(lastToast()).toMatchObject({ type: 'info', message: 'check_in.queued_offline' });

    fireEvent.press(screen.getByTestId('check-in-timer-0-u9-button'));
    await act(async () => fireEvent.press(screen.getByTestId('check-in-sheet-confirm', hidden)));
    expect(mockPerformCheckIn).toHaveBeenLastCalledWith(expect.objectContaining({ userId: 'u9' }));
  });

  it('read-only without check-in capabilities (BigBoard)', () => {
    activateVariant('bigboard');
    render(<CheckInTab callId="10" timersEnabled pollMs={0} />);
    expect(screen.queryByTestId('check-in-quick')).toBeNull();
    expect(screen.queryByTestId('check-in-timer-0-u1-button')).toBeNull();
  });

  it('offers to enable timers only to checkIn.others', () => {
    activateVariant('ic');
    const { unmount } = render(<CheckInTab callId="10" timersEnabled={false} pollMs={0} />);
    expect(screen.getByTestId('check-in-enable-timers')).toBeTruthy();
    unmount();
    activateVariant('unit');
    render(<CheckInTab callId="10" timersEnabled={false} pollMs={0} />);
    expect(screen.queryByTestId('check-in-enable-timers')).toBeNull();
    expect(screen.getByText('check_in.timers_disabled')).toBeTruthy();
  });
});
