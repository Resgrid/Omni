import { pushRoutePath } from '@resgrid/core/navigation/route-paths';
import { parseUtcMs } from '@resgrid/core/utils/dates';
import { breakDueBackMs, isOnBreak, selectMyOffers, useDispatcherDeskStore } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import type { DispatcherBreakData, DispatcherQueueItemData } from '@resgrid/models';
import { isAlertSuppressed, notificationSoundService, soundForDeskEvent } from '@resgrid/notifications';
import { useToast } from '@resgrid/ui';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef } from 'react';

import { breakAlertKey, dueBreakAlerts, escalationKey, findNewEscalations, findNewInbound, findNewOffers, offerKey } from '../lib/desk-alerts';
import { breakTypeLabelKey, itemTitle, kindLabelKey } from '../lib/desk-format';
import { openDeskSheet } from '../lib/desk-ui-store';
import { dispatcherDeskRoutes } from '../routes';
import { useDispatcherDeskView, useNow } from './use-dispatcher-desk';

/** How often the break alerts are checked while signed in to the desk. */
export const BREAK_ALERT_CHECK_MS = 15000;

/** A break that ended within this long of the member's own "I'm back" was theirs, not an auto return or a supervisor. */
const OWN_RETURN_WINDOW_MS = 15000;

let ownBreakEndAt = 0;

/** The member ended their own break (so the board's change is not announced as an auto return). */
export const noteOwnBreakEnd = (): void => {
  ownBreakEndAt = Date.now();
};

const deskSoundHeld = (): boolean => isAlertSuppressed({ channel: 'sound', kind: 'deskItem' });

const playDeskSound = (event: Parameters<typeof soundForDeskEvent>[0]): void => void notificationSoundService.play(soundForDeskEvent(event));

export interface DeskAlertsState {
  /** The offer the alert shows: the member's oldest offer still open, or null. */
  offer: DispatcherQueueItemData | null;
  /** More offers waiting behind it. */
  moreOffers: number;
}

/**
 * The desk's announcements on the device (mount once, in `DispatcherDeskHost`): the offer alert (with the offer sound,
 * once per offer), a toast and the queue alert sound when waiting work escalates, a toast and the message sound when a
 * held conversation gets a new message, and the break alerts — reminder before the next planned break, "due now", and
 * "your break is over" — with their own sounds, plus a toast when the desk ended the member's break for them. Everything
 * except the break alerts stays quiet while on break (plan D6).
 */
