import { useAppLifecycle } from '@resgrid/core';
import { badgeKeysOf, type NavBadge, type NavBadgeKey, refreshBadgeCountsSoon, useBadgeCountsStore } from '@resgrid/data';
import { onRealtimeEvent, type RealtimeEventName } from '@resgrid/realtime';
import { useEffect, useMemo, useRef } from 'react';

import { useAppInit } from '../init/app-init';
import type { NavRegistry } from '../nav/define-nav';
import { useNavItems } from '../nav/use-nav-items';
import { useActiveUnitId } from '../runtime/active-session';
import { useShell } from './shell-context';

/**
 * Pings after which a count may have moved. Department-wide ones (calls, weather) reach every member at once, so their
 * refetch waits a random moment; the chat ones concern this member's channels. The hub "joined" events catch up after
 * an outage (the hubs replay nothing).
 */
export const BADGE_DEPARTMENT_EVENTS: readonly RealtimeEventName[] = [
  'callAdded',
  'callClosed',
  'callsUpdated',
  'weatherAlertReceived',
  'weatherAlertUpdated',
  'weatherAlertExpired',
  'checklistUpdated',
  'eventingHubJoined',
];

export const BADGE_CHAT_EVENTS: readonly RealtimeEventName[] = ['chatMessageReceived', 'chatMessageDeleted', 'chatReceiptUpdated', 'chatChannelUpdated', 'chatChannelProvisioned', 'chatAccessRevoked', 'chatHubJoined'];

/** A department-wide ping refetches after this plus up to {@link BADGE_REFRESH_JITTER_MS}. */
export const BADGE_REFRESH_DELAY_MS = 1000;
export const BADGE_REFRESH_JITTER_MS = 2000;

/**
 * Inbox messages have no realtime event (their push reaches the Novu inbox, whose count change also refreshes these),
 * so the counts are re-read this often while the app is in the foreground too.
 */
export const BADGE_COUNTS_POLL_MS = 5 * 60 * 1000;

const toPositiveInt = (value: string | null): number | null => {
  const parsed = Number(value);

  return value !== null && Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

/** The badges of the entries the menu or tab bar shows now, in a stable order. */
export const navBadgeKeys = (entries: readonly { entry: { badge?: NavBadge } }[]): NavBadgeKey[] => {
  const keys: NavBadgeKey[] = [];

  for (const { entry } of entries) {
    for (const key of badgeKeysOf(entry.badge)) {
      if (!keys.includes(key)) keys.push(key);
    }
  }

  return keys.sort();
};

/**
 * Keeps the menu and tab badge counts current (no UI): asks for the counts of the entries the variant shows (the drawer
 * unmounts its rows when closed, so they cannot ask for themselves), and refetches after the realtime pings that move
 * them, on return to the foreground, on a slow poll and when the active unit changes (Unit counts the unit's chat
 * channels). One `Counts/GetBadgeCounts` request covers every count; bursts collapse into one.
 */
export function ShellBadgeCounts({ nav }: { nav: NavRegistry }): null {
  const shell = useShell();
  const items = useNavItems(nav, ['tab', 'sidebar']);
  const activeUnitId = useActiveUnitId();
  const { isActive } = useAppLifecycle();
  const unitId = shell.variant.capabilities.status.subject === 'unit' ? toPositiveInt(activeUnitId) : null;
  // After the session bootstrap: the department flags it reads decide which entries (and so which counts) show.
  const isSessionReady = useAppInit().session.everReady;
  const keys = useMemo(() => navBadgeKeys(items), [items]);
  const keyList = keys.join('|');

  useEffect(() => {
    if (isSessionReady) void useBadgeCountsStore.getState().requestBadgeCounts(keys, { activeUnitId: unitId });
    // keyList stands for keys (a new array on every nav change); a unit change is handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyList, isSessionReady]);

  // A new active unit (or none) changes the chat count. The first run is the request above.
  const lastUnitId = useRef(unitId);

  useEffect(() => {
    if (lastUnitId.current === unitId) return;
    lastUnitId.current = unitId;
    void useBadgeCountsStore.getState().fetchBadgeCounts({ activeUnitId: unitId }, { bypassCache: true });
  }, [unitId]);

  useEffect(() => {
    const department = () => refreshBadgeCountsSoon(BADGE_REFRESH_DELAY_MS + Math.random() * BADGE_REFRESH_JITTER_MS);
    const own = () => refreshBadgeCountsSoon(BADGE_REFRESH_DELAY_MS);
    const unsubscribes = [...BADGE_DEPARTMENT_EVENTS.map((event) => onRealtimeEvent(event, department)), ...BADGE_CHAT_EVENTS.map((event) => onRealtimeEvent(event, own))];

    return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
  }, []);

  // Back in the foreground: nothing was heard in the background, so read the counts again (not on mount: the request
  // above is the first read). While in the foreground, a slow poll.
  const wasActive = useRef(isActive);

  useEffect(() => {
    if (isActive && !wasActive.current) refreshBadgeCountsSoon(0);
    wasActive.current = isActive;

    if (!isActive) return undefined;
    const timer = setInterval(() => refreshBadgeCountsSoon(0), BADGE_COUNTS_POLL_MS);

    return () => clearInterval(timer);
  }, [isActive]);

  return null;
}
