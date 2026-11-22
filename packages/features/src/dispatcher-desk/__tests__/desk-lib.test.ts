import '../../calls/__tests__/test-setup';

import { DispatcherBreakState, DispatcherDisplayState, DispatcherMessageDirection, DispatcherQueueItemKind, DispatcherQueueItemOutcome, DispatcherQueueItemState } from '@resgrid/models';

import { breakLengthOptions } from '../components/take-break-sheet';
import { buildCoverageTimeline, mergeSlots, segmentBox } from '../lib/coverage-timeline';
import { breakAlertKey, dueBreakAlerts, escalationKey, findNewEscalations, findNewInbound, findNewOffers, isBreakAlert, offerKey, shouldSuppressDeskAlert } from '../lib/desk-alerts';
import { completeOutcomesFor, defaultCompleteOutcome, deskErrorKey, eventTypeLabelKey, formatCountdown, itemPreview, itemTitle, kindLabelKey } from '../lib/desk-format';
import { DISPATCHER_DESK_ROUTE_PATTERNS, dispatcherDeskRoutes } from '../routes';
import { callPrefillFromItem } from '../screens/desk-item-call';
import { board, breakEntry, config, item, member, NOW } from './desk-fixtures';

jest.mock('@resgrid/notifications', () => ({ notificationSoundService: { play: jest.fn(), playForNotification: jest.fn() }, soundForDeskEvent: jest.fn(), isAlertSuppressed: jest.fn(() => false) }));

const t = (key: string, options?: Record<string, string | number>) => (options ? `${key}:${Object.values(options).join(',')}` : key);

