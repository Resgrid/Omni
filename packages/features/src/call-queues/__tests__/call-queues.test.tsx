import '../../calls/__tests__/test-setup';

import { useArchivedCallsStore, useCallQueueActionsStore, useCallsStore, usePersonnelStore, useUnitsStore } from '@resgrid/data';
import { emitRealtimeEvent } from '@resgrid/realtime';
import { useToastStore } from '@resgrid/ui';
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { router } from 'expo-router';
import React from 'react';
import { Dimensions, StyleSheet } from 'react-native';

import { activateVariant, hidden, makeCall, setRights } from '../../calls/__tests__/test-utils';
import { archivedCallStateLabelKey, archivedCallTypes, countActiveArchivedCallFilters, EMPTY_ARCHIVED_CALL_FILTERS, filterArchivedCalls, toggled } from '../lib/archived-calls';
import { dispatchesToSelection, mergeDispatchSelections, selectionSize } from '../lib/dispatch-selection';
import { matchesQueueQuery, scheduledDispatchUtc } from '../lib/queue-filters';
import { callQueuesNav } from '../nav';
import ArchivedCallsScreen, { ARCHIVED_FILTERS_MAX_SHARE } from '../screens/archived-calls';
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
const mockDismissAsSpam = jest.fn(async (_callId: string, _blockSender: boolean) => ({ ok: true, error: null }));
const mockExtraData = jest.fn(async () => ({ Dispatches: [{ Id: 'u1', Type: 'Unit', Name: 'E1' }] }));

type ExtraDataAnswer = Awaited<ReturnType<typeof mockExtraData>>;

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
  useCallQueueActionsStore.setState({ busyCallId: null, dispatchNow: mockDispatchNow, cancelPending: mockCancelPending, dismissAsSpam: mockDismissAsSpam });
  mockDismissAsSpam.mockClear();
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

describe('queue screen titles', () => {
  // The app bar titles each queue route from its nav entry: a second title under it cost a phone ~40 pt of list.
  it('leaves the title to the app bar, and shows it only where a screen is embedded with showHeader', async () => {
    for (const [Screen, title] of [
      [PendingCallsScreen, 'pending_calls.title'],
      [ScheduledCallsScreen, 'scheduled_calls.title'],
      [ArchivedCallsScreen, 'archived_calls.title'],
    ] as const) {
      const { unmount } = await render(<Screen />);
      expect(screen.queryByText(title)).toBeNull();
      await unmount();
    }

    await render(<PendingCallsScreen realtime={false} showHeader />);
    expect(screen.getByText('pending_calls.title')).toBeTruthy();
  });
});

describe('QueueTable layout', () => {
  const initial = { window: Dimensions.get('window'), screen: Dimensions.get('screen') };

  const renderAt = async (width: number, height: number) => {
    const metrics = { width, height, scale: 2, fontScale: 1 };
    await act(() => Dimensions.set({ window: metrics, screen: metrics }));

    return render(<PendingCallsScreen realtime={false} />);
  };

  afterEach(async () => {
    await act(() => Dimensions.set(initial));
  });

  // Beside the fixed number (90) and actions (240) columns, a 744–834 pt portrait tablet left ~50 pt per flexible column:
  // type, priority, received time and the intake channel were cut off.
  it('stacks the calls as cards on phones and portrait tablets, each column labelled in the card', async () => {
    useCallsStore.setState({ pendingCalls: [makeCall('p3', { Name: 'Transfer request', State: 8, Type: 'Transfer', CallSource: 6, IntakeChannelType: 1, IntakeChannelName: 'Hospital line' })] });

    for (const [width, height] of [
      [390, 844],
      [844, 390],
      [744, 1133],
      [834, 1194],
    ]) {
      const { unmount } = await renderAt(width, height);
      expect(screen.queryByTestId('pending-calls-table-header')).toBeNull();
      const card = within(screen.getByTestId('pending-call-row-p3'));
      expect(card.getByText('scheduled_calls.table_type')).toBeTruthy();
      expect(card.getByText('Transfer')).toBeTruthy();
      expect(card.getByTestId('pending-call-intake-source-p3')).toBeTruthy();
      expect(card.getByTestId('pending-call-dispatch-p3')).toBeTruthy();
      await unmount();
    }
  });

  it('keeps the table on landscape tablets', async () => {
    for (const [width, height] of [
      [1133, 744],
      [1194, 834],
    ]) {
      const { unmount } = await renderAt(width, height);
      expect(screen.getByTestId('pending-calls-table-header')).toHaveTextContent(/scheduled_calls\.table_number/);
      expect(within(screen.getByTestId('pending-call-row-p1')).queryByText('scheduled_calls.table_type')).toBeNull();
      await unmount();
    }
  });
});

