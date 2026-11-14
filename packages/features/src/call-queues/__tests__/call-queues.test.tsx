import '../../calls/__tests__/test-setup';

import { useArchivedCallsStore, useCallQueueActionsStore, useCallsStore, usePersonnelStore, useUnitsStore } from '@resgrid/data';
import { emitRealtimeEvent } from '@resgrid/realtime';
import { useToastStore } from '@resgrid/ui';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import React from 'react';

import { activateVariant, hidden, makeCall, setRights } from '../../calls/__tests__/test-utils';
import { archivedCallStateLabelKey, archivedCallTypes, countActiveArchivedCallFilters, EMPTY_ARCHIVED_CALL_FILTERS, filterArchivedCalls, toggled } from '../lib/archived-calls';
import { dispatchesToSelection, mergeDispatchSelections, selectionSize } from '../lib/dispatch-selection';
import { matchesQueueQuery, scheduledDispatchUtc } from '../lib/queue-filters';
import { callQueuesNav } from '../nav';
import ArchivedCallsScreen from '../screens/archived-calls';
import PendingCallsScreen from '../screens/pending-calls';
import ScheduledCallsScreen from '../screens/scheduled-calls';

jest.mock('@resgrid/api', () => ({
  ...jest.requireActual('@resgrid/api'),
  getNewCallData: jest.fn(async () => ({ Status: 'success', Data: { Personnel: [], Groups: [], Roles: [], Units: [{ UnitId: 'u7', Name: 'E7', GroupName: 'Station 1', Type: 'Engine' }] } })),
}));

let mockPolicyRules: { Key: string; Visible: boolean; Required: boolean }[] = [];

jest.mock('../../calls/hooks/use-call-form-data', () => {
  const { createFieldPolicy } = jest.requireActual('../../calls/lib/field-policy');

  return { ...jest.requireActual('../../calls/hooks/use-call-form-data'), useNewCallFieldPolicy: () => createFieldPolicy(mockPolicyRules) };
});

const mockFetchPending = jest.fn(async () => undefined);
const mockFetchScheduled = jest.fn(async () => undefined);
const mockDispatchNow = jest.fn(async () => ({ ok: true, error: null }));
const mockCancelPending = jest.fn(async () => ({ ok: true, error: null }));
const mockExtraData = jest.fn(async () => ({ Dispatches: [{ Id: 'u1', Type: 'Unit', Name: 'E1' }] }));

beforeEach(() => {
  mockPolicyRules = [];
  activateVariant('dispatch');
  setRights({});
  useToastStore.setState({ toasts: [] });
  useCallsStore.setState({
    pendingCalls: [makeCall('p1', { Name: 'Waiting fire', State: 8, Number: '26-1', LoggedOnUtc: '2026-10-31T11:00:00Z' }), makeCall('p2', { Name: 'Alarm', State: 8, Address: '9 Oak' })],
    scheduledCalls: [makeCall('s1', { Name: 'Burn permit', ScheduledOnUtc: '2026-11-02T09:00:00Z' })],
    callPriorities: [],
    loading: {},
    errors: {},
    fetchCallPriorities: jest.fn(async () => undefined),
    fetchPendingCalls: mockFetchPending,
    fetchScheduledCalls: mockFetchScheduled,
    fetchCallExtraData: mockExtraData as never,
  });
  useCallQueueActionsStore.setState({ busyCallId: null, dispatchNow: mockDispatchNow, cancelPending: mockCancelPending });
});

afterEach(() => useToastStore.getState().clearToasts());

