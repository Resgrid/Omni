import {
  acceptDispatcherItem,
  getDispatcherDesk,
  getDispatcherQueueItem,
  linkDispatcherItemCall,
  registerDispatcherDeskDevice,
  sendDispatcherDeskHeartbeat,
  sendDispatcherMessage,
  startDispatcherBreak,
  unregisterDispatcherDeskDevice,
  unregisterDispatcherDeskDeviceForEndedSession,
} from '@resgrid/api';
import {
  type DispatcherBreakData,
  DispatcherDeskActionResult,
  type DispatcherDeskMemberData,
  DispatcherDeskResult,
  type DispatcherDeskResultData,
  DispatcherDisplayState,
  type DispatcherQueueItemData,
  DispatcherQueueItemDetailResult,
  DispatcherQueueItemState,
} from '@resgrid/models';
import { defaultResetRegistry } from '@resgrid/offline';

import { createDataTestRuntime, type DataTestRuntime, flush, httpError, persisted } from '../../__tests__/helpers';
import { selectBadgeCount, useBadgeCountsStore } from '../../badge-counts/badge-counts-store';
import { breakDueBackMs, deskQueueCount, firstOfferExpiryMs, nextBreakOf, selectMyWork, selectWaitingWork, sortDeskQueue } from '../desk-selectors';
import {
  applyDeskBoard,
  DESK_PRESENCE_KEY,
  deskItemKey,
  mergeRecentDeskItems,
  prunePendingCallLinks,
  resetDispatcherDeskDeviceForTests,
  unregisterDispatcherDeskDeviceAtSignOut,
  useDispatcherDeskStore,
} from '../dispatcher-desk-store';

jest.mock('@resgrid/api', () => ({
  ...jest.requireActual('@resgrid/api'),
  getDispatcherDesk: jest.fn(),
  getDispatcherQueueItem: jest.fn(),
  acceptDispatcherItem: jest.fn(),
  sendDispatcherMessage: jest.fn(),
  startDispatcherBreak: jest.fn(),
  sendDispatcherDeskHeartbeat: jest.fn(),
  registerDispatcherDeskDevice: jest.fn(),
  unregisterDispatcherDeskDevice: jest.fn(),
  linkDispatcherItemCall: jest.fn(),
  unregisterDispatcherDeskDeviceForEndedSession: jest.fn(async () => true),
}));

const answer = <R extends { Status: string }>(result: R, fields: Partial<R>): R => Object.assign(result, { Status: 'success' }, fields);

const member = (UserId: string, overrides: Partial<DispatcherDeskMemberData> = {}): DispatcherDeskMemberData => ({
  UserId,
  Name: `Dispatcher ${UserId}`,
  DisplayState: DispatcherDisplayState.Available,
  IsSignedIn: true,
  IsOnDuty: true,
  IsSupervisor: false,
  DutyMode: 0,
  Duty: null,
  DutyEndsOn: null,
  SignedInOn: '2026-11-19T14:00:00Z',
  StateChangedOn: null,
  LastSeenOn: null,
  AwayReason: null,
  CallbackNumber: null,
  DeviceKind: 'phone',
  ActiveBreak: null,
  NextBreak: null,
  ActiveItemCount: 0,
  OfferedItemCount: 0,
  Capacity: 1,
  OverdueMinutes: 0,
  CanSupervise: false,
  ...overrides,
});

const item = (id: string, overrides: Partial<DispatcherQueueItemData> = {}): DispatcherQueueItemData => ({
  DispatcherQueueItemId: id,
  Kind: 3,
  State: DispatcherQueueItemState.Queued,
  Outcome: 0,
  CallId: null,
  CallNumber: null,
  CallName: null,
  CallPriority: null,
  CallPriorityColor: null,
  Priority: 0,
  SourceAddress: '+15555550100',
  SourceName: null,
  TargetAddress: null,
  Subject: null,
  Preview: 'Smoke behind the school',
  AssignedUserId: null,
  AssignedUserName: null,
  OfferedOn: null,
  OfferExpiresOn: null,
  OfferAttempts: 0,
  AcceptedOn: null,
  CompletedOn: null,
  DueOn: null,
  CreatedOn: '2026-11-19T15:00:00Z',
  LastActivityOn: null,
  OverflowedOn: null,
  OverflowNote: null,
  EscalatedOn: null,
  Note: null,
  CallerWaiting: false,
  MessageCount: 1,
  UnreadCount: 1,
  ...overrides,
});

