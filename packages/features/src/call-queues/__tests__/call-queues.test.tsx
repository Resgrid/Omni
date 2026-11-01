import '../../calls/__tests__/test-setup';

import { useArchivedCallsStore, useCallQueueActionsStore, useCallsStore } from '@resgrid/data';
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

const mockFetchPending = jest.fn(async () => undefined);
const mockFetchScheduled = jest.fn(async () => undefined);
const mockDispatchNow = jest.fn(async () => ({ ok: true, error: null }));
const mockCancelPending = jest.fn(async () => ({ ok: true, error: null }));
const mockExtraData = jest.fn(async () => ({ Dispatches: [{ Id: 'u1', Type: 'Unit', Name: 'E1' }] }));

beforeEach(() => {
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
  it('lists pending calls, searches and opens one', () => {
    render(<PendingCallsScreen realtime={false} />);
    expect(mockFetchPending).toHaveBeenCalledWith({ bypassCache: true });
    expect(screen.getByText('Waiting fire')).toBeTruthy();
    fireEvent.changeText(screen.getByTestId('pending-calls-search'), '9 oak');
    expect(screen.queryByText('Waiting fire')).toBeNull();
    fireEvent.press(screen.getByTestId('pending-call-row-p2'));
    expect(router.push).toHaveBeenCalledWith('/call/p2');
  });

  it('dispatches with the proposed recipients preselected', async () => {
    render(<PendingCallsScreen realtime={false} />);
    await act(async () => fireEvent.press(screen.getByTestId('pending-call-dispatch-p1')));
    expect(mockExtraData).toHaveBeenCalledWith('p1', { bypassCache: true });
    expect(screen.getByTestId('dispatch-selection-confirm', hidden)).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByTestId('dispatch-selection-confirm', hidden)));
    expect(mockDispatchNow).toHaveBeenCalledWith('p1', { dispatchList: 'U:u1' });
    expect(useToastStore.getState().toasts[0]).toMatchObject({ type: 'success', message: 'call_queues.dispatch_now_success' });
  });

  it('cancels a pending call only after confirming', async () => {
    render(<PendingCallsScreen realtime={false} />);
    fireEvent.press(screen.getByTestId('pending-call-cancel-p1'));
    expect(mockCancelPending).not.toHaveBeenCalled();
    expect(screen.getByText('pending_calls.cancel_confirm', hidden)).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByTestId('call-queue-confirm-confirm', hidden)));
    expect(mockCancelPending).toHaveBeenCalledWith('p1');
    expect(useToastStore.getState().toasts[0]).toMatchObject({ type: 'success', message: 'pending_calls.cancel_success' });
  });

  it('hides actions without the create-calls right, refetches on call pushes and shows the empty state', () => {
    setRights({ CanCreateCalls: false });
    const { unmount } = render(<PendingCallsScreen />);
    expect(screen.queryByTestId('pending-call-dispatch-p1')).toBeNull();
    mockFetchPending.mockClear();
    act(() => emitRealtimeEvent('callAdded', '9'));
    expect(mockFetchPending).toHaveBeenCalledWith(expect.objectContaining({ bypassCache: true }));
    unmount();
    act(() => useCallsStore.setState({ pendingCalls: [] }));
    render(<PendingCallsScreen realtime={false} />);
    expect(screen.getByText('pending_calls.no_pending_calls')).toBeTruthy();
  });
});

describe('ScheduledCallsScreen', () => {
  it('dispatches a scheduled call now after confirming, to the recipients already on it', async () => {
    render(<ScheduledCallsScreen realtime={false} />);
    expect(screen.getByText('Burn permit')).toBeTruthy();
    fireEvent.press(screen.getByTestId('scheduled-call-dispatch-now-s1'));
    await act(async () => fireEvent.press(screen.getByTestId('call-queue-confirm-confirm', hidden)));
    expect(mockDispatchNow).toHaveBeenCalledWith('s1', {});
  });

  it('reports a failed dispatch', async () => {
    mockDispatchNow.mockResolvedValueOnce({ ok: false, error: { code: 'rejected', messageKey: 'errors.data.rejected' } } as never);
    render(<ScheduledCallsScreen realtime={false} />);
    fireEvent.press(screen.getByTestId('scheduled-call-dispatch-now-s1'));
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

  it('loads when stale, switches years and filters by close type', () => {
    render(<ArchivedCallsScreen now={() => Date.parse('2026-10-31T12:00:00Z')} />);
    expect(load).toHaveBeenCalled();
    fireEvent.press(screen.getByTestId('archived-year-2025'));
    expect(selectYear).toHaveBeenCalledWith('2025');
    fireEvent.press(screen.getByTestId('archived-calls-filters-toggle'));
    fireEvent.press(screen.getByTestId('archived-filter-state-5'));
    expect(screen.queryByText('Barn fire')).toBeNull();
    expect(screen.getByText('Lift assist')).toBeTruthy();
    fireEvent.press(screen.getByTestId('archived-filters-clear'));
    expect(screen.getByText('Barn fire')).toBeTruthy();
  });

  it('reuses a year loaded a moment ago and shows the no-match state', () => {
    const now = Date.parse('2026-10-31T12:00:00Z');
    useArchivedCallsStore.setState({ fetchedAt: { calls: now - 1000 } });
    render(<ArchivedCallsScreen now={() => now} />);
    expect(load).not.toHaveBeenCalled();
    fireEvent.changeText(screen.getByTestId('archived-calls-search'), 'nothing like this');
    expect(screen.getByText('archived_calls.no_matches')).toBeTruthy();
  });
});