describe('call queue helpers', () => {
  it('reads dispatches into a selection and merges additively', () => {
    const selection = dispatchesToSelection([
      { Id: 'u1', Type: 'Personnel' },
      { Id: 'g1', Type: 'Group' },
      { Id: 'r1', Type: 'R' },
      { Id: 'e1', Type: 'Unit' },
      { Id: '', Type: 'Unit' },
      { Id: 'x', Type: 'Other' },
    ] as never);

    expect(selection).toEqual({ everyone: false, users: ['u1'], groups: ['g1'], roles: ['r1'], units: ['e1'] });
    expect(mergeDispatchSelections(selection, { everyone: false, users: ['u1', 'u2'], groups: [], roles: [], units: ['e2'] }).units).toEqual(['e1', 'e2']);
    expect(mergeDispatchSelections(selection, { ...selection, everyone: true })).toEqual({ everyone: true, users: [], groups: [], roles: [], units: [] });
    expect(selectionSize(selection)).toBe(4);
  });

  it('filters archived calls by state, priority, type, logged day and every search word', () => {
    const calls = [
      makeCall('a', { State: 1, Priority: 1, Type: 'Fire', LoggedOn: '2026-03-01T10:00:00', Name: 'Barn fire', ContactName: 'Lee' }),
      makeCall('b', { State: 2, Priority: 2, Type: 'EMS', LoggedOn: '2026-05-01T10:00:00', Name: 'Fall' }),
    ];

    expect(filterArchivedCalls(calls, { ...EMPTY_ARCHIVED_CALL_FILTERS, states: [2] }).map((call) => call.CallId)).toEqual(['b']);
    expect(filterArchivedCalls(calls, { ...EMPTY_ARCHIVED_CALL_FILTERS, fromDate: '2026-04-01' }).map((call) => call.CallId)).toEqual(['b']);
    expect(filterArchivedCalls(calls, { ...EMPTY_ARCHIVED_CALL_FILTERS, query: 'barn lee' }).map((call) => call.CallId)).toEqual(['a']);
    // Searched as shown: Core's `&amp;` as `&`, the web's rich text without its markup.
    const encoded = [makeCall('c', { Name: 'Smith &amp; Sons', Nature: '<p>Gas <strong>leak</strong></p>' })];
    expect(filterArchivedCalls(encoded, { ...EMPTY_ARCHIVED_CALL_FILTERS, query: 'smith & sons gas leak' })).toHaveLength(1);
    expect(filterArchivedCalls(encoded, { ...EMPTY_ARCHIVED_CALL_FILTERS, query: 'strong' })).toHaveLength(0);
    expect(countActiveArchivedCallFilters({ ...EMPTY_ARCHIVED_CALL_FILTERS, states: [1], toDate: '2026-01-01', query: 'x' })).toBe(2);
    expect(archivedCallTypes(calls)).toEqual(['EMS', 'Fire']);
    expect(archivedCallStateLabelKey(7)).toBe('call_detail.close_call_types.false_alarm');
    expect(archivedCallStateLabelKey(0)).toBeNull();
    expect(toggled([1, 2], 2)).toEqual([1]);
  });

  it('matches queue searches and resolves the scheduled time', () => {
    expect(matchesQueueQuery(makeCall('p1', { Name: 'Waiting fire' }), 'FIRE')).toBe(true);
    expect(matchesQueueQuery(makeCall('abc'), 'ab')).toBe(true);
    expect(matchesQueueQuery(makeCall('p1'), 'zzz')).toBe(false);
    expect(scheduledDispatchUtc({ ScheduledOnUtc: '', DispatchedOnUtc: 'x' })).toBe('x');
  });

  it('gates the queue nav entries on capabilities.calls.queues', () => {
    expect(callQueuesNav.map((entry) => entry.href)).toEqual(['/pending-calls', '/scheduled-calls', '/archived-calls']);
    expect(callQueuesNav[0].requiresCapability?.({ calls: { queues: false } } as never)).toBe(false);
  });
});