const board = (overrides: Partial<DispatcherDeskResultData> = {}): DispatcherDeskResultData => ({
  Enabled: true,
  GeneratedOn: '2026-11-19T15:01:00Z',
  Config: null,
  Me: member('me'),
  Members: [member('me'), member('u-2')],
  Queue: [],
  MyBreaks: [],
  MinimumAvailable: 1,
  AvailableCount: 2,
  OnBreakCount: 0,
  OnDutyCount: 2,
  BelowMinimum: false,
  IsDispatcher: true,
  ...overrides,
});

const planned = (DispatcherBreakId: string, ScheduledStartOn: string): DispatcherBreakData => ({
  DispatcherBreakId,
  UserId: 'me',
  UserName: null,
  ShiftId: null,
  ShiftDayId: null,
  BreakType: 1,
  State: 0,
  ScheduledStartOn,
  ScheduledEndOn: null,
  DurationMinutes: 15,
  StartedOn: null,
  ExpectedReturnOn: null,
  EndedOn: null,
  EndReason: 0,
  Note: null,
});

const deskAnswer = (data: DispatcherDeskResultData) => answer(new DispatcherDeskResult(), { Data: data });
const actionAnswer = (fields: Partial<DispatcherDeskActionResult>) => answer(new DispatcherDeskActionResult(), { Success: true, ...fields });

let runtime: DataTestRuntime;

/** Lets fire-and-forget follow-ups (a board re-read after a heartbeat) finish. */
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const reset = async (name: string) => defaultResetRegistry.getStoreResets().get(name)?.('logout');

beforeEach(async () => {
  runtime = await createDataTestRuntime({ variant: 'dispatch' });
  await reset('data.dispatcher-desk');
  await reset('data.badge-counts');
  resetDispatcherDeskDeviceForTests();
  jest.mocked(getDispatcherDesk).mockResolvedValue(deskAnswer(board()));
});

describe('desk selectors', () => {
  const queue = [
    item('waiting-old', { CreatedOn: '2026-11-19T14:00:00Z' }),
    item('waiting-new', { CreatedOn: '2026-11-19T15:30:00Z' }),
    item('offered', { State: DispatcherQueueItemState.Offered, AssignedUserId: 'me' }),
    item('held', { State: DispatcherQueueItemState.Accepted, AssignedUserId: 'me' }),
    item('theirs', { State: DispatcherQueueItemState.Accepted, AssignedUserId: 'u-2' }),
    item('urgent', { Priority: 5, CreatedOn: '2026-11-19T15:45:00Z' }),
  ];

  it('splits the member’s work from the shared queue, offers first, then priority, then the longest waiting', () => {
    expect(selectMyWork(queue, 'me').map((entry) => entry.DispatcherQueueItemId)).toEqual(['offered', 'held']);
    expect(selectWaitingWork(queue).map((entry) => entry.DispatcherQueueItemId)).toEqual(['urgent', 'waiting-old', 'waiting-new']);
    expect(sortDeskQueue(queue)[0].DispatcherQueueItemId).toBe('offered');
  });

  it('counts offers to the member plus the shared queue, nothing when the desk is off or the member no dispatcher', () => {
    expect(deskQueueCount(board({ Queue: queue }))).toBe(4);
    expect(deskQueueCount(board({ Queue: queue, Enabled: false }))).toBe(0);
    expect(deskQueueCount(board({ Queue: queue, IsDispatcher: false }))).toBe(0);
    expect(deskQueueCount(null)).toBe(0);
  });

  it('reads a break as a length: due back at start + minutes when the server sent no expected return', () => {
    const started = Date.parse('2026-11-19T15:00:00Z');

    expect(breakDueBackMs({ ExpectedReturnOn: null, StartedOn: '2026-11-19T15:00:00Z', DurationMinutes: 30 })).toBe(started + 30 * 60000);
    expect(breakDueBackMs({ ExpectedReturnOn: '2026-11-19T15:20:00Z', StartedOn: '2026-11-19T15:00:00Z', DurationMinutes: 30 })).toBe(started + 20 * 60000);
    expect(nextBreakOf(null, [planned('b2', '2026-11-19T18:00:00Z'), planned('b1', '2026-11-19T17:00:00Z')])?.DispatcherBreakId).toBe('b1');
  });
});

