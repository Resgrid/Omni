import '../../status/__tests__/test-setup';

import { useAuthStore } from '@resgrid/auth';
import { useShiftsStore } from '@resgrid/data';
import { ShiftAssignmentType, ShiftDayMyStatus, ShiftRosterSource, ShiftTradeDirection, ShiftTradeStatus, ShiftTradeUserState } from '@resgrid/models';
import { useToastStore } from '@resgrid/ui';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import React from 'react';

import { ShiftActionSheet } from '../components/shift-action-sheet';
import { ShiftDayDetails } from '../components/shift-day-details';
import { ShiftApprovalsList } from '../components/shift-lists';
import { ShiftTradeCard } from '../components/shift-trade-card';
import { ShiftTradeDetails } from '../components/shift-trade-details';
import { useRerenderAt } from '../hooks/use-rerender-at';
import ShiftDayScreen from '../screens/shift-day';
import ShiftTradeScreen from '../screens/shift-trade';
import ShiftsScreen from '../screens/shifts';
import { failedOutcome, makeDay, makeShift, makeSignup, makeTrade, mockShiftActions, okOutcome } from './fixtures';

const q = { includeHiddenElements: true } as const;

let actions: ReturnType<typeof mockShiftActions>;

beforeEach(() => {
  jest.useFakeTimers();
  actions = mockShiftActions();
  useAuthStore.setState({ userId: 'me' });
  useToastStore.getState().clearToasts();
  jest.mocked(useLocalSearchParams).mockReturnValue({});
  // Focus = mount (expo-router's focus effect without a navigator).
  (useFocusEffect as jest.Mock).mockImplementation((effect: () => void | (() => void)) => React.useEffect(effect, [effect]));
});

afterEach(async () => {
  // FlatList batches cell updates on a timer; flush it inside act before the next test.
  await act(() => jest.runOnlyPendingTimers());
  jest.useRealTimers();
});

const toasts = () => useToastStore.getState().toasts.map((toast) => `${toast.type}:${toast.message}`);

const pad = (value: number): string => String(value).padStart(2, '0');