describe('PendingCallsScreen', () => {
  it('lists pending calls, searches and opens one', async () => {
    await render(<PendingCallsScreen realtime={false} />);
    expect(mockFetchPending).toHaveBeenCalledWith({ bypassCache: true });
    expect(screen.getByText('Waiting fire')).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('pending-calls-search'), '9 oak');
    expect(screen.queryByText('Waiting fire')).toBeNull();
    await fireEvent.press(screen.getByTestId('pending-call-row-p2'));
    expect(router.push).toHaveBeenCalledWith('/call/p2');
  });

  it('dispatches with the proposed recipients preselected', async () => {
    await render(<PendingCallsScreen realtime={false} />);
    await act(async () => fireEvent.press(screen.getByTestId('pending-call-dispatch-p1')));
    expect(mockExtraData).toHaveBeenCalledWith('p1', { bypassCache: true });
    expect(screen.getByTestId('dispatch-selection-confirm', hidden)).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByTestId('dispatch-selection-confirm', hidden)));
    expect(mockDispatchNow).toHaveBeenCalledWith('p1', { dispatchList: 'U:u1' });
    expect(useToastStore.getState().toasts[0]).toMatchObject({ type: 'success', message: 'call_queues.dispatch_now_success' });
  });

  it('offers only the recipient lists the department shows, and only All Call with every list hidden', async () => {
    // SAFETY: the picker reads only ids and names from the rosters.
    usePersonnelStore.setState({ personnel: [{ UserId: 'p9', FirstName: 'Pat', LastName: 'Lee' }] as never, groups: [] });
    // SAFETY: as above.
    useUnitsStore.setState({ units: [{ UnitId: 'u1', Name: 'E1' }] as never });

    try {
      mockPolicyRules = [{ Key: 'dispatchUnits', Visible: false, Required: false }];
      const { unmount } = await render(<PendingCallsScreen realtime={false} />);
      await act(async () => fireEvent.press(screen.getByTestId('pending-call-dispatch-p1')));
      expect(screen.getByTestId('dispatch-option-users-p9', hidden)).toBeTruthy();
      expect(screen.queryByTestId('dispatch-selection-units', hidden)).toBeNull();
      // The unit proposed on the call stays on it, though its list is hidden.
      await act(async () => fireEvent.press(screen.getByTestId('dispatch-selection-confirm', hidden)));
      expect(mockDispatchNow).toHaveBeenLastCalledWith('p1', { dispatchList: 'U:u1' });
      await unmount();

      mockPolicyRules = ['dispatchPersonnel', 'dispatchGroups', 'dispatchRoles', 'dispatchUnits'].map((Key) => ({ Key, Visible: false, Required: false }));
      await render(<PendingCallsScreen realtime={false} />);
      await act(async () => fireEvent.press(screen.getByTestId('pending-call-dispatch-p1')));
      expect(screen.getByTestId('dispatch-selection-all-call-hint', hidden)).toHaveTextContent('calls.all_call_dispatch_now_help');
      expect(screen.queryByTestId('dispatch-selection-search', hidden)).toBeNull();
      await fireEvent(screen.getByTestId('dispatch-selection-everyone', hidden), 'valueChange', true);
      await act(async () => fireEvent.press(screen.getByTestId('dispatch-selection-confirm', hidden)));
      expect(mockDispatchNow).toHaveBeenLastCalledWith('p1', { dispatchList: '0' });
    } finally {
      usePersonnelStore.setState({ personnel: [], groups: [] });
      useUnitsStore.setState({ units: [] });
    }
  });

  it('cancels a pending call only after confirming', async () => {
    await render(<PendingCallsScreen realtime={false} />);
    await fireEvent.press(screen.getByTestId('pending-call-cancel-p1'));
    expect(mockCancelPending).not.toHaveBeenCalled();
    expect(screen.getByText('pending_calls.cancel_confirm', hidden)).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByTestId('call-queue-confirm-confirm', hidden)));
    expect(mockCancelPending).toHaveBeenCalledWith('p1');
    expect(useToastStore.getState().toasts[0]).toMatchObject({ type: 'success', message: 'pending_calls.cancel_success' });
  });

  it('hides actions without the create-calls right, refetches on call pushes and shows the empty state', async () => {
    setRights({ CanCreateCalls: false });
    const { unmount } = await render(<PendingCallsScreen />);
    expect(screen.queryByTestId('pending-call-dispatch-p1')).toBeNull();
    mockFetchPending.mockClear();
    await act(() => emitRealtimeEvent('callAdded', '9'));
    expect(mockFetchPending).toHaveBeenCalledWith(expect.objectContaining({ bypassCache: true }));
    await unmount();
    await act(() => {
      useCallsStore.setState({ pendingCalls: [] });
    });
    await render(<PendingCallsScreen realtime={false} />);
    expect(screen.getByText('pending_calls.no_pending_calls')).toBeTruthy();
  });

  it("offers cancel by the Close Call permission and dispatch only on the member's own calls (or to an admin)", async () => {
    useCallsStore.setState({ pendingCalls: [makeCall('p1', { State: 8, ReportingUserId: 'someone-else' }), makeCall('p2', { State: 8, ReportingUserId: null })] });
    setRights({ CanCloseCalls: false });
    const { unmount } = await render(<PendingCallsScreen realtime={false} />);
    expect(screen.queryByTestId('pending-call-dispatch-p1')).toBeNull();
    expect(screen.queryByTestId('pending-call-cancel-p1')).toBeNull();
    await unmount();

    setRights({ IsAdmin: true });
    await render(<PendingCallsScreen realtime={false} />);
    expect(screen.getByTestId('pending-call-dispatch-p2')).toBeTruthy();
    expect(screen.getByTestId('pending-call-cancel-p2')).toBeTruthy();
  });
});