describe('desk alerts', () => {
  const offered = item('o1', { State: DispatcherQueueItemState.Offered, AssignedUserId: 'me', OfferedOn: '2026-11-19T14:59:30Z', OfferAttempts: 1 });

  it('announces an offer once, and a re-offer of the same item again', () => {
    const announced = new Set<string>();

    expect(findNewOffers([offered, item('q1')], 'me', announced).map((entry) => entry.DispatcherQueueItemId)).toEqual(['o1']);
    announced.add(offerKey(offered));
    expect(findNewOffers([offered], 'me', announced)).toEqual([]);
    expect(findNewOffers([{ ...offered, OfferedOn: '2026-11-19T15:02:00Z', OfferAttempts: 3 }], 'me', announced)).toHaveLength(1);
    // Someone else's offer is not this member's to hear.
    expect(findNewOffers([{ ...offered, AssignedUserId: 'u-2' }], 'me', new Set())).toEqual([]);
  });

  it('hears waiting work that escalated once, and new inbound messages on held conversations only', () => {
    const escalated = item('e1', { EscalatedOn: '2026-11-19T14:58:00Z' });

    expect(findNewEscalations([escalated, item('q2')], new Set()).map((entry) => entry.DispatcherQueueItemId)).toEqual(['e1']);
    expect(findNewEscalations([escalated], new Set([escalationKey(escalated)]))).toEqual([]);

    const held = item('h1', { State: DispatcherQueueItemState.Accepted, AssignedUserId: 'me', UnreadCount: 2 });
    const theirs = item('h2', { State: DispatcherQueueItemState.Accepted, AssignedUserId: 'u-2', UnreadCount: 4 });

    const previous = new Map([
      ['h1', 1],
      ['h2', 1],
    ]);

    expect(findNewInbound([held, theirs], 'me', previous).map((entry) => entry.DispatcherQueueItemId)).toEqual(['h1']);
    // A conversation the previous board did not have is not "new messages" (it is a new item).
    expect(findNewInbound([held], 'me', new Map())).toEqual([]);
  });

  it('reminds before the next planned break, says when it is due and when a running break is over, once each', () => {
    const next = breakEntry('b1', { ScheduledStartOn: '2026-11-19T15:04:00Z' });
    const soon = board({ Me: member('me', { NextBreak: next }), MyBreaks: [next] });

    expect(dueBreakAlerts(soon, NOW, new Set())).toEqual([expect.objectContaining({ kind: 'reminder', minutes: 4 })]);
    expect(dueBreakAlerts(soon, Date.parse('2026-11-19T14:58:00Z'), new Set())).toEqual([]);
    expect(dueBreakAlerts(soon, Date.parse('2026-11-19T15:04:30Z'), new Set())).toEqual([expect.objectContaining({ kind: 'due' })]);
    expect(dueBreakAlerts(soon, NOW, new Set([breakAlertKey({ kind: 'reminder', breakEntry: next })]))).toEqual([]);

    const running = breakEntry('b2', { State: DispatcherBreakState.Active, StartedOn: '2026-11-19T14:40:00Z', ExpectedReturnOn: '2026-11-19T14:55:00Z' });
    const onBreak = board({ Me: member('me', { DisplayState: DispatcherDisplayState.OnBreak, ActiveBreak: running }) });

    expect(dueBreakAlerts(onBreak, NOW, new Set())).toEqual([expect.objectContaining({ kind: 'over' })]);
    expect(dueBreakAlerts(onBreak, Date.parse('2026-11-19T14:50:00Z'), new Set())).toEqual([]);
    expect(dueBreakAlerts(board({ Me: member('me', { IsSignedIn: false, NextBreak: next }) }), NOW, new Set())).toEqual([]);
  });

  it('holds every alert back while on break, except break pushes and alerts, unless the department keeps them on', () => {
    const onBreak = board({ Me: member('me', { DisplayState: DispatcherDisplayState.OnBreak }) });

    expect(shouldSuppressDeskAlert(onBreak, { channel: 'presentation', eventCode: 'C1234' })).toBe(true);
    expect(shouldSuppressDeskAlert(onBreak, { channel: 'toast' })).toBe(true);
    expect(shouldSuppressDeskAlert(onBreak, { channel: 'modal', eventCode: 'DB:b-1', kind: 'deskBreak' })).toBe(false);
    expect(shouldSuppressDeskAlert(onBreak, { channel: 'presentation', eventCode: 'db:b-1' })).toBe(false);
    expect(shouldSuppressDeskAlert(board({ ...onBreak, Config: config({ SuppressAlertsOnBreak: false }) }), { channel: 'sound', kind: 'call' })).toBe(false);
    expect(shouldSuppressDeskAlert(board(), { channel: 'sound', kind: 'call' })).toBe(false);
    expect(shouldSuppressDeskAlert(null, { channel: 'toast' })).toBe(false);
    expect(isBreakAlert({ channel: 'sound', kind: 'deskBreak' })).toBe(true);
  });
});