describe('dispatcher desk store', () => {
  it('loads the board, persists it and counts the desk badge', async () => {
    jest.mocked(getDispatcherDesk).mockResolvedValueOnce(deskAnswer(board({ Queue: [item('a'), item('b', { State: DispatcherQueueItemState.Offered, AssignedUserId: 'me' })] })));
    await useDispatcherDeskStore.getState().fetchDesk();

    expect(useDispatcherDeskStore.getState().desk?.Queue).toHaveLength(2);
    expect(persisted(runtime.kv, 'omni-dispatcher-desk-storage')?.state.desk).toBeTruthy();
    expect(selectBadgeCount('deskQueue')(useBadgeCountsStore.getState())).toBe(2);
  });

  it('moves work that left the queue to Recent with its last known state', () => {
    const first = applyDeskBoard({ desk: null, recent: [] }, board({ Queue: [item('a'), item('b')] }));
    const second = applyDeskBoard(first, board({ Queue: [item('b'), item('c', { State: DispatcherQueueItemState.Completed })] }));

    expect(second.desk?.Queue.map((entry) => entry.DispatcherQueueItemId)).toEqual(['b']);
    expect(second.recent.map((entry) => entry.DispatcherQueueItemId)).toEqual(['c', 'a']);
    expect(mergeRecentDeskItems(second.recent, [item('a', { State: DispatcherQueueItemState.Cancelled })]).map((entry) => entry.DispatcherQueueItemId)).toEqual(['a', 'c']);
  });

  it('stops asking an older Core without the desk (404) until the next sign-in', async () => {
    jest.mocked(getDispatcherDesk).mockRejectedValueOnce(httpError(404));
    await useDispatcherDeskStore.getState().fetchDesk();

    expect(useDispatcherDeskStore.getState().unsupported).toBe(true);
    jest.mocked(getDispatcherDesk).mockClear();
    await useDispatcherDeskStore.getState().fetchDesk();
    expect(getDispatcherDesk).not.toHaveBeenCalled();
  });

  it('keeps the last board when a refresh fails', async () => {
    await useDispatcherDeskStore.getState().fetchDesk();
    jest.mocked(getDispatcherDesk).mockRejectedValueOnce(httpError(503));
    await useDispatcherDeskStore.getState().fetchDesk({ bypassCache: true });

    expect(useDispatcherDeskStore.getState().desk?.Me?.UserId).toBe('me');
    expect(useDispatcherDeskStore.getState().errors.desk?.code).toBe('server');
  });

  it('applies what an accept answered at once, spins its key while running and reads the board again', async () => {
    await useDispatcherDeskStore.getState().fetchDesk();
    let resolve: (value: DispatcherDeskActionResult) => void = () => undefined;
    jest.mocked(acceptDispatcherItem).mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      })
    );

    const pending = useDispatcherDeskStore.getState().accept('q-1');
    expect(useDispatcherDeskStore.getState().busyKeys).toEqual([deskItemKey('q-1')]);
    // A second press joins the one in flight.
    const again = useDispatcherDeskStore.getState().accept('q-1');
    expect(acceptDispatcherItem).toHaveBeenCalledTimes(1);

    // The read that follows is still out: what the screen shows meanwhile is what the action answered.
    jest.mocked(getDispatcherDesk).mockReturnValueOnce(new Promise(() => undefined));
    resolve(actionAnswer({ Me: member('me', { DisplayState: DispatcherDisplayState.Busy, ActiveItemCount: 1 }), Item: item('q-1', { State: DispatcherQueueItemState.Accepted, AssignedUserId: 'me' }) }));
    const outcome = await pending;
    await again;
    await flush();

    expect(outcome).toMatchObject({ ok: true, refusal: null, error: null });
    expect(useDispatcherDeskStore.getState().busyKeys).toEqual([]);
    expect(useDispatcherDeskStore.getState().desk?.Me?.DisplayState).toBe(DispatcherDisplayState.Busy);
    expect(useDispatcherDeskStore.getState().desk?.Queue.map((entry) => entry.DispatcherQueueItemId)).toEqual(['q-1']);
    expect(getDispatcherDesk).toHaveBeenCalledTimes(2);
  });

  it('reports the desk’s refusal by name, and a failure to get an answer as a data error', async () => {
    await useDispatcherDeskStore.getState().fetchDesk();
    jest.mocked(startDispatcherBreak).mockResolvedValueOnce(answer(new DispatcherDeskActionResult(), { Success: false, Error: 'HoldingWork' }));
    expect(await useDispatcherDeskStore.getState().startBreak({ BreakType: 1, DurationMinutes: 15 })).toMatchObject({ ok: false, refusal: 'HoldingWork', error: null });

    jest.mocked(startDispatcherBreak).mockRejectedValueOnce(httpError(503));
    expect(await useDispatcherDeskStore.getState().startBreak({ BreakType: 1, DurationMinutes: 15 })).toMatchObject({ ok: false, refusal: null, error: { code: 'server' } });
    expect(useDispatcherDeskStore.getState().busyKeys).not.toContain(DESK_PRESENCE_KEY);
  });

  it('adds a sent message to the conversation it belongs to', async () => {
    jest.mocked(getDispatcherQueueItem).mockResolvedValueOnce(answer(new DispatcherQueueItemDetailResult(), { Data: { Item: item('q-1'), Events: [], Messages: [], CanReply: true, CanConnectVoice: false } }));
    await useDispatcherDeskStore.getState().fetchItem('q-1');
    // The conversation read that follows the send is still out.
    jest.mocked(getDispatcherQueueItem).mockReturnValueOnce(new Promise(() => undefined));
    jest.mocked(sendDispatcherMessage).mockResolvedValueOnce(
      actionAnswer({
        Message: {
          DispatcherConversationMessageId: 'm-1',
          Direction: 2,
          FromAddress: null,
          ToAddress: '+15555550100',
          Body: 'Units are on the way',
          UserId: 'me',
          UserName: null,
          CreatedOn: '2026-11-19T15:02:00Z',
          DeliveryState: 1,
          Error: null,
        },
      })
    );

    await useDispatcherDeskStore.getState().sendMessage('q-1', '  Units are on the way ');

    expect(sendDispatcherMessage).toHaveBeenCalledWith(expect.anything(), { ItemId: 'q-1', Body: 'Units are on the way' });
    expect(useDispatcherDeskStore.getState().items['q-1'].Messages.map((message) => message.Body)).toEqual(['Units are on the way']);
  });

  it('heartbeats quietly and applies the member’s state it answers', async () => {
    await useDispatcherDeskStore.getState().fetchDesk();
    jest.mocked(sendDispatcherDeskHeartbeat).mockResolvedValueOnce(actionAnswer({ Me: member('me', { DisplayState: DispatcherDisplayState.Away }) }));

    await expect(useDispatcherDeskStore.getState().heartbeat()).resolves.toBe(true);
    expect(useDispatcherDeskStore.getState().busyKeys).toEqual([]);
    expect(useDispatcherDeskStore.getState().desk?.Me?.DisplayState).toBe(DispatcherDisplayState.Away);
  });

  it('re-reads the board when a heartbeat counts an offer the board never heard about (a lost realtime event)', async () => {
    await useDispatcherDeskStore.getState().fetchDesk();
    jest.mocked(getDispatcherDesk).mockClear();
    jest.mocked(getDispatcherDesk).mockResolvedValueOnce(deskAnswer(board({ Queue: [item('q-9', { State: DispatcherQueueItemState.Offered, AssignedUserId: 'me' })] })));

    jest.mocked(sendDispatcherDeskHeartbeat).mockResolvedValueOnce(actionAnswer({ Me: member('me', { OfferedItemCount: 1 }) }));
    await useDispatcherDeskStore.getState().heartbeat();
    await settle();

    expect(getDispatcherDesk).toHaveBeenCalledTimes(1);
    expect(useDispatcherDeskStore.getState().desk?.Queue?.map((entry) => entry.DispatcherQueueItemId)).toEqual(['q-9']);

    // In step with an offer out: read anyway, since one offer the server replaced with another keeps the counts equal.
    jest.mocked(getDispatcherDesk).mockResolvedValueOnce(deskAnswer(board({ Queue: [item('q-10', { State: DispatcherQueueItemState.Offered, AssignedUserId: 'me' })] })));
    jest.mocked(sendDispatcherDeskHeartbeat).mockResolvedValueOnce(actionAnswer({ Me: member('me', { OfferedItemCount: 1 }) }));
    await useDispatcherDeskStore.getState().heartbeat();
    await settle();
    expect(getDispatcherDesk).toHaveBeenCalledTimes(2);
    expect(useDispatcherDeskStore.getState().desk?.Queue?.map((entry) => entry.DispatcherQueueItemId)).toEqual(['q-10']);
  });

  it('reads nothing more on a heartbeat in step with no offer out', async () => {
    await useDispatcherDeskStore.getState().fetchDesk();
    jest.mocked(getDispatcherDesk).mockClear();

    jest.mocked(sendDispatcherDeskHeartbeat).mockResolvedValueOnce(actionAnswer({ Me: member('me') }));
    await useDispatcherDeskStore.getState().heartbeat();
    await settle();
    expect(getDispatcherDesk).not.toHaveBeenCalled();
  });

  it('drops a heartbeat answer older than an action that changed the member’s state while it was out', async () => {
    await useDispatcherDeskStore.getState().fetchDesk();
    let answerHeartbeat: (value: DispatcherDeskActionResult) => void = () => undefined;
    jest.mocked(sendDispatcherDeskHeartbeat).mockReturnValueOnce(
      new Promise((done) => {
        answerHeartbeat = done;
      })
    );
    const heartbeat = useDispatcherDeskStore.getState().heartbeat();

    // The break starts (and its read lands) before the heartbeat answers with the state from before it.
    jest.mocked(startDispatcherBreak).mockResolvedValueOnce(actionAnswer({ Me: member('me', { DisplayState: DispatcherDisplayState.OnBreak }) }));
    jest.mocked(getDispatcherDesk).mockReturnValueOnce(new Promise(() => undefined));
    await useDispatcherDeskStore.getState().startBreak({ BreakType: 1, DurationMinutes: 15 });
    answerHeartbeat(actionAnswer({ Me: member('me', { DisplayState: DispatcherDisplayState.Available }) }));
    await heartbeat;

    expect(useDispatcherDeskStore.getState().desk?.Me?.DisplayState).toBe(DispatcherDisplayState.OnBreak);

    // The next heartbeat, with nothing in between, applies again.
    jest.mocked(sendDispatcherDeskHeartbeat).mockResolvedValueOnce(actionAnswer({ Me: member('me', { DisplayState: DispatcherDisplayState.Away }) }));
    await useDispatcherDeskStore.getState().heartbeat();
    expect(useDispatcherDeskStore.getState().desk?.Me?.DisplayState).toBe(DispatcherDisplayState.Away);
  });

  it('finds when the member’s first offer on the board runs out', () => {
    const queue = [
      item('later', { State: DispatcherQueueItemState.Offered, AssignedUserId: 'me', OfferExpiresOn: '2026-11-19T15:02:00Z' }),
      item('first', { State: DispatcherQueueItemState.Offered, AssignedUserId: 'me', OfferExpiresOn: '2026-11-19T15:01:00Z' }),
      item('theirs', { State: DispatcherQueueItemState.Offered, AssignedUserId: 'u-2', OfferExpiresOn: '2026-11-19T15:00:00Z' }),
    ];

    expect(firstOfferExpiryMs(queue, 'me')).toBe(Date.parse('2026-11-19T15:01:00Z'));
    expect(firstOfferExpiryMs(queue, 'u-3')).toBeNull();
  });

  it('registers this device on the desk subscriber once per token and takes it off at sign-out as the ended session', async () => {
    jest.mocked(registerDispatcherDeskDevice).mockResolvedValue(actionAnswer({}));
    await expect(useDispatcherDeskStore.getState().registerDevice({ Platform: 2, Token: 'fcm' })).resolves.toBe(true);
    await expect(useDispatcherDeskStore.getState().registerDevice({ Platform: 2, Token: 'fcm' })).resolves.toBe(true);
    expect(registerDispatcherDeskDevice).toHaveBeenCalledTimes(1);

    await unregisterDispatcherDeskDeviceAtSignOut({ accessToken: 'ended', baseUrl: 'https://api.example.com/api/v4' });
    expect(unregisterDispatcherDeskDeviceForEndedSession).toHaveBeenCalledWith({ accessToken: 'ended', baseUrl: 'https://api.example.com/api/v4' }, { Platform: 2, Token: 'fcm' });

    // Nothing left to take off the second time.
    jest.mocked(unregisterDispatcherDeskDeviceForEndedSession).mockClear();
    await unregisterDispatcherDeskDeviceAtSignOut({ accessToken: 'ended', baseUrl: 'https://api.example.com/api/v4' });
    expect(unregisterDispatcherDeskDeviceForEndedSession).not.toHaveBeenCalled();
  });

  it('takes a desk registration that lands after sign-out off again as the session that ended', async () => {
    let resolveRequest: (value: DispatcherDeskActionResult) => void = () => undefined;
    jest.mocked(registerDispatcherDeskDevice).mockReturnValueOnce(
      new Promise((done) => {
        resolveRequest = done;
      })
    );
    const registering = useDispatcherDeskStore.getState().registerDevice({ Platform: 2, Token: 'late' });

    // Sign-out finds nothing registered yet: the request is still out.
    await unregisterDispatcherDeskDeviceAtSignOut({ accessToken: 'ended', baseUrl: 'https://api.example.com/api/v4' });
    await reset('data.dispatcher-desk');
    expect(unregisterDispatcherDeskDeviceForEndedSession).not.toHaveBeenCalled();

    resolveRequest(actionAnswer({}));
    await expect(registering).resolves.toBe(false);
    expect(unregisterDispatcherDeskDeviceForEndedSession).toHaveBeenCalledWith({ accessToken: 'ended', baseUrl: 'https://api.example.com/api/v4' }, { Platform: 2, Token: 'late' });
    expect(useDispatcherDeskStore.getState().deskDevice).toBeNull();

    // Nothing of it is left for the next session's sign-out.
    jest.mocked(unregisterDispatcherDeskDeviceForEndedSession).mockClear();
    await unregisterDispatcherDeskDeviceAtSignOut({ accessToken: 'next', baseUrl: 'https://api.example.com/api/v4' });
    expect(unregisterDispatcherDeskDeviceForEndedSession).not.toHaveBeenCalled();
  });

  it('keeps a registration that replaced the one a slow unregister took off', async () => {
    jest.mocked(registerDispatcherDeskDevice).mockResolvedValue(actionAnswer({}));
    await useDispatcherDeskStore.getState().registerDevice({ Platform: 2, Token: 'a' });
    let resolveRequest: (value: DispatcherDeskActionResult) => void = () => undefined;
    jest.mocked(unregisterDispatcherDeskDevice).mockReturnValueOnce(
      new Promise((done) => {
        resolveRequest = done;
      })
    );
    const unregistering = useDispatcherDeskStore.getState().unregisterDevice();

    await useDispatcherDeskStore.getState().registerDevice({ Platform: 2, Token: 'b' });
    resolveRequest(actionAnswer({}));
    await expect(unregistering).resolves.toBe(true);
    expect(useDispatcherDeskStore.getState().deskDevice).toEqual({ Platform: 2, Token: 'b' });

    // Sign-out still takes the newer one off.
    await unregisterDispatcherDeskDeviceAtSignOut({ accessToken: 'ended', baseUrl: 'https://api.example.com/api/v4' });
    expect(unregisterDispatcherDeskDeviceForEndedSession).toHaveBeenCalledWith(expect.anything(), { Platform: 2, Token: 'b' });
  });

  it('keeps a created call the desk did not link, until a link or a board without the need settles it', async () => {
    await useDispatcherDeskStore.getState().fetchDesk();
    jest.mocked(getDispatcherDesk).mockReturnValue(new Promise(() => undefined));
    jest.mocked(linkDispatcherItemCall).mockResolvedValueOnce(answer(new DispatcherDeskActionResult(), { Success: false, Error: 'NotHeld' }));

    expect(await useDispatcherDeskStore.getState().linkCall('q-1', 42)).toMatchObject({ ok: false, refusal: 'NotHeld' });
    expect(useDispatcherDeskStore.getState().pendingCallLinks).toEqual({ 'q-1': 42 });

    jest.mocked(linkDispatcherItemCall).mockResolvedValueOnce(actionAnswer({}));
    expect(await useDispatcherDeskStore.getState().linkCall('q-1', 42)).toMatchObject({ ok: true });
    expect(useDispatcherDeskStore.getState().pendingCallLinks).toEqual({});

    // A board where the item has its call (or has left the queue) needs no pending link.
    expect(prunePendingCallLinks({ 'q-1': 42, 'q-2': 7, 'q-3': 9 }, [item('q-1', { CallId: 42 }), item('q-2')])).toEqual({ 'q-2': 7 });
  });

  it('drops a late answer after sign-out and clears everything', async () => {
    await useDispatcherDeskStore.getState().fetchDesk();
    let resolve: (value: DispatcherDeskActionResult) => void = () => undefined;
    jest.mocked(acceptDispatcherItem).mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      })
    );
    const pending = useDispatcherDeskStore.getState().accept('q-1');

    await reset('data.dispatcher-desk');
    resolve(actionAnswer({ Me: member('me', { DisplayState: DispatcherDisplayState.Busy }) }));
    await pending;
    await flush();

    expect(useDispatcherDeskStore.getState().desk).toBeNull();
    expect(useDispatcherDeskStore.getState().busyKeys).toEqual([]);
  });
});
