import { parseUtcMs } from '@resgrid/api';
import {
  type DispatcherBreakData,
  DispatcherBreakState,
  type DispatcherDeskMemberData,
  type DispatcherDeskResultData,
  DispatcherDisplayState,
  type DispatcherQueueItemData,
  DispatcherQueueItemState,
} from '@resgrid/models';

/**
 * Pure reads of the dispatcher desk board (dispatchers-on-duty plan D4/D5): which work is the member's (offered to them,
 * held by them), which waits in the shared queue for anyone to take, and the member's break.
 */

const OPEN_STATES: readonly number[] = [DispatcherQueueItemState.Queued, DispatcherQueueItemState.Offered, DispatcherQueueItemState.Accepted];

/** Queued, offered or accepted: still someone's to do. */
export const isOpenDeskItem = (item: Pick<DispatcherQueueItemData, 'State'>): boolean => OPEN_STATES.includes(item.State);

/** Offered to this dispatcher and waiting for their answer. */
export const isOfferedTo = (item: Pick<DispatcherQueueItemData, 'State' | 'AssignedUserId'>, userId: string | null | undefined): boolean =>
  !!userId && item.State === DispatcherQueueItemState.Offered && item.AssignedUserId === userId;

/** Taken by this dispatcher: they are working it. */
export const isHeldBy = (item: Pick<DispatcherQueueItemData, 'State' | 'AssignedUserId'>, userId: string | null | undefined): boolean =>
  !!userId && item.State === DispatcherQueueItemState.Accepted && item.AssignedUserId === userId;

/**
 * Whether the server's counts for the member (a heartbeat's answer) disagree with the board: an offer or held item the
 * board never heard about, or one it still shows after it moved on. A lost realtime event (a hub reconnect, the eventing
 * service down) otherwise hid the offer until it expired and counted as a miss.
 */
export const isDeskOutOfStep = (queue: readonly DispatcherQueueItemData[], me: Pick<DispatcherDeskMemberData, 'UserId' | 'OfferedItemCount' | 'ActiveItemCount'>): boolean =>
  queue.filter((item) => isOfferedTo(item, me.UserId)).length !== me.OfferedItemCount || queue.filter((item) => isHeldBy(item, me.UserId)).length !== me.ActiveItemCount;

/**
 * When the member's first offer on the board runs out (epoch ms), or null with none. The board is read again then: an
 * offer the server replaced with another (same counts, so a heartbeat cannot tell) shows before the new one runs out.
 */
export const firstOfferExpiryMs = (queue: readonly DispatcherQueueItemData[], userId: string | null | undefined): number | null =>
  queue.reduce<number | null>((first, item) => {
    const expires = isOfferedTo(item, userId) ? parseUtcMs(item.OfferExpiresOn) : null;

    return expires !== null && (first === null || expires < first) ? expires : first;
  }, null);

/** Waiting in the shared queue: any on-duty dispatcher can take it. */
export const isWaitingInQueue = (item: Pick<DispatcherQueueItemData, 'State'>): boolean => item.State === DispatcherQueueItemState.Queued;

const createdMs = (item: DispatcherQueueItemData): number => parseUtcMs(item.CreatedOn) ?? 0;

/** Offers first, then the most urgent (server priority), then the longest waiting. */
export const sortDeskQueue = (items: readonly DispatcherQueueItemData[]): DispatcherQueueItemData[] =>
  [...items].sort((a, b) => Number(b.State === DispatcherQueueItemState.Offered) - Number(a.State === DispatcherQueueItemState.Offered) || (b.Priority ?? 0) - (a.Priority ?? 0) || createdMs(a) - createdMs(b));

/** The member's work: offered to them, then held by them. */
export const selectMyWork = (queue: readonly DispatcherQueueItemData[], userId: string | null | undefined): DispatcherQueueItemData[] =>
  sortDeskQueue(queue.filter((item) => isOfferedTo(item, userId) || isHeldBy(item, userId)));

/** The offers waiting for the member's answer. */
export const selectMyOffers = (queue: readonly DispatcherQueueItemData[], userId: string | null | undefined): DispatcherQueueItemData[] => sortDeskQueue(queue.filter((item) => isOfferedTo(item, userId)));

/** Work waiting in the shared queue. */
export const selectWaitingWork = (queue: readonly DispatcherQueueItemData[]): DispatcherQueueItemData[] => sortDeskQueue(queue.filter(isWaitingInQueue));

/** The desk badge: offers waiting for the member plus work waiting in the shared queue (0 when the desk is off or the member is no dispatcher). */
export const deskQueueCount = (desk: Pick<DispatcherDeskResultData, 'Enabled' | 'IsDispatcher' | 'Queue' | 'Me'> | null | undefined): number => {
  if (!desk?.Enabled || !desk.IsDispatcher) return 0;
  const userId = desk.Me?.UserId ?? null;

  return (desk.Queue ?? []).filter((item) => isOfferedTo(item, userId) || isWaitingInQueue(item)).length;
};

/** On a break now. */
export const isOnBreak = (member: Pick<DispatcherDeskMemberData, 'DisplayState'> | null | undefined): boolean => member?.DisplayState === DispatcherDisplayState.OnBreak;

/** The member's running break: their `ActiveBreak`, else an active one among their breaks. */
export const activeBreakOf = (member: Pick<DispatcherDeskMemberData, 'ActiveBreak'> | null | undefined, breaks: readonly DispatcherBreakData[] = []): DispatcherBreakData | null =>
  member?.ActiveBreak ?? breaks.find((entry) => entry.State === DispatcherBreakState.Active) ?? null;

/** The member's next planned break: their `NextBreak`, else the earliest scheduled one. */
export const nextBreakOf = (member: Pick<DispatcherDeskMemberData, 'NextBreak'> | null | undefined, breaks: readonly DispatcherBreakData[] = []): DispatcherBreakData | null => {
  if (member?.NextBreak) return member.NextBreak;

  const planned = breaks.filter((entry) => entry.State === DispatcherBreakState.Scheduled);

  return planned.sort((a, b) => (parseUtcMs(a.ScheduledStartOn) ?? 0) - (parseUtcMs(b.ScheduledStartOn) ?? 0))[0] ?? null;
};

/** When the member is due back from a running break (epoch ms): its expected return, else start + length. */
export const breakDueBackMs = (entry: Pick<DispatcherBreakData, 'ExpectedReturnOn' | 'StartedOn' | 'DurationMinutes'> | null | undefined): number | null => {
  if (!entry) return null;
  const expected = parseUtcMs(entry.ExpectedReturnOn);

  if (expected !== null) return expected;

  const started = parseUtcMs(entry.StartedOn);

  return started === null ? null : started + Math.max(0, entry.DurationMinutes) * 60000;
};

/** When a planned break would end if it started as planned (epoch ms). */
export const plannedBreakEndMs = (entry: Pick<DispatcherBreakData, 'ScheduledEndOn' | 'ScheduledStartOn' | 'DurationMinutes'>): number | null => {
  const end = parseUtcMs(entry.ScheduledEndOn);

  if (end !== null) return end;

  const start = parseUtcMs(entry.ScheduledStartOn);

  return start === null ? null : start + Math.max(0, entry.DurationMinutes) * 60000;
};