describe('coverage timeline', () => {
  it('lays out duty, planned, taken and overdue breaks, and merges coverage slots', () => {
    const timeline = buildCoverageTimeline(
      {
        FromUtc: '2026-11-19T12:00:00Z',
        ToUtc: '2026-11-19T20:00:00Z',
        SlotMinutes: 30,
        Duty: [
          {
            UserId: 'me',
            ShiftId: 3,
            ShiftDayId: 44,
            ShiftName: 'Day',
            ShiftColor: null,
            Day: '2026-11-19',
            StartUtc: '2026-11-19T11:00:00Z',
            EndUtc: '2026-11-19T19:00:00Z',
            IsSupervisor: false,
            Source: 1,
            IsPending: false,
            ShiftDispatcherId: 's1',
          },
        ],
        Breaks: [
          breakEntry('planned', { ScheduledStartOn: '2026-11-19T17:00:00Z', ScheduledEndOn: '2026-11-19T17:30:00Z', DurationMinutes: 30 }),
          breakEntry('overdue', { UserId: 'u-2', UserName: 'Sam', State: DispatcherBreakState.Active, StartedOn: '2026-11-19T14:30:00Z', ExpectedReturnOn: '2026-11-19T14:45:00Z' }),
          breakEntry('gone', { State: DispatcherBreakState.Cancelled }),
        ],
        Slots: [
          { StartUtc: '2026-11-19T14:30:00Z', EndUtc: '2026-11-19T15:00:00Z', OnDuty: 2, OnBreak: 1, Available: 1, Minimum: 2, BelowMinimum: true, BreaksOverlap: false },
          { StartUtc: '2026-11-19T15:00:00Z', EndUtc: '2026-11-19T15:30:00Z', OnDuty: 2, OnBreak: 1, Available: 1, Minimum: 2, BelowMinimum: true, BreaksOverlap: true },
          { StartUtc: '2026-11-19T15:30:00Z', EndUtc: '2026-11-19T16:00:00Z', OnDuty: 2, OnBreak: 0, Available: 2, Minimum: 2, BelowMinimum: false, BreaksOverlap: false },
        ],
        Warnings: [],
        Names: { me: 'Dana Desk' },
      },
      NOW
    );

    expect(timeline.rows.map((row) => row.name)).toEqual(['Dana Desk', 'Sam']);
    // Duty is clipped to the window.
    expect(timeline.rows[0].duty[0].startMs).toBe(Date.parse('2026-11-19T12:00:00Z'));
    expect(timeline.rows[0].breaks.map((entry) => [entry.breakEntry.DispatcherBreakId, entry.taken, entry.overdue])).toEqual([['planned', false, false]]);
    expect(timeline.rows[1].breaks[0]).toMatchObject({ taken: true, overdue: true, endMs: NOW });
    expect(timeline.belowMinimum).toEqual([{ startMs: Date.parse('2026-11-19T14:30:00Z'), endMs: Date.parse('2026-11-19T15:30:00Z') }]);
    expect(timeline.overlaps).toHaveLength(1);
    expect(timeline.hourTicks).toHaveLength(9);
    expect(segmentBox({ startMs: Date.parse('2026-11-19T16:00:00Z'), endMs: Date.parse('2026-11-19T18:00:00Z') }, timeline, 800)).toEqual({ left: 400, width: 200 });
    expect(mergeSlots([], () => true)).toEqual([]);
  });
});

