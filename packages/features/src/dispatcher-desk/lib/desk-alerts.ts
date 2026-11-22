import { parseUtcMs } from '@resgrid/core/utils/dates';
import { breakDueBackMs, isHeldBy, isOfferedTo, isOnBreak, isWaitingInQueue, nextBreakOf } from '@resgrid/data';
import type { DispatcherBreakData, DispatcherDeskResultData, DispatcherQueueItemData } from '@resgrid/models';
import type { AlertDescriptor } from '@resgrid/notifications';

/**
 * What the desk announces on the device (dispatchers-on-duty plan D5, D6, D11), worked out from one board to the next:
 * a new offer to the member, waiting work that escalated, a new inbound message in a conversation the member holds,
 * and the member's break reminders. Plus the quiet-on-break rule every other alert is held to.
 */

/** Offers to the member the device has not announced yet. */
export const findNewOffers = (queue: readonly DispatcherQueueItemData[], userId: string | null | undefined, announced: ReadonlySet<string>): DispatcherQueueItemData[] =>
  queue.filter((item) => isOfferedTo(item, userId) && !announced.has(offerKey(item)));

/** An offer is announced once: a second offer of the same item (after it went round) is a new one. */
export const offerKey = (item: Pick<DispatcherQueueItemData, 'DispatcherQueueItemId' | 'OfferedOn' | 'OfferAttempts'>): string => `${item.DispatcherQueueItemId}|${item.OfferedOn ?? ''}|${item.OfferAttempts ?? 0}`;

/** Waiting work that escalated (waited too long) since the previous board: everyone on duty hears it. */
export const findNewEscalations = (queue: readonly DispatcherQueueItemData[], announced: ReadonlySet<string>): DispatcherQueueItemData[] =>
  queue.filter((item) => isWaitingInQueue(item) && !!item.EscalatedOn && !announced.has(escalationKey(item)));

export const escalationKey = (item: Pick<DispatcherQueueItemData, 'DispatcherQueueItemId' | 'EscalatedOn'>): string => `${item.DispatcherQueueItemId}|${item.EscalatedOn ?? ''}`;

/** Conversations the member holds whose unread count went up since the previous board. */
export const findNewInbound = (queue: readonly DispatcherQueueItemData[], userId: string | null | undefined, previousUnread: ReadonlyMap<string, number>): DispatcherQueueItemData[] =>
  queue.filter((item) => isHeldBy(item, userId) && item.UnreadCount > (previousUnread.get(item.DispatcherQueueItemId) ?? item.UnreadCount));

export type BreakAlertKind = 'reminder' | 'due' | 'over';

export interface BreakAlert {
  kind: BreakAlertKind;
  breakEntry: DispatcherBreakData;
  /** Reminder: minutes until the planned start. */
  minutes: number;
}

/** The announcement key of a break alert (each fires once per break). */
export const breakAlertKey = (alert: Pick<BreakAlert, 'kind' | 'breakEntry'>): string => `${alert.kind}|${alert.breakEntry.DispatcherBreakId}`;

/**
 * The break alerts due now: "break in N minutes" once the next planned break is within the reminder window, "break due
 * now" at its planned start, and "your break is over" once a running break's length has run out. Only one per break and
 * kind (`announced`); a reminder never fires after the break is due.
 */
export const dueBreakAlerts = (desk: Pick<DispatcherDeskResultData, 'Me' | 'MyBreaks' | 'Config'> | null, now: number, announced: ReadonlySet<string>): BreakAlert[] => {
  const me = desk?.Me;

  if (!me?.IsSignedIn) return [];
  const alerts: BreakAlert[] = [];

  if (isOnBreak(me) && me.ActiveBreak) {
    const dueBack = breakDueBackMs(me.ActiveBreak);

    if (dueBack !== null && now >= dueBack) alerts.push({ kind: 'over', breakEntry: me.ActiveBreak, minutes: 0 });
  } else {
    const next = nextBreakOf(me, desk?.MyBreaks ?? []);
    const start = next ? parseUtcMs(next.ScheduledStartOn) : null;
    const reminderMinutes = Math.max(0, desk?.Config?.BreakReminderMinutes ?? 5);

    if (next && start !== null) {
      if (now >= start) alerts.push({ kind: 'due', breakEntry: next, minutes: 0 });
      else if (reminderMinutes > 0 && now >= start - reminderMinutes * 60000) alerts.push({ kind: 'reminder', breakEntry: next, minutes: Math.max(1, Math.ceil((start - now) / 60000)) });
    }
  }

  return alerts.filter((alert) => !announced.has(breakAlertKey(alert)));
};

/** A break push (`DB:{breakId}`) or the desk's own break alert: the one thing that still sounds while on break. */
export const isBreakAlert = (alert: AlertDescriptor): boolean => alert.kind === 'deskBreak' || (alert.eventCode ?? '').trim().toUpperCase().startsWith('DB:');

/**
 * Plan D6: while the member is on break and the department keeps breaks quiet (`SuppressAlertsOnBreak`, on unless the
 * config says otherwise), every alert is held back except break pushes and alerts.
 */
export const shouldSuppressDeskAlert = (desk: Pick<DispatcherDeskResultData, 'Enabled' | 'Me' | 'Config'> | null | undefined, alert: AlertDescriptor): boolean =>
  !!desk?.Enabled && isOnBreak(desk.Me) && desk.Config?.SuppressAlertsOnBreak !== false && !isBreakAlert(alert);
