import { parseUtcMs } from '@resgrid/core/utils/dates';
import {
  DISPATCHER_DESK_ERRORS,
  DispatcherBreakType,
  type DispatcherDeskWarningData,
  DispatcherDisplayState,
  DispatcherMessageDeliveryState,
  type DispatcherQueueItemData,
  DispatcherQueueItemKind,
  DispatcherQueueItemOutcome,
  DispatcherQueueItemState,
} from '@resgrid/models';
import { richTextToPlain } from '@resgrid/ui';
import type { LucideIcon } from 'lucide-react-native';
import { CalendarClock, FileClock, Inbox, Mail, MessageSquareText, MessagesSquare, PhoneIncoming } from 'lucide-react-native';

/** The tones the desk paints states and pills in (the theme's semantic colours). */
export type DeskTone = 'success' | 'warning' | 'error' | 'info' | 'muted';

type Translate = (key: string, options?: Record<string, string | number>) => string;

const STATE_KEYS = new Map<number, string>([
  [DispatcherDisplayState.Offline, 'dispatcher_desk.state.offline'],
  [DispatcherDisplayState.Available, 'dispatcher_desk.state.available'],
  [DispatcherDisplayState.Busy, 'dispatcher_desk.state.busy'],
  [DispatcherDisplayState.Away, 'dispatcher_desk.state.away'],
  [DispatcherDisplayState.OnBreak, 'dispatcher_desk.state.on_break'],
]);

/** The label of a dispatcher's desk state. */
export const displayStateLabelKey = (state: number): string => STATE_KEYS.get(state) ?? 'dispatcher_desk.state.offline';

/** Available green, busy blue, on break amber, away and offline grey. */
export const displayStateTone = (state: number): DeskTone => {
  if (state === DispatcherDisplayState.Available) return 'success';

  if (state === DispatcherDisplayState.Busy) return 'info';

  if (state === DispatcherDisplayState.OnBreak) return 'warning';

  return 'muted';
};

const KIND_KEYS = new Map<number, string>([
  [DispatcherQueueItemKind.PendingCall, 'dispatcher_desk.kind.pending_call'],
  [DispatcherQueueItemKind.ScheduledCall, 'dispatcher_desk.kind.scheduled_call'],
  [DispatcherQueueItemKind.Text, 'dispatcher_desk.kind.text'],
  [DispatcherQueueItemKind.Voice, 'dispatcher_desk.kind.voice'],
  [DispatcherQueueItemKind.Email, 'dispatcher_desk.kind.email'],
  [DispatcherQueueItemKind.Chat, 'dispatcher_desk.kind.chat'],
  [DispatcherQueueItemKind.Other, 'dispatcher_desk.kind.other'],
]);

export const kindLabelKey = (kind: number): string => KIND_KEYS.get(kind) ?? 'dispatcher_desk.kind.other';

const KIND_ICONS = new Map<number, LucideIcon>([
  [DispatcherQueueItemKind.PendingCall, FileClock],
  [DispatcherQueueItemKind.ScheduledCall, CalendarClock],
  [DispatcherQueueItemKind.Text, MessageSquareText],
  [DispatcherQueueItemKind.Voice, PhoneIncoming],
  [DispatcherQueueItemKind.Email, Mail],
  [DispatcherQueueItemKind.Chat, MessagesSquare],
]);

export const kindIcon = (kind: number): LucideIcon => KIND_ICONS.get(kind) ?? Inbox;

/**
 * The item's preview as one line of text. A call's nature is the editor's rich text (`<p>…</p>`); Core flattens it when
 * it creates the item, and this does the same for items written before that.
 */
export const itemPreview = (item: Pick<DispatcherQueueItemData, 'Preview'>): string =>
  item.Preview
    ? richTextToPlain(item.Preview)
        .replace(/\s*\n\s*/g, ' ')
        .trim()
    : '';

/** A pending or scheduled call: the item is about a call that already exists. */
export const isCallItem = (item: Pick<DispatcherQueueItemData, 'Kind'>): boolean => item.Kind === DispatcherQueueItemKind.PendingCall || item.Kind === DispatcherQueueItemKind.ScheduledCall;

/** A text, email or chat: the item is a conversation. */
export const isConversationItem = (item: Pick<DispatcherQueueItemData, 'Kind'>): boolean =>
  item.Kind === DispatcherQueueItemKind.Text || item.Kind === DispatcherQueueItemKind.Email || item.Kind === DispatcherQueueItemKind.Chat;

export const isVoiceItem = (item: Pick<DispatcherQueueItemData, 'Kind'>): boolean => item.Kind === DispatcherQueueItemKind.Voice;