describe('PendingCallsScreen', () => {
  it('lists pending calls, searches and opens one', async () => {
    await render(<PendingCallsScreen realtime={false} />);
    expect(mockFetchPending).toHaveBeenCalledWith({ bypassCache: true });
    expect(screen.getByText(/Waiting fire/)).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('pending-calls-search'), '9 oak');
    expect(screen.queryByText(/Waiting fire/)).toBeNull();
    await fireEvent.press(screen.getByTestId('pending-call-row-p2'));
    expect(router.push).toHaveBeenCalledWith('/call/p2');
  });

  it('shows where a pending call goes and the route it runs under its address (Core M0322)', async () => {
    useCallsStore.setState({
      pendingCalls: [
        makeCall('p1', { Name: 'Transfer', State: 8, DestinationAddress: '5 Oak Ave', DestinationLatitude: 39.3, DestinationLongitude: -119.3, RoutePlanId: 'rp-1', RoutePlanName: 'Hydrant loop' }),
        makeCall('p2', { Name: 'Alarm', State: 8, DestinationPoiId: 3, DestinationName: 'Mercy Hospital' }),
        makeCall('p3', { Name: 'Plain', State: 8 }),
      ],
    });
    await render(<PendingCallsScreen realtime={false} />);
    expect(screen.getByTestId('queue-call-destination-p1')).toHaveTextContent('calls.destination_to:5 Oak Ave');
    expect(screen.getByTestId('queue-call-route-p1')).toHaveTextContent('calls.route_named:Hydrant loop');
    expect(screen.getByTestId('queue-call-destination-p2')).toHaveTextContent('calls.destination_to:Mercy Hospital');
    expect(screen.queryByTestId('queue-call-destination-p3')).toBeNull();
    expect(screen.queryByTestId('queue-call-route-p3')).toBeNull();
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

  it('opens the picker for the call pressed last, even when an earlier call’s lookup finishes after it', async () => {
    let answerFirst: (value: ExtraDataAnswer) => void = () => undefined;

    mockExtraData.mockImplementationOnce(
      () =>
        new Promise<ExtraDataAnswer>((resolve) => {
          answerFirst = resolve;
        })
    );
    mockExtraData.mockResolvedValueOnce({ Dispatches: [{ Id: 'u2', Type: 'Unit', Name: 'E2' }] });
    await render(<PendingCallsScreen realtime={false} />);

    await act(async () => fireEvent.press(screen.getByTestId('pending-call-dispatch-p1')));
    await act(async () => fireEvent.press(screen.getByTestId('pending-call-dispatch-p2')));
    await act(async () => answerFirst({ Dispatches: [{ Id: 'u1', Type: 'Unit', Name: 'E1' }] }));
    await act(async () => fireEvent.press(screen.getByTestId('dispatch-selection-confirm', hidden)));

    expect(mockDispatchNow).toHaveBeenCalledTimes(1);
    expect(mockDispatchNow).toHaveBeenCalledWith('p2', { dispatchList: 'U:u2' });
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
    expect(screen.getByText(/Burn permit/)).toBeTruthy();
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
    expect(screen.queryByText(/Barn fire/)).toBeNull();
    expect(screen.getByText(/Lift assist/)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('archived-filters-clear'));
    expect(screen.getByText(/Barn fire/)).toBeTruthy();
  });

  // A margin under a chip in a ScrollRow made the row taller than its chips and its centred edge chevron sat low.
  it('keeps the scrolling year chips free of a bottom margin, while wrapping filter chips keep theirs', async () => {
    await render(<ArchivedCallsScreen now={() => Date.parse('2026-10-31T12:00:00Z')} />);
    expect(String(screen.getByTestId('archived-year-2026').props.className)).not.toMatch(/(^|\s)m[tby]-/);
    await fireEvent.press(screen.getByTestId('archived-calls-filters-toggle'));
    expect(String(screen.getByTestId('archived-filter-state-5').props.className)).toMatch(/(^|\s)mb-2(\s|$)/);
  });

  // With many call types the open filters pushed the list to nothing, and the dates and "Clear filters" ran off a phone.
  it('keeps the filters closed until asked, then caps them at a share of the column and scrolls them, with Clear filters in view', async () => {
    useArchivedCallsStore.setState({ archivedCalls: Array.from({ length: 40 }, (_, index) => makeCall(`a${index}`, { Name: `Call ${index}`, State: 1, Type: `Type ${index}` })) });
    await render(<ArchivedCallsScreen now={() => Date.parse('2026-10-31T12:00:00Z')} />);
    expect(screen.queryByTestId('archived-calls-filters')).toBeNull();

    await fireEvent.press(screen.getByTestId('archived-calls-filters-toggle'));
    const panel = screen.getByTestId('archived-calls-filters');
    expect(StyleSheet.flatten(panel.props.style)).toMatchObject({ maxHeight: ARCHIVED_FILTERS_MAX_SHARE });
    // The share is of the column the list also sits in (under the search and years), so the list keeps the rest.
    const body = within(screen.getByTestId('archived-calls-body'));
    expect(body.getByTestId('archived-calls-filters')).toBeTruthy();
    expect(body.getByTestId('archived-calls-table')).toBeTruthy();

    const scroll = screen.getByTestId('archived-calls-filters-scroll');
    expect(StyleSheet.flatten(scroll.props.style)).toMatchObject({ flexGrow: 0, flexShrink: 1 });
    expect(within(scroll).getByTestId('archived-filter-type-Type 39')).toBeTruthy();
    expect(within(scroll).getByTestId('archived-filter-to')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('archived-filter-type-Type 3'));
    // The toggle says how many filters are on, so it still shows once the panel is closed.
    expect(screen.getByTestId('archived-calls-filters-toggle').props.accessibilityLabel).toBe('archived_calls.filters (1)');
    expect(within(scroll).queryByTestId('archived-filters-clear')).toBeNull();
    expect(within(panel).getByTestId('archived-filters-clear')).toBeTruthy();
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

describe('PendingCallsScreen: calls from external intake (Core M0323)', () => {
  it('says which intake channel a pending call came through, and nothing for one a person logged', async () => {
    useCallsStore.setState({
      pendingCalls: [
        makeCall('p3', { Name: 'Transfer request', State: 8, CallSource: 6, IntakeChannelType: 1, IntakeChannelName: 'Hospital transfer line' }),
        makeCall('p4', { Name: 'Voicemail', State: 8, CallSource: 7, IntakeChannelType: null, IntakeChannelName: null }),
        makeCall('p5', { Name: 'Logged by hand', State: 8, CallSource: 1 }),
      ],
    });
    await render(<PendingCallsScreen realtime={false} />);

    expect(screen.getByTestId('pending-call-intake-source-p3')).toHaveTextContent('calls.intake_source.via_sms_named:Hospital transfer line');
    expect(screen.getByTestId('pending-call-intake-source-p4')).toHaveTextContent('calls.intake_source.voice');
    expect(screen.queryByTestId('pending-call-intake-source-p5')).toBeNull();
  });
});

describe('PendingCallsScreen: intake spam screening (Core M0326)', () => {
  beforeEach(() => {
    useCallsStore.setState({
      pendingCalls: [
        makeCall('p3', { Name: 'Win a cruise', State: 8, CallSource: 6, IntakeChannelType: 1, IntakeChannelName: 'Dispatch number', IntakeScreening: 1 }),
        makeCall('p4', { Name: 'Repeat texter', State: 8, CallSource: 6, IntakeChannelType: 1, IntakeScreening: 2 }),
        makeCall('p5', { Name: 'Logged by hand', State: 8, CallSource: 1, IntakeScreening: 1 }),
        makeCall('p6', { Name: 'Older server', State: 8, CallSource: 6, IntakeChannelType: 1 }),
      ],
    });
  });

  it('badges screened intake calls only', async () => {
    await render(<PendingCallsScreen realtime={false} />);

    expect(screen.getByTestId('pending-call-intake-screening-p3')).toHaveTextContent('calls.intake_screening.likely_not_incident');
    expect(screen.getByTestId('pending-call-intake-screening-p4')).toHaveTextContent('calls.intake_screening.repeat_sender');
    expect(screen.queryByTestId('pending-call-intake-screening-p5')).toBeNull();
    expect(screen.queryByTestId('pending-call-intake-screening-p6')).toBeNull();
  });

  it('offers Dismiss as Spam on intake calls only, with the Close Call permission', async () => {
    const { unmount } = await render(<PendingCallsScreen realtime={false} />);
    expect(screen.getByTestId('pending-call-dismiss-spam-p3')).toBeTruthy();
    expect(screen.getByTestId('pending-call-dismiss-spam-p6')).toBeTruthy();
    expect(screen.queryByTestId('pending-call-dismiss-spam-p5')).toBeNull();
    await unmount();

    setRights({ CanCloseCalls: false });
    await render(<PendingCallsScreen realtime={false} />);
    expect(screen.queryByTestId('pending-call-dismiss-spam-p3')).toBeNull();
  });

  it('dismisses only after confirming, blocking the sender by default', async () => {
    await render(<PendingCallsScreen realtime={false} />);
    await fireEvent.press(screen.getByTestId('pending-call-dismiss-spam-p3'));
    expect(mockDismissAsSpam).not.toHaveBeenCalled();
    expect(screen.getByText('pending_calls.dismiss_spam_confirm', hidden)).toBeTruthy();

    await act(async () => fireEvent.press(screen.getByTestId('call-queue-confirm-confirm', hidden)));

    expect(mockDismissAsSpam).toHaveBeenCalledWith('p3', true);
    expect(useToastStore.getState().toasts[0]).toMatchObject({ type: 'success', message: 'pending_calls.dismiss_spam_blocked' });
  });

  it('can dismiss without blocking, and says so when the server refuses', async () => {
    mockDismissAsSpam.mockResolvedValueOnce({ ok: false, error: null });
    await render(<PendingCallsScreen realtime={false} />);
    await fireEvent.press(screen.getByTestId('pending-call-dismiss-spam-p4'));
    await fireEvent.press(screen.getByTestId('call-queue-confirm-block-sender', hidden));
    await act(async () => fireEvent.press(screen.getByTestId('call-queue-confirm-confirm', hidden)));

    expect(mockDismissAsSpam).toHaveBeenCalledWith('p4', false);
    expect(useToastStore.getState().toasts[0]).toMatchObject({ type: 'error', message: 'pending_calls.dismiss_spam_error' });
  });
});