describe('desk formatting', () => {
  it('shows a call nature stored as rich text as one line of words, and leaves texted angle brackets alone', () => {
    expect(itemPreview(item('p1', { Preview: '<p>Dispatcher desk QA walk.</p><p>Do <strong>not</strong> dispatch.</p>' }))).toBe('Dispatcher desk QA walk. Do not dispatch.');
    expect(itemPreview(item('t1', { Preview: 'pt <unconscious> bp 80' }))).toBe('pt <unconscious> bp 80');
    expect(itemPreview(item('n1', { Preview: null }))).toBe('');
  });

  it('maps desk refusals to their messages and unknown ones to a general one', () => {
    expect(deskErrorKey('CoverageTooLow')).toBe('dispatcher_desk.errors.coverage_too_low');
    expect(deskErrorKey('NotADispatcher')).toBe('dispatcher_desk.errors.not_a_dispatcher');
    expect(deskErrorKey('SomethingNew')).toBe('dispatcher_desk.errors.unknown');
    expect(deskErrorKey(null)).toBe('dispatcher_desk.errors.unknown');
    expect(eventTypeLabelKey(4)).toBe('dispatcher_desk.event.offer_expired');
    expect(eventTypeLabelKey(18)).toBe('dispatcher_desk.event.conversation_closed');
    expect(eventTypeLabelKey(19)).toBe('dispatcher_desk.event.held_for_review');
    expect(kindLabelKey(DispatcherQueueItemKind.Voice)).toBe('dispatcher_desk.kind.voice');
  });

  it('counts down, titles items and offers the outcomes that fit the kind', () => {
    expect(formatCountdown(65000)).toBe('1:05');
    expect(formatCountdown(3725000)).toBe('1:02:05');
    expect(formatCountdown(-5)).toBe('0:00');
    expect(itemTitle(item('c', { Kind: DispatcherQueueItemKind.PendingCall, CallNumber: '26-14', CallName: 'Fall' }))).toBe('26-14 · Fall');
    expect(itemTitle(item('t', { SourceName: 'Pat' }))).toBe('Pat');
    expect(completeOutcomesFor(item('c', { Kind: DispatcherQueueItemKind.PendingCall }))[0]).toBe(DispatcherQueueItemOutcome.Dispatched);
    // A call still pending is not marked dispatched for the member: they pick; a conversation with a call became one.
    expect(defaultCompleteOutcome(item('c', { Kind: DispatcherQueueItemKind.PendingCall, CallId: 9 }))).toBeNull();
    expect(defaultCompleteOutcome(item('t', { Kind: DispatcherQueueItemKind.Text, CallId: 9 }))).toBe(DispatcherQueueItemOutcome.CallCreated);
    expect(defaultCompleteOutcome(item('t', { Kind: DispatcherQueueItemKind.Text, CallId: null }))).toBeNull();
    expect(completeOutcomesFor(item('t', { CallId: 9 }))[0]).toBe(DispatcherQueueItemOutcome.CallCreated);
    expect(completeOutcomesFor(item('t'))).not.toContain(DispatcherQueueItemOutcome.CallCreated);
    expect(breakLengthOptions([30, 0, 25])).toEqual([10, 15, 20, 25, 30, 45, 60]);
  });

  it('prefills a call from the inbound messages and the sender of a conversation', () => {
    const conversation = item('t', { SourceName: 'Pat Lee', SourceAddress: '+15555550199' });

    const detail = {
      Item: conversation,
      Events: [],
      Messages: [
        {
          DispatcherConversationMessageId: 'm1',
          Direction: DispatcherMessageDirection.Inbound,
          FromAddress: '+15555550199',
          ToAddress: null,
          Body: 'Smoke behind the school',
          UserId: null,
          UserName: null,
          CreatedOn: null,
          DeliveryState: 0,
          Error: null,
        },
        {
          DispatcherConversationMessageId: 'm2',
          Direction: DispatcherMessageDirection.Outbound,
          FromAddress: null,
          ToAddress: null,
          Body: 'Where exactly?',
          UserId: 'me',
          UserName: null,
          CreatedOn: null,
          DeliveryState: 2,
          Error: null,
        },
        {
          DispatcherConversationMessageId: 'm3',
          Direction: DispatcherMessageDirection.Inbound,
          FromAddress: '+15555550199',
          ToAddress: null,
          Body: '12 Elm St',
          UserId: null,
          UserName: null,
          CreatedOn: null,
          DeliveryState: 0,
          Error: null,
        },
      ],
      CanReply: true,
      CanConnectVoice: false,
    };

    expect(callPrefillFromItem(conversation, detail, t)).toEqual({
      name: 'dispatcher_desk.create_call.name:dispatcher_desk.kind.text,Pat Lee',
      nature: 'Smoke behind the school\n12 Elm St',
      contactName: 'Pat Lee',
      contactInfo: '+15555550199',
    });
    expect(callPrefillFromItem(conversation, null, t).nature).toBe('Smoke behind the school');
  });

  it('builds safe desk routes and publishes the canonical patterns', () => {
    expect(dispatcherDeskRoutes.item('q-1')).toBe('/desk/item/q-1');
    expect(dispatcherDeskRoutes.itemCall('q-1')).toBe('/desk/item/q-1/call');
    expect(dispatcherDeskRoutes.deskWithItem('q-1')).toBe('/desk?itemId=q-1');
    expect(dispatcherDeskRoutes.item('../etc')).toBeNull();
    expect(DISPATCHER_DESK_ROUTE_PATTERNS).toEqual({ desk: '/desk', item: '/desk/item/[id]', itemCall: '/desk/item/[id]/call', breaks: '/desk/breaks' });
  });
});