const ITEM_STATE_KEYS = new Map<number, string>([
  [DispatcherQueueItemState.Queued, 'dispatcher_desk.item_state.queued'],
  [DispatcherQueueItemState.Offered, 'dispatcher_desk.item_state.offered'],
  [DispatcherQueueItemState.Accepted, 'dispatcher_desk.item_state.accepted'],
  [DispatcherQueueItemState.Completed, 'dispatcher_desk.item_state.completed'],
  [DispatcherQueueItemState.Overflowed, 'dispatcher_desk.item_state.overflowed'],
  [DispatcherQueueItemState.Cancelled, 'dispatcher_desk.item_state.cancelled'],
]);

export const itemStateLabelKey = (state: number): string => ITEM_STATE_KEYS.get(state) ?? 'dispatcher_desk.item_state.queued';

export const itemStateTone = (state: number): DeskTone => {
  if (state === DispatcherQueueItemState.Offered) return 'warning';

  if (state === DispatcherQueueItemState.Accepted) return 'info';

  if (state === DispatcherQueueItemState.Completed) return 'success';

  if (state === DispatcherQueueItemState.Overflowed) return 'error';

  return 'muted';
};

const OUTCOME_KEYS = new Map<number, string>([
  [DispatcherQueueItemOutcome.None, 'dispatcher_desk.outcome.none'],
  [DispatcherQueueItemOutcome.Dispatched, 'dispatcher_desk.outcome.dispatched'],
  [DispatcherQueueItemOutcome.CallCreated, 'dispatcher_desk.outcome.call_created'],
  [DispatcherQueueItemOutcome.LeftPending, 'dispatcher_desk.outcome.left_pending'],
  [DispatcherQueueItemOutcome.Duplicate, 'dispatcher_desk.outcome.duplicate'],
  [DispatcherQueueItemOutcome.NoActionNeeded, 'dispatcher_desk.outcome.no_action_needed'],
  [DispatcherQueueItemOutcome.Closed, 'dispatcher_desk.outcome.closed'],
  [DispatcherQueueItemOutcome.Referred, 'dispatcher_desk.outcome.referred'],
]);

export const outcomeLabelKey = (outcome: number): string => OUTCOME_KEYS.get(outcome) ?? 'dispatcher_desk.outcome.none';

/** The outcomes a dispatcher can finish an item with: calls are dispatched, left pending or closed; conversations become a call or need nothing. */
export const completeOutcomesFor = (item: Pick<DispatcherQueueItemData, 'Kind' | 'CallId'>): DispatcherQueueItemOutcome[] =>
  isCallItem(item)
    ? [DispatcherQueueItemOutcome.Dispatched, DispatcherQueueItemOutcome.LeftPending, DispatcherQueueItemOutcome.Duplicate, DispatcherQueueItemOutcome.Closed, DispatcherQueueItemOutcome.Referred]
    : [...(item.CallId ? [DispatcherQueueItemOutcome.CallCreated] : []), DispatcherQueueItemOutcome.NoActionNeeded, DispatcherQueueItemOutcome.Duplicate, DispatcherQueueItemOutcome.Referred];

/**
 * What the complete sheet starts on. A conversation that has a call was turned into one; a pending or scheduled call is
 * left for the dispatcher to say (picking "Dispatched" for a call still pending would record something that did not happen).
 */
export const defaultCompleteOutcome = (item: Pick<DispatcherQueueItemData, 'Kind' | 'CallId'>): DispatcherQueueItemOutcome | null => (!isCallItem(item) && item.CallId ? DispatcherQueueItemOutcome.CallCreated : null);

const BREAK_TYPE_KEYS = new Map<number, string>([
  [DispatcherBreakType.Break, 'dispatcher_desk.break_type.break'],
  [DispatcherBreakType.Meal, 'dispatcher_desk.break_type.meal'],
  [DispatcherBreakType.Personal, 'dispatcher_desk.break_type.personal'],
  [DispatcherBreakType.Other, 'dispatcher_desk.break_type.other'],
]);

export const breakTypeLabelKey = (type: number): string => BREAK_TYPE_KEYS.get(type) ?? 'dispatcher_desk.break_type.break';

export const BREAK_TYPES: readonly DispatcherBreakType[] = [DispatcherBreakType.Break, DispatcherBreakType.Meal, DispatcherBreakType.Personal, DispatcherBreakType.Other];

/** The break lengths offered when none is planned (minutes). */
export const BREAK_LENGTHS: readonly number[] = [10, 15, 20, 30, 45, 60];

