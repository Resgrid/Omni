import '../../status/__tests__/test-setup';

import { useAuthStore } from '@resgrid/auth';
import { useShiftsStore } from '@resgrid/data';
import { ShiftAssignmentType, ShiftDayMyStatus, ShiftRosterSource, ShiftTradeDirection, ShiftTradeUserState } from '@resgrid/models';
import { useToastStore } from '@resgrid/ui';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import React from 'react';

import { ShiftActionSheet } from '../components/shift-action-sheet';
import { ShiftDayDetails } from '../components/shift-day-details';
import { ShiftTradeCard } from '../components/shift-trade-card';
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
  (useLocalSearchParams as jest.Mock).mockReturnValue({});
  // Focus = mount (expo-router's focus effect without a navigator).
  (useFocusEffect as jest.Mock).mockImplementation((effect: () => void | (() => void)) => React.useEffect(effect, [effect]));
});

afterEach(() => {
  // FlatList batches cell updates on a timer; flush it inside act before the next test.
  act(() => jest.runOnlyPendingTimers());
  jest.useRealTimers();
});

const toasts = () => useToastStore.getState().toasts.map((toast) => `${toast.type}:${toast.message}`);

describe('ShiftsScreen', () => {
  it('loads Today on focus, merges static shift days and filters by search', () => {
    useShiftsStore.setState({
      todaysShiftDays: [makeDay('1', { ShiftName: 'A Shift', Start: '2030-05-10T07:00:00' })],
      workshiftDays: { today: [makeDay('w1', { ShiftName: 'Engine crew', ShiftType: ShiftAssignmentType.Workshift, MyUnitName: 'Engine 1', Start: '2030-05-10T06:00:00' })], mine: [], calendar: [] },
    });
    render(<ShiftsScreen />);
    expect(actions.fetchTodaysShifts).toHaveBeenCalled();
    expect(actions.fetchWorkshiftDays).toHaveBeenCalledWith('today', expect.objectContaining({ start: expect.any(String) }), undefined);
    expect(actions.fetchPendingApprovals).toHaveBeenCalled();
    expect(screen.getByTestId('shift-day-card-1')).toBeTruthy();
    expect(screen.getByText('Engine 1')).toBeTruthy();

    fireEvent.changeText(screen.getByTestId('shifts-search-input'), 'engine');
    expect(screen.queryByTestId('shift-day-card-1')).toBeNull();
    expect(screen.getByTestId('shift-day-card-w1')).toBeTruthy();
  });

  it('shows Approvals only to supervisors, with the pending count, and confirms a sign-up review', async () => {
    const { rerender } = render(<ShiftsScreen />);
    expect(screen.queryByTestId('shifts-segment-approvals')).toBeNull();

    act(() => useShiftsStore.setState({ pendingApprovals: { IsSupervisor: true, Signups: [makeSignup('p1')], Trades: [] } }));
    rerender(<ShiftsScreen />);
    expect(screen.getByTestId('shifts-segment-badge-approvals')).toHaveTextContent('1');

    fireEvent.press(screen.getByTestId('shifts-segment-approvals'));
    fireEvent.press(screen.getByTestId('signup-approve-p1'));
    fireEvent.changeText(screen.getByTestId('shift-action-note', q), ' ok ');
    fireEvent.press(screen.getByTestId('shift-action-confirm', q));
    await waitFor(() => expect(actions.reviewSignup).toHaveBeenCalledWith('p1', true, 'ok'));
    expect(toasts()).toContain('success:shifts.toast.approved');
  });

  it('switches views and loads each one (My Shifts with standing shifts, Sign up filter, On duty)', () => {
    useShiftsStore.setState({
      shifts: [makeShift('s1', { InShift: true })],
      myShiftDays: [makeDay('a', { IsActive: true, MyStatus: ShiftDayMyStatus.OnRoster }), makeDay('b', { MyStatus: ShiftDayMyStatus.PendingApproval })],
      signupDays: [makeDay('open', { CanSignup: true }), makeDay('full', { CanSignup: true, Filled: true })],
    });
    render(<ShiftsScreen />);

    fireEvent.press(screen.getByTestId('shifts-segment-mine'));
    expect(actions.fetchMyShifts).toHaveBeenCalled();
    expect(actions.fetchWorkshiftDays).toHaveBeenCalledWith('mine', { mine: true }, undefined);
    expect(screen.getByTestId('shift-card-s1')).toBeTruthy();
    expect(screen.getByText('shifts.mine_sections.active')).toBeTruthy();
    expect(screen.getByText('shifts.mine_sections.pending')).toBeTruthy();

    fireEvent.press(screen.getByTestId('shifts-segment-signup'));
    expect(actions.fetchSignupDays).toHaveBeenCalled();
    expect(screen.getByTestId('shift-day-card-open')).toBeTruthy();
    expect(screen.queryByTestId('shift-day-card-full')).toBeNull();
    fireEvent.press(screen.getByTestId('shifts-signup-filter-all'));
    expect(screen.getByTestId('shift-day-card-full')).toBeTruthy();

    fireEvent.press(screen.getByTestId('shifts-segment-onduty'));
    expect(actions.fetchOnDutyPersonnel).toHaveBeenCalled();
    expect(screen.getByTestId('shift-on-duty-empty')).toBeTruthy();
  });

  it('calendar: loads the month, filters by shift and lists the selected day', () => {
    useShiftsStore.setState({
      shifts: [makeShift('s1')],
      calendarRange: { start: '2030-05-01', end: '2030-05-31', shiftId: null },
      calendarDays: [makeDay('c1', { ShiftDay: '2030-05-10T00:00:00' })],
    });
    render(<ShiftsScreen initialView="calendar" />);
    expect(actions.fetchShiftDaysForDateRange).toHaveBeenCalledWith('2030-05-01', '2030-05-31', null, undefined);
    expect(actions.fetchWorkshiftDays).toHaveBeenCalledWith('calendar', expect.objectContaining({ start: '2030-05-01', end: '2030-05-31' }), undefined);

    fireEvent.press(screen.getByTestId('shift-calendar-day-2030-05-10'));
    expect(screen.getByTestId('shift-day-card-c1')).toBeTruthy();

    fireEvent.press(screen.getByTestId('shifts-calendar-filter-s1'));
    expect(actions.fetchShiftDaysForDateRange).toHaveBeenLastCalledWith('2030-05-01', '2030-05-31', 's1', undefined);

    // The shift filter stays on across months; static shift days drop out while it is on.
    fireEvent.press(screen.getByTestId('shift-calendar-next'));
    expect(actions.fetchShiftDaysForDateRange).toHaveBeenLastCalledWith('2030-06-01', '2030-06-30', 's1', undefined);
    expect(actions.fetchWorkshiftDays).not.toHaveBeenCalledWith('calendar', expect.objectContaining({ start: '2030-06-01' }), undefined);

    fireEvent.press(screen.getByTestId('shifts-calendar-filter-all'));
    expect(actions.fetchShiftDaysForDateRange).toHaveBeenLastCalledWith('2030-06-01', '2030-06-30', null, undefined);
  });

  it('a standing shift opens in a sheet and can be shown in the calendar', () => {
    useShiftsStore.setState({ shifts: [makeShift('s1', { InShift: true, Groups: [{ GroupId: 'g1', GroupName: 'Station 1', Roles: [{ RoleId: 'r1', RoleName: 'EMT', Required: 2 }] }] })] });
    render(<ShiftsScreen initialView="mine" />);
    fireEvent.press(screen.getByTestId('shift-card-s1'));
    expect(actions.fetchShift).toHaveBeenCalledWith('s1');
    expect(screen.getByTestId('shift-group-g1', q)).toHaveTextContent(/shifts\.required_count:2/);
    fireEvent.press(screen.getByTestId('shift-details-view-calendar', q));
    expect(screen.getByTestId('shift-calendar-view')).toBeTruthy();
    expect(actions.fetchShiftDaysForDateRange).toHaveBeenLastCalledWith(expect.any(String), expect.any(String), 's1', undefined);
  });

  it('opens a day in the sheet and loads its roster', () => {
    useShiftsStore.setState({ todaysShiftDays: [makeDay('1')] });
    render(<ShiftsScreen />);
    fireEvent.press(screen.getByTestId('shift-day-card-1'));
    expect(screen.getByTestId('shift-day-details', q)).toBeTruthy();
    expect(actions.fetchShiftDay).toHaveBeenCalledWith('1', { workshift: false });
  });

  it('trades: an action on a card asks for confirmation, then responds with the offered swap-back', async () => {
    useShiftsStore.setState({
      openTrades: [makeTrade('t1', { IsOpen: true, CanApply: true })],
      myShiftDays: [makeDay('mine1', { MySignupId: 'sig1', MyStatus: ShiftDayMyStatus.OnRoster })],
    });
    render(<ShiftsScreen initialView="trades" />);
    expect(screen.getByTestId('shifts-segment-badge-trades')).toHaveTextContent('1');
    fireEvent.press(screen.getByTestId('trade-apply-t1'));
    fireEvent.press(screen.getByTestId('swap-option-sig1', q));
    fireEvent.press(screen.getByTestId('shift-action-confirm', q));
    await waitFor(() => expect(actions.respondToTrade).toHaveBeenCalledWith('t1', true, '', ['sig1']));
    expect(toasts()).toContain('success:shifts.toast.trade_applied');
    await waitFor(() => expect(actions.fetchTradeDetail).toHaveBeenCalledWith('t1'));
  });

  it('shows an error with retry when a list fails to load', () => {
    useShiftsStore.setState({ errors: { today: { code: 'server', messageKey: 'errors.data.server' } } });
    render(<ShiftsScreen />);
    fireEvent.press(screen.getByTestId('shifts-retry'));
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
    render(<ShiftDayDetails shiftDayId="d1" />);
    fireEvent.press(screen.getByTestId('shift-day-signup-button'));
    expect(screen.getByText('shifts.signup_panel.approval_notice')).toBeTruthy();
    fireEvent.press(screen.getByTestId('shift-day-signup-confirm'));
    await waitFor(() => expect(actions.signupForShift).toHaveBeenCalledWith('d1', 'g1'));
    expect(toasts()).toContain('success:shifts.toast.signup_pending');
    await waitFor(() => expect(screen.getByTestId('shift-day-signup-button')).toBeTruthy());
    expect(actions.fetchShiftDay).toHaveBeenCalledTimes(2);
  });

  it('withdraws an own sign-up and shows the server refusal translated', async () => {
    const day = makeDay('d1', { MySignupId: 'sig-me', MyStatus: ShiftDayMyStatus.OnRoster, Roster: [roster('me', { ShiftSignupId: 'sig-me' })] });
    useShiftsStore.setState({ shiftDaysById: { d1: day } });
    actions.withdrawFromShift.mockResolvedValueOnce(failedOutcome('day_in_past'));
    render(<ShiftDayDetails shiftDayId="d1" />);
    expect(screen.getByText('shifts.you')).toBeTruthy();
    fireEvent.press(screen.getByTestId('shift-day-withdraw-button'));
    fireEvent.press(screen.getByTestId('shift-day-withdraw-confirm'));
    await waitFor(() => expect(actions.withdrawFromShift).toHaveBeenCalledWith('sig-me'));
    expect(toasts()).toContain('error:shifts.errors.day_in_past');
    expect(screen.getByTestId('shift-day-withdraw-panel')).toBeTruthy();
  });

  it('requests a trade from specific candidates', async () => {
    const day = makeDay('d1', { MyStatus: ShiftDayMyStatus.OnRoster, CanTrade: true });
    useShiftsStore.setState({ shiftDaysById: { d1: day }, tradeCandidatesByDay: { d1: [{ UserId: 'c1', Name: 'Casey', GroupId: '', GroupName: 'Station 2', Roles: ['EMT'], RoleIds: [] }] } });
    render(<ShiftDayDetails shiftDayId="d1" />);
    fireEvent.press(screen.getByTestId('shift-day-trade-button'));
    expect(actions.fetchTradeCandidates).toHaveBeenCalledWith('d1');
    expect(screen.getByText('shifts.trade_panel.mode_open_hint:1')).toBeTruthy();
    fireEvent.press(screen.getByTestId('trade-mode-specific'));
    expect(screen.getByTestId('shift-day-trade-confirm')).toBeDisabled();
    fireEvent.press(screen.getByTestId('trade-candidate-c1'));
    fireEvent.changeText(screen.getByTestId('shift-day-trade-note'), ' family ');
    fireEvent.press(screen.getByTestId('shift-day-trade-confirm'));
    await waitFor(() => expect(actions.requestTrade).toHaveBeenCalledWith('d1', ['c1'], 'family', { workshift: false }));
    expect(toasts()).toContain('success:shifts.toast.trade_requested');
  });

  it('static shift days trade as open requests only and offer no sign-up or roster edits', async () => {
    const day = makeDay('w1', { ShiftType: ShiftAssignmentType.Workshift, MyStatus: ShiftDayMyStatus.OnRoster, CanManage: true, CanSignup: true, MyUnitName: 'Engine 1' });
    useShiftsStore.setState({ shiftDaysById: { w1: day } });
    render(<ShiftDayDetails shiftDayId="w1" />);
    expect(actions.fetchShiftDay).toHaveBeenCalledWith('w1', { workshift: true });
    expect(screen.queryByTestId('shift-day-signup-button')).toBeNull();
    expect(screen.queryByTestId('shift-day-add-person-button')).toBeNull();
    fireEvent.press(screen.getByTestId('shift-day-trade-button'));
    expect(screen.queryByTestId('trade-mode-specific')).toBeNull();
    fireEvent.press(screen.getByTestId('shift-day-trade-confirm'));
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
    render(<ShiftDayDetails shiftDayId="d1" />);

    fireEvent.press(screen.getByTestId('roster-approve-u2'));
    fireEvent.press(screen.getByTestId('shift-day-review-confirm'));
    await waitFor(() => expect(actions.reviewSignup).toHaveBeenCalledWith('sig-u2', true, ''));

    await waitFor(() => expect(screen.getByTestId('roster-remove-u3')).toBeTruthy());
    fireEvent.press(screen.getByTestId('roster-remove-u3'));
    fireEvent.changeText(screen.getByTestId('shift-day-remove-note'), 'sick');
    fireEvent.press(screen.getByTestId('shift-day-remove-confirm'));
    await waitFor(() => expect(actions.removeFromShiftDay).toHaveBeenCalledWith('d1', 'u3', 'sick'));

    await waitFor(() => expect(screen.getByTestId('shift-day-add-person-button')).toBeTruthy());
    fireEvent.press(screen.getByTestId('shift-day-add-person-button'));
    expect(actions.fetchPersonnelOptions).toHaveBeenCalledWith('d1');
    fireEvent.press(screen.getByTestId('add-person-u9'));
    fireEvent.press(screen.getByTestId('shift-day-add-confirm'));
    await waitFor(() => expect(actions.assignToShiftDay).toHaveBeenCalledWith('d1', 'u9', 'g1'));
  });

  it('shows the not-found state when the day cannot be loaded', () => {
    render(<ShiftDayDetails shiftDayId="gone" />);
    expect(screen.getByTestId('shift-day-missing')).toBeTruthy();
  });
});