describe('ScheduledCallsScreen', () => {
  it("offers dispatch now only on the member's own scheduled calls", async () => {
    useCallsStore.setState({ scheduledCalls: [makeCall('s1', { ScheduledOnUtc: '2026-11-02T09:00:00Z', ReportingUserId: 'someone-else' })] });
    await render(<ScheduledCallsScreen realtime={false} />);
    expect(screen.queryByTestId('scheduled-call-dispatch-now-s1')).toBeNull();
  });

  it('dispatches a scheduled call now after confirming, to the recipients already on it', async () => {
    await render(<ScheduledCallsScreen realtime={false} />);
    expect(screen.getByText('Burn permit')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('scheduled-call-dispatch-now-s1'));
    await act(async () => fireEvent.press(screen.getByTestId('call-queue-confirm-confirm', hidden)));
    expect(mockDispatchNow).toHaveBeenCalledWith('s1', {});
  });

  it('reports a failed dispatch', async () => {
    mockDispatchNow.mockResolvedValueOnce({ ok: false, error: { code: 'rejected', messageKey: 'errors.data.rejected' } } as never);
    await render(<ScheduledCallsScreen realtime={false} />);
    await fireEvent.press(screen.getByTestId('scheduled-call-dispatch-now-s1'));
    await act(async () => fireEvent.press(screen.getByTestId('call-queue-confirm-confirm', hidden)));
    expect(useToastStore.getState().toasts[0]).toMatchObject({ type: 'error', message: 'call_queues.dispatch_now_error' });
  });
});

describe('ArchivedCallsScreen', () => {
  const load = jest.fn(async () => undefined);
  const selectYear = jest.fn(async () => undefined);

  beforeEach(() => {
    useArchivedCallsStore.setState({
      years: ['2026', '2025'],
      selectedYear: '2026',
      archivedCalls: [makeCall('a1', { Name: 'Barn fire', State: 1, Type: 'Fire' }), makeCall('a2', { Name: 'Lift assist', State: 5, Type: 'EMS' })],
      loading: {},
      errors: {},
      fetchedAt: {},
      load,
      selectYear,
    });
  });

  it('loads when stale, switches years and filters by close type', async () => {
    await render(<ArchivedCallsScreen now={() => Date.parse('2026-10-31T12:00:00Z')} />);
    expect(load).toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('archived-year-2025'));
    expect(selectYear).toHaveBeenCalledWith('2025');
    await fireEvent.press(screen.getByTestId('archived-calls-filters-toggle'));
    await fireEvent.press(screen.getByTestId('archived-filter-state-5'));
    expect(screen.queryByText('Barn fire')).toBeNull();
    expect(screen.getByText('Lift assist')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('archived-filters-clear'));
    expect(screen.getByText('Barn fire')).toBeTruthy();
  });

  // A margin under a chip in a ScrollRow made the row taller than its chips and its centred edge chevron sat low.
  it('keeps the scrolling year chips free of a bottom margin, while wrapping filter chips keep theirs', async () => {
    await render(<ArchivedCallsScreen now={() => Date.parse('2026-10-31T12:00:00Z')} />);
    expect(String(screen.getByTestId('archived-year-2026').props.className)).not.toMatch(/(^|\s)m[tby]-/);
    await fireEvent.press(screen.getByTestId('archived-calls-filters-toggle'));
    expect(String(screen.getByTestId('archived-filter-state-5').props.className)).toMatch(/(^|\s)mb-2(\s|$)/);
  });

  it('reuses a year loaded a moment ago and shows the no-match state', async () => {
    const now = Date.parse('2026-10-31T12:00:00Z');
    useArchivedCallsStore.setState({ fetchedAt: { calls: now - 1000 } });
    await render(<ArchivedCallsScreen now={() => now} />);
    expect(load).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByTestId('archived-calls-search'), 'nothing like this');
    expect(screen.getByText('archived_calls.no_matches')).toBeTruthy();
  });
});