const EVENT_KEYS = [
  'created',
  'offered',
  'declined',
  'offer_expired',
  'accepted',
  'released',
  'transferred',
  'completed',
  'overflowed',
  'cancelled',
  'message_received',
  'message_sent',
  'voice_connecting',
  'voice_connected',
  'voice_ended',
  'escalated',
  'reopened',
  'conversation_closed',
  // Core M0326: a screened intake call waits in the queue and is not offered.
  'held_for_review',
] as const;

/** The label of an item history entry (`DispatcherQueueEventTypes` 1–19). */
export const eventTypeLabelKey = (eventType: number): string => `dispatcher_desk.event.${EVENT_KEYS[eventType - 1] ?? 'created'}`;

const DELIVERY_KEYS = new Map<number, string>([
  [DispatcherMessageDeliveryState.Received, 'dispatcher_desk.delivery.received'],
  [DispatcherMessageDeliveryState.Queued, 'dispatcher_desk.delivery.queued'],
  [DispatcherMessageDeliveryState.Sent, 'dispatcher_desk.delivery.sent'],
  [DispatcherMessageDeliveryState.Failed, 'dispatcher_desk.delivery.failed'],
]);

export const deliveryLabelKey = (state: number): string => DELIVERY_KEYS.get(state) ?? 'dispatcher_desk.delivery.received';

/** `NotADispatcher` → `not_a_dispatcher`. */
const snake = (name: string): string =>
  name
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1_$2')
    .toLowerCase();

const KNOWN_ERRORS: ReadonlySet<string> = new Set(DISPATCHER_DESK_ERRORS);

/** The message of a desk refusal (`DispatcherDeskErrors` name); an unknown name reads as a general refusal. */
export const deskErrorKey = (refusal: string | null | undefined): string => (refusal && KNOWN_ERRORS.has(refusal) ? `dispatcher_desk.errors.${snake(refusal)}` : 'dispatcher_desk.errors.unknown');

const WARNING_KEYS = new Map<string, string>([
  ['CoverageBelowMinimum', 'dispatcher_desk.warnings.coverage_below_minimum'],
  ['BreaksOverlap', 'dispatcher_desk.warnings.breaks_overlap'],
  ['OutsideDuty', 'dispatcher_desk.warnings.outside_duty'],
  ['NoCoverage', 'dispatcher_desk.warnings.no_coverage'],
  ['WorkReturnedToQueue', 'dispatcher_desk.warnings.work_returned'],
  ['StartedLate', 'dispatcher_desk.warnings.started_late'],
  ['StartedEarly', 'dispatcher_desk.warnings.started_early'],
]);

/** One line per warning a desk action noticed (coverage, overlap, early or late start). */
export const describeWarning = (warning: DispatcherDeskWarningData, t: Translate): string =>
  t(WARNING_KEYS.get(warning.Kind) ?? 'dispatcher_desk.warnings.generic', { available: warning.Available ?? 0, minimum: warning.Minimum ?? 0, minutes: Math.abs(warning.Minutes ?? 0) });

/** "4:05" or "1:02:05" for a duration in milliseconds (never negative). */
export const formatCountdown = (ms: number): string => {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (value: number) => String(value).padStart(2, '0');

  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
};

/** Whole minutes in a duration (rounded down, never negative). */
export const wholeMinutes = (ms: number): number => Math.max(0, Math.floor(ms / 60000));

/** How long an item has waited (ms) since it came in, or 0 when the server sent no time. */
export const waitingMs = (item: Pick<DispatcherQueueItemData, 'CreatedOn'>, now: number): number => {
  const created = parseUtcMs(item.CreatedOn);

  return created === null ? 0 : Math.max(0, now - created);
};

/** What a row calls an item: the call's name and number, the sender's name or address, the subject. */
export const itemTitle = (item: DispatcherQueueItemData): string => {
  if (isCallItem(item)) {
    const name = item.CallName?.trim() ?? '';

    return item.CallNumber ? `${item.CallNumber}${name ? ` · ${name}` : ''}` : name || item.Subject?.trim() || '';
  }

  return item.SourceName?.trim() || item.SourceAddress?.trim() || item.Subject?.trim() || '';
};

const DEVICE_KEYS = new Map<string, string>([
  ['phone', 'dispatcher_desk.device.phone'],
  ['tablet', 'dispatcher_desk.device.tablet'],
  ['desktop', 'dispatcher_desk.device.desktop'],
]);

/** The label of the device a dispatcher signed in on (phone, tablet, desktop). */
export const deviceLabelKey = (deviceKind: string | null | undefined): string => DEVICE_KEYS.get(deviceKind ?? '') ?? 'dispatcher_desk.device.phone';