export function useDeskAlerts(): DeskAlertsState {
  const { t } = useTranslation();
  const toast = useToast();
  const router = useRouter();
  const { desk, me, queue, isAvailable, isSignedIn } = useDispatcherDeskView();
  const now = useNow(BREAK_ALERT_CHECK_MS, isSignedIn);
  const offerTick = useNow(1000, isAvailable);
  const announcedOffers = useRef(new Set<string>());
  const announcedEscalations = useRef<Set<string> | null>(null);
  const unread = useRef<Map<string, number> | null>(null);
  const announcedBreaks = useRef(new Set<string>());
  const wasOnBreak = useRef<{ entry: DispatcherBreakData | null } | null>(null);
  const userId = me?.UserId ?? null;

  // Offers: the sound once per offer (a re-offer after it went round is a new one).
  useEffect(() => {
    if (!isAvailable) return;
    const fresh = findNewOffers(queue, userId, announcedOffers.current);

    if (fresh.length === 0) return;

    for (const item of fresh) announcedOffers.current.add(offerKey(item));

    if (!deskSoundHeld()) playDeskSound('offer');
  }, [isAvailable, queue, userId]);

  // Escalations and new messages, compared with the previous board (the first board of a session announces nothing).
  useEffect(() => {
    if (!isAvailable || !desk) return;
    const firstBoard = announcedEscalations.current === null;
    const escalated = firstBoard ? [] : findNewEscalations(queue, announcedEscalations.current ?? new Set());
    const inbound = unread.current === null ? [] : findNewInbound(queue, userId, unread.current);

    announcedEscalations.current = new Set([...(announcedEscalations.current ?? []), ...queue.filter((item) => !!item.EscalatedOn).map(escalationKey)]);
    unread.current = new Map(queue.map((item) => [item.DispatcherQueueItemId, item.UnreadCount ?? 0]));

    if (!isSignedIn) return;

    if (escalated.length > 0) {
      const first = escalated[0];
      toast.warning(t('dispatcher_desk.alerts.escalated', { count: escalated.length, kind: t(kindLabelKey(first.Kind)) }), t('dispatcher_desk.alerts.escalated_title'), {
        alert: true,
        onPress: () => pushRoutePath(router, dispatcherDeskRoutes.deskWithItem(first.DispatcherQueueItemId)),
      });

      if (!deskSoundHeld()) playDeskSound('queueAlert');
    }

    if (inbound.length > 0) {
      const first = inbound[0];
      toast.info(t('dispatcher_desk.alerts.new_message', { name: itemTitle(first) || t(kindLabelKey(first.Kind)) }), t('dispatcher_desk.alerts.new_message_title'), {
        alert: true,
        onPress: () => pushRoutePath(router, dispatcherDeskRoutes.deskWithItem(first.DispatcherQueueItemId)),
      });

      if (!deskSoundHeld()) playDeskSound('message');
    }
  }, [desk, isAvailable, isSignedIn, queue, router, t, toast, userId]);

  // Break reminders, "due now" and "break over": the one kind of alert that sounds while on break.
  useEffect(() => {
    if (!isSignedIn) return;

    for (const alert of dueBreakAlerts(desk, now, announcedBreaks.current)) {
      announcedBreaks.current.add(breakAlertKey(alert));
      const type = t(breakTypeLabelKey(alert.breakEntry.BreakType));

      if (alert.kind === 'over') {
        toast.warning(t('dispatcher_desk.alerts.break_over'), t('dispatcher_desk.alerts.break_over_title'), {
          duration: 0,
          onPress: () => {
            noteOwnBreakEnd();
            void useDispatcherDeskStore.getState().endBreak();
          },
        });
        playDeskSound('breakOver');
      } else if (alert.kind === 'due') {
        toast.info(t('dispatcher_desk.alerts.break_due', { type }), t('dispatcher_desk.alerts.break_title'), { onPress: () => openDeskSheet('takeBreak', { plannedBreakId: alert.breakEntry.DispatcherBreakId }) });
        playDeskSound('breakReminder');
      } else {
        toast.info(t('dispatcher_desk.alerts.break_reminder', { type, minutes: alert.minutes }), t('dispatcher_desk.alerts.break_title'), {
          onPress: () => openDeskSheet('takeBreak', { plannedBreakId: alert.breakEntry.DispatcherBreakId }),
        });
        playDeskSound('breakReminder');
      }
    }
  }, [desk, isSignedIn, now, t, toast]);

  // The desk ended the member's break for them (auto return, a supervisor): say so.
  useEffect(() => {
    if (!isAvailable || !me) return;
    const previous = wasOnBreak.current;
    const onBreak = isOnBreak(me);

    wasOnBreak.current = onBreak ? { entry: me.ActiveBreak } : null;

    if (!previous || onBreak || !me.IsSignedIn || Date.now() - ownBreakEndAt < OWN_RETURN_WINDOW_MS) return;
    const dueBack = breakDueBackMs(previous.entry);
    const autoAfter = desk?.Config?.AutoReturnAfterMinutes ?? 0;
    const auto = autoAfter > 0 && dueBack !== null && Date.now() >= dueBack + autoAfter * 60000 - 60000;

    toast.info(t(auto ? 'dispatcher_desk.alerts.auto_returned' : 'dispatcher_desk.alerts.break_ended_for_you'), t('dispatcher_desk.alerts.back_title'));
  }, [desk?.Config?.AutoReturnAfterMinutes, isAvailable, me, t, toast]);

  return useMemo(() => {
    const offers = isAvailable ? selectMyOffers(queue, userId).filter((item) => (parseUtcMs(item.OfferExpiresOn) ?? Number.POSITIVE_INFINITY) > offerTick - 1000) : [];

    return { offer: offers[0] ?? null, moreOffers: Math.max(0, offers.length - 1) };
  }, [isAvailable, offerTick, queue, userId]);
}