describe('ShiftTradeCard and ShiftActionSheet', () => {
  it('lets the requester pick an applicant and finishes the trade (pending approval toast)', async () => {
    const trade = makeTrade('t2', { Direction: ShiftTradeDirection.Outgoing, IsOpen: true, Users: [{ UserId: 'a1', Name: 'Alex', Declined: false, Offered: true, Reason: '', OfferedShifts: [] }] });
    const onAction = jest.fn();
    render(<ShiftTradeCard trade={trade} onAction={onAction} />);
    expect(screen.getByTestId('trade-cancel-t2')).toBeTruthy();
    fireEvent.press(screen.getByTestId('trade-pick-t2-a1'));
    const action = onAction.mock.calls[0][0];
    expect(action).toMatchObject({ kind: 'finish-trade', offeredShift: null });

    actions.finishTrade.mockResolvedValueOnce(okOutcome({ approvalPending: true }));
    const onClose = jest.fn();
    render(<ShiftActionSheet action={action} onClose={onClose} />);
    fireEvent.press(screen.getByTestId('shift-action-confirm', q));
    await waitFor(() => expect(actions.finishTrade).toHaveBeenCalledWith('t2', 'a1', null));
    expect(toasts()).toContain('success:shifts.toast.trade_finished_pending');
    expect(onClose).toHaveBeenCalled();
  });

  it('a targeted incoming trade offers accept/decline; a refusal keeps the sheet open', async () => {
    const trade = makeTrade('t3', { MyState: ShiftTradeUserState.Open });
    const onAction = jest.fn();
    render(<ShiftTradeCard trade={trade} onAction={onAction} />);
    fireEvent.press(screen.getByTestId('trade-decline-t3'));
    actions.respondToTrade.mockResolvedValueOnce(failedOutcome('not_pending'));
    const onClose = jest.fn();
    render(<ShiftActionSheet action={onAction.mock.calls[0][0]} onClose={onClose} />);
    fireEvent.press(screen.getByTestId('shift-action-confirm', q));
    await waitFor(() => expect(actions.respondToTrade).toHaveBeenCalledWith('t3', false, '', []));
    expect(toasts()).toContain('error:shifts.errors.not_pending');
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('deep-link screens', () => {
  it('ShiftDayScreen loads a static shift day by route id', () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ id: 'w5', workshift: '1' });
    render(<ShiftDayScreen />);
    expect(actions.fetchShiftDay).toHaveBeenCalledWith('w5', { workshift: true });
  });

  it('ShiftDayScreen and ShiftTradeScreen refuse unsafe ids', () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ id: '../settings' });
    render(<ShiftDayScreen />);
    expect(screen.getByTestId('shift-day-invalid')).toBeTruthy();
    render(<ShiftTradeScreen />);
    expect(screen.getByTestId('shift-trade-invalid')).toBeTruthy();
    expect(actions.fetchTradeDetail).not.toHaveBeenCalled();
  });

  it('ShiftTradeScreen shows applicant qualifications to the people who decide', () => {
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
    render(<ShiftTradeScreen tradeId="t9" />);
    expect(actions.fetchTradeDetail).toHaveBeenCalledWith('t9');
    expect(screen.getByTestId('trade-applicant-certs-a1')).toHaveTextContent('EMT-B');
    expect(screen.getByTestId('trade-applicant-conflict-a1')).toBeTruthy();
    expect(screen.getByTestId('trade-applicant-ineligible-a1')).toHaveTextContent('shifts.trade.ineligible.missing_roles');
  });
});