/** A shift time `ms` from now on the device clock (no department zone is set in these tests). */
const wallClockIn = (ms: number): string => {
  const at = new Date(Date.now() + ms);

  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(at.getHours())}:${pad(at.getMinutes())}:${pad(at.getSeconds())}`;
};

describe('ShiftsScreen', () => {
  it('loads Today on focus, merges static shift days and filters by search', async () => {
    useShiftsStore.setState({
      todaysShiftDays: [makeDay('1', { ShiftName: 'A Shift', Start: '2030-05-10T07:00:00' })],
      workshiftDays: { today: [makeDay('w1', { ShiftName: 'Engine crew', ShiftType: ShiftAssignmentType.Workshift, MyUnitName: 'Engine 1', Start: '2030-05-10T06:00:00' })], mine: [], calendar: [] },
    });
    await render(<ShiftsScreen />);
    expect(actions.fetchTodaysShifts).toHaveBeenCalled();
    expect(actions.fetchWorkshiftDays).toHaveBeenCalledWith('today', expect.objectContaining({ start: expect.any(String) }), undefined);
    expect(actions.fetchPendingApprovals).toHaveBeenCalled();
    expect(screen.getByTestId('shift-day-card-1')).toBeTruthy();
    expect(screen.getByText('Engine 1')).toBeTruthy();

    await fireEvent.changeText(screen.getByTestId('shifts-search-input'), 'engine');
    expect(screen.queryByTestId('shift-day-card-1')).toBeNull();
    expect(screen.getByTestId('shift-day-card-w1')).toBeTruthy();
  });

  it('shows Approvals only to supervisors, with the pending count, and confirms a sign-up review', async () => {
    const { rerender } = await render(<ShiftsScreen />);
    expect(screen.queryByTestId('shifts-segment-approvals')).toBeNull();

    await act(() => {
      useShiftsStore.setState({ pendingApprovals: { IsSupervisor: true, Signups: [makeSignup('p1')], Trades: [] } });
    });
    await rerender(<ShiftsScreen />);
    expect(screen.getByTestId('shifts-segment-approvals-badge')).toHaveTextContent('1');

    await fireEvent.press(screen.getByTestId('shifts-segment-approvals'));
    await fireEvent.press(screen.getByTestId('signup-approve-p1'));
    await fireEvent.changeText(screen.getByTestId('shift-action-note', q), ' ok ');
    await fireEvent.press(screen.getByTestId('shift-action-confirm', q));
    await waitFor(() => expect(actions.reviewSignup).toHaveBeenCalledWith('p1', true, 'ok'));
    expect(toasts()).toContain('success:shifts.toast.approved');
  });

  it('switches views and loads each one (My Shifts with standing shifts, Sign up filter, On duty)', async () => {
    useShiftsStore.setState({
      shifts: [makeShift('s1', { InShift: true })],
      myShiftDays: [makeDay('a', { IsActive: true, MyStatus: ShiftDayMyStatus.OnRoster }), makeDay('b', { MyStatus: ShiftDayMyStatus.PendingApproval })],
      signupDays: [makeDay('open', { CanSignup: true }), makeDay('full', { CanSignup: true, Filled: true })],
    });
    await render(<ShiftsScreen />);

    await fireEvent.press(screen.getByTestId('shifts-segment-mine'));
    expect(router.setParams).toHaveBeenLastCalledWith({ view: 'mine' });
    expect(actions.fetchMyShifts).toHaveBeenCalled();
    expect(actions.fetchWorkshiftDays).toHaveBeenCalledWith('mine', { mine: true }, undefined);
    expect(screen.getByTestId('shift-card-s1')).toBeTruthy();
    expect(screen.getByText('shifts.mine_sections.active')).toBeTruthy();
    expect(screen.getByText('shifts.mine_sections.pending')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('shifts-segment-signup'));
    expect(actions.fetchSignupDays).toHaveBeenCalled();
    expect(screen.getByTestId('shift-day-card-open')).toBeTruthy();
    expect(screen.queryByTestId('shift-day-card-full')).toBeNull();
    await fireEvent.press(screen.getByTestId('shifts-signup-filter-all'));
    expect(screen.getByTestId('shift-day-card-full')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('shifts-segment-onduty'));
    expect(actions.fetchOnDutyPersonnel).toHaveBeenCalled();
    expect(screen.getByTestId('shift-on-duty-empty')).toBeTruthy();
  });

  it('calendar: loads the month, filters by shift and lists the selected day', async () => {
    useShiftsStore.setState({
      shifts: [makeShift('s1')],
      calendarRange: { start: '2030-05-01', end: '2030-05-31', shiftId: null },
      calendarDays: [makeDay('c1', { ShiftDay: '2030-05-10T00:00:00' })],
    });
    await render(<ShiftsScreen initialView="calendar" />);
    expect(actions.fetchShiftDaysForDateRange).toHaveBeenCalledWith('2030-05-01', '2030-05-31', null, undefined);
    expect(actions.fetchWorkshiftDays).toHaveBeenCalledWith('calendar', expect.objectContaining({ start: '2030-05-01', end: '2030-05-31' }), undefined);

    await fireEvent.press(screen.getByTestId('shift-calendar-day-2030-05-10'));
    expect(screen.getByTestId('shift-day-card-c1')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('shifts-calendar-filter-s1'));
    expect(actions.fetchShiftDaysForDateRange).toHaveBeenLastCalledWith('2030-05-01', '2030-05-31', 's1', undefined);

    // The shift filter stays on across months; static shift days drop out while it is on.
    await fireEvent.press(screen.getByTestId('shift-calendar-next'));
    expect(actions.fetchShiftDaysForDateRange).toHaveBeenLastCalledWith('2030-06-01', '2030-06-30', 's1', undefined);
    expect(actions.fetchWorkshiftDays).not.toHaveBeenCalledWith('calendar', expect.objectContaining({ start: '2030-06-01' }), undefined);

    await fireEvent.press(screen.getByTestId('shifts-calendar-filter-all'));
    expect(actions.fetchShiftDaysForDateRange).toHaveBeenLastCalledWith('2030-06-01', '2030-06-30', null, undefined);
  });

  it('a standing shift opens in a sheet and can be shown in the calendar', async () => {
    useShiftsStore.setState({ shifts: [makeShift('s1', { InShift: true, Groups: [{ GroupId: 'g1', GroupName: 'Station 1', Roles: [{ RoleId: 'r1', RoleName: 'EMT', Required: 2 }] }] })] });
    await render(<ShiftsScreen initialView="mine" />);
    await fireEvent.press(screen.getByTestId('shift-card-s1'));
    expect(actions.fetchShift).toHaveBeenCalledWith('s1');
    expect(screen.getByTestId('shift-group-g1', q)).toHaveTextContent(/shifts\.required_count:2/);
    await fireEvent.press(screen.getByTestId('shift-details-view-calendar', q));
    expect(screen.getByTestId('shift-calendar-view')).toBeTruthy();
    expect(actions.fetchShiftDaysForDateRange).toHaveBeenLastCalledWith(expect.any(String), expect.any(String), 's1', undefined);
  });

  it('opens a day as its own screen; static shift days say so in the link', async () => {
    useShiftsStore.setState({
      todaysShiftDays: [makeDay('1')],
      workshiftDays: { today: [makeDay('w1', { ShiftType: ShiftAssignmentType.Workshift, Start: '2030-05-10T06:00:00' })], mine: [], calendar: [] },
    });
    await render(<ShiftsScreen />);
    await fireEvent.press(screen.getByTestId('shift-day-card-1'));
    expect(router.push).toHaveBeenLastCalledWith('/shifts/day/1');
    await fireEvent.press(screen.getByTestId('shift-day-card-w1'));
    expect(router.push).toHaveBeenLastCalledWith('/shifts/day/w1?workshift=1');
    expect(screen.queryByTestId('shift-day-details', q)).toBeNull();
  });

  it('calendar: opening a day from another month leaves that month and the picked day in place, and in the route', async () => {
    useShiftsStore.setState({ calendarRange: { start: '2030-05-01', end: '2030-05-31', shiftId: null } });
    await render(<ShiftsScreen initialView="calendar" />);
    await fireEvent.press(screen.getByTestId('shift-calendar-next'));
    expect(router.setParams).toHaveBeenLastCalledWith({ month: '2030-06', date: undefined });
    await act(() => {
      useShiftsStore.setState({ calendarDays: [makeDay('j14', { ShiftDay: '2030-06-14T00:00:00', Start: '2030-06-14T07:00:00', End: '2030-06-14T19:00:00' })] });
    });
    await fireEvent.press(screen.getByTestId('shift-calendar-day-2030-06-14'));
    expect(router.setParams).toHaveBeenLastCalledWith({ date: '2030-06-14' });

    await fireEvent.press(screen.getByTestId('shift-day-card-j14'));
    expect(router.push).toHaveBeenLastCalledWith('/shifts/day/j14');
    // The day screen goes on top of this one (the stack keeps it mounted): Back finds the same month and day.
    expect(screen.getByTestId('shift-calendar-month')).toHaveTextContent(/2030/);
    expect(screen.getByTestId('shift-calendar-day-2030-06-14')).toBeSelected();
    expect(screen.getByTestId('shift-day-card-j14')).toBeTruthy();
    expect(actions.fetchShiftDaysForDateRange).toHaveBeenLastCalledWith('2030-06-01', '2030-06-30', null, undefined);
  });

  it('calendar: a screen rebuilt from its route (a reload, a history step) opens on that month and day', async () => {
    jest.mocked(useLocalSearchParams).mockReturnValue({ view: 'calendar', month: '2030-06', date: '2030-06-14' });
    useShiftsStore.setState({
      calendarRange: { start: '2030-05-01', end: '2030-05-31', shiftId: 's1' },
      calendarDays: [makeDay('j14', { ShiftDay: '2030-06-14T00:00:00', Start: '2030-06-14T07:00:00', End: '2030-06-14T19:00:00' })],
    });
    await render(<ShiftsScreen />);
    expect(actions.fetchShiftDaysForDateRange).toHaveBeenCalledWith('2030-06-01', '2030-06-30', 's1', undefined);
    expect(screen.getByTestId('shift-calendar-day-2030-06-14')).toBeSelected();
    expect(screen.getByTestId('shift-day-card-j14')).toBeTruthy();
  });

  it('calendar: a link into Shifts while it is open shows the month and day it names and keeps the shift filter', async () => {
    jest.setSystemTime(new Date(2030, 8, 15, 12));
    jest.mocked(useLocalSearchParams).mockReturnValue({ view: 'calendar', month: '2030-06', date: '2030-06-14' });
    useShiftsStore.setState({ shifts: [makeShift('s1')] });
    const { rerender } = await render(<ShiftsScreen />);
    await fireEvent.press(screen.getByTestId('shifts-calendar-filter-s1'));
    expect(actions.fetchShiftDaysForDateRange).toHaveBeenLastCalledWith('2030-06-01', '2030-06-30', 's1', undefined);

    jest.mocked(useLocalSearchParams).mockReturnValue({ view: 'calendar', month: '2030-08', date: '2030-08-03' });
    await rerender(<ShiftsScreen />);
    expect(actions.fetchShiftDaysForDateRange).toHaveBeenLastCalledWith('2030-08-01', '2030-08-31', 's1', undefined);
    expect(screen.getByTestId('shift-calendar-day-2030-08-03')).toBeSelected();

    // The screen's own writes, read back from the route, change nothing: a month moved to keeps no picked day, even
    // the month holding today.
    await fireEvent.press(screen.getByTestId('shift-calendar-next'));
    expect(router.setParams).toHaveBeenLastCalledWith({ month: '2030-09', date: undefined });
    jest.mocked(useLocalSearchParams).mockReturnValue({ view: 'calendar', month: '2030-09' });
    await rerender(<ShiftsScreen />);
    expect(screen.getByTestId('shift-calendar-day-2030-09-15')).not.toBeSelected();

    jest.mocked(useLocalSearchParams).mockReturnValue({ view: 'trades' });
    await rerender(<ShiftsScreen />);
    expect(actions.fetchShiftTrades).toHaveBeenCalled();
    expect(screen.queryByTestId('shift-calendar-view')).toBeNull();
  });

  it('trades: an action on a card asks for confirmation, then responds with the offered swap-back', async () => {
    useShiftsStore.setState({
      openTrades: [makeTrade('t1', { IsOpen: true, CanApply: true })],
      myShiftDays: [makeDay('mine1', { MySignupId: 'sig1', MyStatus: ShiftDayMyStatus.OnRoster })],
    });
    await render(<ShiftsScreen initialView="trades" />);
    expect(screen.getByTestId('shifts-segment-trades-badge')).toHaveTextContent('1');
    await fireEvent.press(screen.getByTestId('trade-apply-t1'));
    await fireEvent.press(screen.getByTestId('swap-option-sig1', q));
    await fireEvent.press(screen.getByTestId('shift-action-confirm', q));
    await waitFor(() => expect(actions.respondToTrade).toHaveBeenCalledWith('t1', true, '', ['sig1']));
    expect(toasts()).toContain('success:shifts.toast.trade_applied');
    await waitFor(() => expect(actions.fetchTradeDetail).toHaveBeenCalledWith('t1'));
  });

  it('shows an error with retry when a list fails to load', async () => {
    useShiftsStore.setState({ errors: { today: { code: 'server', messageKey: 'errors.data.server' } } });
    await render(<ShiftsScreen />);
    await fireEvent.press(screen.getByTestId('shifts-retry'));
    expect(actions.fetchTodaysShifts).toHaveBeenLastCalledWith({ bypassCache: true });
  });
});

describe('ShiftDayDetails', () => {
  const roster = (UserId: string, extra: Record<string, unknown> = {}) => ({
    UserId,
    Name: `Person ${UserId}`,
    GroupId: 'g1',
    GroupName: 'Station 1',
    RoleIds: [],
    Roles: [],
    Source: ShiftRosterSource.Signup,
    ShiftSignupId: `sig-${UserId}`,
    ApprovalPending: false,
    TradedFromUserId: '',
    TradedFromName: '',
    ...extra,
  });

  it('signs up with the only team preselected and refreshes the day', async () => {
    const day = makeDay('d1', { CanSignup: true, RequireApproval: true, Needs: [{ GroupId: 'g1', GroupName: 'Station 1', GroupNeeds: [{ RoleId: 'r1', RoleName: 'EMT', Needed: 1 }], CanManage: false }] });
    useShiftsStore.setState({ shiftDaysById: { d1: day } });
    actions.signupForShift.mockResolvedValueOnce(okOutcome({ approvalPending: true }));
    await render(<ShiftDayDetails shiftDayId="d1" />);
    await fireEvent.press(screen.getByTestId('shift-day-signup-button'));
    expect(screen.getByText('shifts.signup_panel.approval_notice')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('shift-day-signup-confirm'));
    await waitFor(() => expect(actions.signupForShift).toHaveBeenCalledWith('d1', 'g1'));
    expect(toasts()).toContain('success:shifts.toast.signup_pending');
    await waitFor(() => expect(screen.getByTestId('shift-day-signup-button')).toBeTruthy());
    expect(actions.fetchShiftDay).toHaveBeenCalledTimes(2);
  });

  it('withdraws an own sign-up and shows the server refusal translated', async () => {
    const day = makeDay('d1', { MySignupId: 'sig-me', MyStatus: ShiftDayMyStatus.OnRoster, Roster: [roster('me', { ShiftSignupId: 'sig-me' })] });
    useShiftsStore.setState({ shiftDaysById: { d1: day } });
    actions.withdrawFromShift.mockResolvedValueOnce(failedOutcome('day_in_past'));
    await render(<ShiftDayDetails shiftDayId="d1" />);
    expect(screen.getByText('shifts.you')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('shift-day-withdraw-button'));
    await fireEvent.press(screen.getByTestId('shift-day-withdraw-confirm'));
    await waitFor(() => expect(actions.withdrawFromShift).toHaveBeenCalledWith('sig-me'));
    expect(toasts()).toContain('error:shifts.errors.day_in_past');
    expect(screen.getByTestId('shift-day-withdraw-panel')).toBeTruthy();
  });

  it('requests a trade from specific candidates', async () => {
    const day = makeDay('d1', { MyStatus: ShiftDayMyStatus.OnRoster, CanTrade: true });
    useShiftsStore.setState({ shiftDaysById: { d1: day }, tradeCandidatesByDay: { d1: [{ UserId: 'c1', Name: 'Casey', GroupId: '', GroupName: 'Station 2', Roles: ['EMT'], RoleIds: [] }] } });
    await render(<ShiftDayDetails shiftDayId="d1" />);
    await fireEvent.press(screen.getByTestId('shift-day-trade-button'));
    expect(actions.fetchTradeCandidates).toHaveBeenCalledWith('d1');
    expect(screen.getByText('shifts.trade_panel.mode_open_hint:1')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('trade-mode-specific'));
    expect(screen.getByTestId('shift-day-trade-confirm')).toBeDisabled();
    await fireEvent.press(screen.getByTestId('trade-candidate-c1'));
    await fireEvent.changeText(screen.getByTestId('shift-day-trade-note'), ' family ');
    await fireEvent.press(screen.getByTestId('shift-day-trade-confirm'));
    await waitFor(() => expect(actions.requestTrade).toHaveBeenCalledWith('d1', ['c1'], 'family', { workshift: false }));
    expect(toasts()).toContain('success:shifts.toast.trade_requested');
  });

  it('static shift days trade as open requests only and offer no sign-up or roster edits', async () => {
    const day = makeDay('w1', { ShiftType: ShiftAssignmentType.Workshift, MyStatus: ShiftDayMyStatus.OnRoster, CanManage: true, CanSignup: true, MyUnitName: 'Engine 1' });
    useShiftsStore.setState({ shiftDaysById: { w1: day } });
    await render(<ShiftDayDetails shiftDayId="w1" />);
    expect(actions.fetchShiftDay).toHaveBeenCalledWith('w1', { workshift: true });
    expect(screen.queryByTestId('shift-day-signup-button')).toBeNull();
    expect(screen.queryByTestId('shift-day-add-person-button')).toBeNull();
    await fireEvent.press(screen.getByTestId('shift-day-trade-button'));
    expect(screen.queryByTestId('trade-mode-specific')).toBeNull();
    await fireEvent.press(screen.getByTestId('shift-day-trade-confirm'));
    await waitFor(() => expect(actions.requestTrade).toHaveBeenCalledWith('w1', [], '', { workshift: true }));
    expect(actions.fetchTradeCandidates).not.toHaveBeenCalled();
  });

  it('supervisors approve a pending entry, remove a person and add one', async () => {
    const day = makeDay('d1', {
      CanManage: true,
      Needs: [{ GroupId: 'g1', GroupName: 'Station 1', GroupNeeds: [], CanManage: true }],
      Roster: [roster('u2', { ApprovalPending: true }), roster('u3')],
    });

    useShiftsStore.setState({ shiftDaysById: { d1: day }, personnelOptionsByDay: { d1: [{ UserId: 'u9', Name: 'Nina', GroupId: 'g1', GroupName: 'Station 1', Roles: [], RoleIds: [] }] } });
    await render(<ShiftDayDetails shiftDayId="d1" />);

    await fireEvent.press(screen.getByTestId('roster-approve-u2'));
    await fireEvent.press(screen.getByTestId('shift-day-review-confirm'));
    await waitFor(() => expect(actions.reviewSignup).toHaveBeenCalledWith('sig-u2', true, ''));

    await waitFor(() => expect(screen.getByTestId('roster-remove-u3')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('roster-remove-u3'));
    await fireEvent.changeText(screen.getByTestId('shift-day-remove-note'), 'sick');
    await fireEvent.press(screen.getByTestId('shift-day-remove-confirm'));
    await waitFor(() => expect(actions.removeFromShiftDay).toHaveBeenCalledWith('d1', 'u3', 'sick'));

    await waitFor(() => expect(screen.getByTestId('shift-day-add-person-button')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('shift-day-add-person-button'));
    expect(actions.fetchPersonnelOptions).toHaveBeenCalledWith('d1');
    await fireEvent.press(screen.getByTestId('add-person-u9'));
    await fireEvent.press(screen.getByTestId('shift-day-add-confirm'));
    await waitFor(() => expect(actions.assignToShiftDay).toHaveBeenCalledWith('d1', 'u9', 'g1'));
  });

  it('a day that is over is read-only: it says so and offers no sign-up, trade, withdrawal or roster change', async () => {
    const day = makeDay('old', {
      ShiftDay: '2020-05-10T00:00:00',
      Start: '2020-05-10T07:00:00',
      End: '2020-05-10T19:00:00',
      EndUtc: '2020-05-10T23:00:00Z',
      CanSignup: true,
      CanManage: true,
      CanTrade: true,
      RequireApproval: true,
      MyStatus: ShiftDayMyStatus.OnRoster,
      MySignupId: 'sig-me',
      MyTradeId: 'tr1',
      Needs: [{ GroupId: 'g1', GroupName: 'Station 1', GroupNeeds: [], CanManage: true }],
      Roster: [roster('me', { ShiftSignupId: 'sig-me' }), roster('u2', { ApprovalPending: true })],
    });

    useShiftsStore.setState({ shiftDaysById: { old: day } });
    await render(<ShiftDayDetails shiftDayId="old" />);
    expect(screen.getByTestId('shift-day-past-note')).toHaveTextContent('shifts.day.past_note');
    expect(screen.getByTestId('roster-entry-u2')).toBeTruthy();

    const actionIds = [
      'shift-day-signup-button',
      'shift-day-trade-button',
      'shift-day-cancel-trade-button',
      'shift-day-withdraw-button',
      'shift-day-add-person-button',
      'roster-approve-u2',
      'roster-deny-u2',
      'roster-remove-u2',
    ];

    expect(actionIds.filter((id) => screen.queryByTestId(id) !== null)).toEqual([]);
    expect(screen.queryByText('shifts.day.require_approval_note')).toBeNull();
  });

  it('a day that ends while open drops its actions and the open panel', async () => {
    const day = makeDay('soon', { CanSignup: true, EndUtc: new Date(Date.now() + 60_000).toISOString(), Needs: [{ GroupId: 'g1', GroupName: 'Station 1', GroupNeeds: [], CanManage: false }] });
    useShiftsStore.setState({ shiftDaysById: { soon: day } });
    await render(<ShiftDayDetails shiftDayId="soon" />);
    expect(screen.queryByTestId('shift-day-past-note')).toBeNull();
    await fireEvent.press(screen.getByTestId('shift-day-signup-button'));
    expect(screen.getByTestId('shift-day-signup-panel')).toBeTruthy();

    await act(() => {
      jest.advanceTimersByTime(62_000);
    });
    expect(screen.getByTestId('shift-day-past-note')).toBeTruthy();
    expect(screen.queryByTestId('shift-day-signup-panel')).toBeNull();
    expect(screen.queryByTestId('shift-day-signup-button')).toBeNull();
  });

  it('shows the not-found state when the day cannot be loaded', async () => {
    await render(<ShiftDayDetails shiftDayId="gone" />);
    expect(screen.getByTestId('shift-day-missing')).toBeTruthy();
  });
});

describe('ShiftTradeCard and ShiftActionSheet', () => {
  it('lets the requester pick an applicant and finishes the trade (pending approval toast)', async () => {
    const trade = makeTrade('t2', { Direction: ShiftTradeDirection.Outgoing, IsOpen: true, Users: [{ UserId: 'a1', Name: 'Alex', Declined: false, Offered: true, Reason: '', OfferedShifts: [] }] });
    const onAction = jest.fn();
    await render(<ShiftTradeCard trade={trade} onAction={onAction} />);
    expect(screen.getByTestId('trade-cancel-t2')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('trade-pick-t2-a1'));
    const action = onAction.mock.calls[0][0];
    expect(action).toMatchObject({ kind: 'finish-trade', offeredShift: null });

    actions.finishTrade.mockResolvedValueOnce(okOutcome({ approvalPending: true }));
    const onClose = jest.fn();
    await render(<ShiftActionSheet action={action} onClose={onClose} />);
    await fireEvent.press(screen.getByTestId('shift-action-confirm', q));
    await waitFor(() => expect(actions.finishTrade).toHaveBeenCalledWith('t2', 'a1', null));
    expect(toasts()).toContain('success:shifts.toast.trade_finished_pending');
    expect(onClose).toHaveBeenCalled();
  });

  it('a targeted incoming trade offers accept/decline; a refusal keeps the sheet open', async () => {
    const trade = makeTrade('t3', { MyState: ShiftTradeUserState.Open });
    const onAction = jest.fn();
    await render(<ShiftTradeCard trade={trade} onAction={onAction} />);
    await fireEvent.press(screen.getByTestId('trade-decline-t3'));
    actions.respondToTrade.mockResolvedValueOnce(failedOutcome('not_pending'));
    const onClose = jest.fn();
    await render(<ShiftActionSheet action={onAction.mock.calls[0][0]} onClose={onClose} />);
    await fireEvent.press(screen.getByTestId('shift-action-confirm', q));
    await waitFor(() => expect(actions.respondToTrade).toHaveBeenCalledWith('t3', false, '', []));
    expect(toasts()).toContain('error:shifts.errors.not_pending');
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('approvals and trades on a finished day', () => {
  it('a pending sign-up or trade whose day is over can no longer be approved, denied or taken', async () => {
    const onAction = jest.fn();
    await render(
      <ShiftApprovalsList
        signups={[makeSignup('p-old', { End: '2020-05-10T19:00:00' }), makeSignup('p-new')]}
        trades={[makeTrade('t-old', { Status: ShiftTradeStatus.PendingApproval, CanReview: true, IsOver: true })]}
        isLoading={false}
        onRefresh={async () => undefined}
        onAction={onAction}
        onOpenTradeDetails={jest.fn()}
      />
    );
    expect(screen.getByTestId('signup-over-p-old')).toHaveTextContent('shifts.day.past_note');
    expect(screen.queryByTestId('signup-approve-p-old')).toBeNull();
    expect(screen.getByTestId('signup-approve-p-new')).toBeTruthy();
    expect(screen.getByTestId('trade-over-t-old')).toBeTruthy();
    expect(screen.queryByTestId('trade-approve-t-old')).toBeNull();
  });

  it('an open trade whose day ends while on screen stops offering its applicants to pick', async () => {
    const End = wallClockIn(60_000);
    const offered = { UserId: 'a1', Name: 'Alex', Declined: false, Offered: true, Reason: '', OfferedShifts: [] };
    await render(<ShiftTradeDetails tradeId="t2" fallback={makeTrade('t2', { Direction: ShiftTradeDirection.Outgoing, IsOpen: true, End, Users: [offered] })} onAction={jest.fn()} />);
    expect(screen.getByTestId('trade-pick-t2-a1')).toBeTruthy();
    expect(screen.getByTestId('trade-detail-cancel-t2')).toBeTruthy();

    await act(() => {
      jest.advanceTimersByTime(62_000);
    });
    expect(screen.queryByTestId('trade-pick-t2-a1')).toBeNull();
    expect(screen.queryByTestId('trade-detail-cancel-t2')).toBeNull();
  });

  it('the approvals list drops a sign-up or trade review once its day ends on screen', async () => {
    const End = wallClockIn(60_000);
    await render(
      <ShiftApprovalsList
        signups={[makeSignup('p1', { End })]}
        trades={[makeTrade('t1', { Status: ShiftTradeStatus.PendingApproval, CanReview: true, End })]}
        isLoading={false}
        onRefresh={async () => undefined}
        onAction={jest.fn()}
        onOpenTradeDetails={jest.fn()}
      />
    );
    expect(screen.getByTestId('signup-approve-p1')).toBeTruthy();
    expect(screen.getByTestId('trade-approve-t1')).toBeTruthy();

    await act(() => {
      jest.advanceTimersByTime(62_000);
    });
    expect(screen.getByTestId('signup-over-p1')).toBeTruthy();
    expect(screen.queryByTestId('signup-approve-p1')).toBeNull();
    expect(screen.getByTestId('trade-over-t1')).toBeTruthy();
    expect(screen.queryByTestId('trade-approve-t1')).toBeNull();
  });

  it('the Trades badge leaves out open requests whose day is over', async () => {
    useShiftsStore.setState({ openTrades: [makeTrade('t1', { IsOpen: true, CanApply: true }), makeTrade('t2', { IsOpen: true, CanApply: true, IsOver: true })] });
    await render(<ShiftsScreen initialView="trades" />);
    expect(screen.getByTestId('shifts-segment-trades-badge')).toHaveTextContent('1');
    expect(screen.getByTestId('trade-apply-t1')).toBeTruthy();
    expect(screen.queryByTestId('trade-apply-t2')).toBeNull();
  });
});

describe('useRerenderAt', () => {
  it('re-renders just after the moment, in steps past the timer ceiling, and never for a moment already gone', async () => {
    let renders = 0;

    const Probe: React.FC<{ atMs: number | null }> = ({ atMs }) => {
      renders += 1;
      useRerenderAt(atMs);

      return null;
    };

    // Thirty days out: beyond setTimeout's 24.8-day ceiling.
    const atMs = Date.now() + 30 * 24 * 60 * 60 * 1000;
    await render(<Probe atMs={atMs} />);
    const mounted = renders;

    await act(() => {
      jest.advanceTimersByTime(2_147_483_647);
    });
    expect(renders).toBe(mounted + 1);
    await act(() => {
      jest.advanceTimersByTime(atMs - Date.now());
    });
    expect(renders).toBe(mounted + 1);
    await act(() => {
      jest.advanceTimersByTime(1_000);
    });
    expect(renders).toBe(mounted + 2);
    await act(() => {
      jest.advanceTimersByTime(60 * 24 * 60 * 60 * 1000);
    });
    expect(renders).toBe(mounted + 2);

    await render(<Probe atMs={Date.now() - 5_000} />);
    const past = renders;
    await render(<Probe atMs={null} />);
    await act(() => {
      jest.advanceTimersByTime(60_000);
    });
    expect(renders).toBe(past + 1);
  });
});

describe('deep-link screens', () => {
  it('ShiftDayScreen loads a static shift day by route id', async () => {
    jest.mocked(useLocalSearchParams).mockReturnValue({ id: 'w5', workshift: '1' });
    await render(<ShiftDayScreen />);
    expect(actions.fetchShiftDay).toHaveBeenCalledWith('w5', { workshift: true });
  });

  it('ShiftDayScreen shows a day picked from a list at once, titled by its shift, while the full day loads', async () => {
    jest.mocked(useLocalSearchParams).mockReturnValue({ id: 'c1' });
    useShiftsStore.setState({ calendarDays: [makeDay('c1', { ShiftName: 'Night Shift' })], loading: { shiftDay: true } });
    await render(<ShiftDayScreen />);
    expect(actions.fetchShiftDay).toHaveBeenCalledWith('c1', { workshift: false });
    expect(screen.getByTestId('shift-day-details')).toBeTruthy();
    expect(screen.queryByTestId('shift-day-loading')).toBeNull();
    expect(screen.getByTestId('shift-day-header')).toHaveTextContent(/Night Shift/);
  });

  it('ShiftDayScreen Back returns to the screen underneath, or to Shifts when opened cold', async () => {
    jest.mocked(useLocalSearchParams).mockReturnValue({ id: 'c1' });
    await render(<ShiftDayScreen />);
    await fireEvent.press(screen.getByTestId('back-button'));
    expect(router.back).toHaveBeenCalled();

    jest.mocked(router.canGoBack).mockReturnValueOnce(false);
    await fireEvent.press(screen.getByTestId('back-button'));
    expect(router.replace).toHaveBeenCalledWith('/shifts');
  });

  it('ShiftDayScreen and ShiftTradeScreen refuse unsafe ids', async () => {
    jest.mocked(useLocalSearchParams).mockReturnValue({ id: '../settings' });
    await render(<ShiftDayScreen />);
    expect(screen.getByTestId('shift-day-invalid')).toBeTruthy();
    await render(<ShiftTradeScreen />);
    expect(screen.getByTestId('shift-trade-invalid')).toBeTruthy();
    expect(actions.fetchTradeDetail).not.toHaveBeenCalled();
  });

  it('ShiftTradeScreen shows applicant qualifications to the people who decide', async () => {
    useShiftsStore.setState({
      tradesById: {
        t9: makeTrade('t9', {
          Direction: ShiftTradeDirection.Outgoing,
          IsOpen: true,
          Users: [
            {
              UserId: 'a1',
              Name: 'Alex',
              Declined: false,
              Offered: true,
              Reason: '',
              OfferedShifts: [],
              IsEligible: false,
              IneligibleReason: 'not_eligible',
              Certifications: ['EMT-B'],
              HasConflict: true,
              ConflictName: 'B Shift',
            },
          ],
        }),
      },
    });
    await render(<ShiftTradeScreen tradeId="t9" />);
    expect(actions.fetchTradeDetail).toHaveBeenCalledWith('t9');
    expect(screen.getByTestId('trade-applicant-certs-a1')).toHaveTextContent('EMT-B');
    expect(screen.getByTestId('trade-applicant-conflict-a1')).toBeTruthy();
    expect(screen.getByTestId('trade-applicant-ineligible-a1')).toHaveTextContent('shifts.trade.ineligible.missing_roles');
  });
});
