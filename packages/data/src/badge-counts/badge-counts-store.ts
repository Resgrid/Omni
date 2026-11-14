import { type BadgeCountsQuery, getBadgeCounts } from '@resgrid/api';
import type { BadgeCountResultData } from '@resgrid/models';
import { useCallback, useEffect } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { assertV4Success } from '../core/envelope';
import { dataPersistOptions, registerPersistedStore } from '../core/persist';
import { registerDataStoreReset } from '../core/reset';
import { dataNow, getDataApiContext, hasDataApiContext } from '../core/runtime';
import { createSliceRunner, emptySliceMeta, type FetchOptions, type SliceMeta, type SliceRunner } from '../core/slices';

/**
 * Menu and tab badge counts from one Core request, `Counts/GetBadgeCounts`, whose providers count each with an indexed
 * COUNT or an already cached read and keep the department-wide ones in a short cache cleared on every change. The Novu
 * inbox's unread count joins them here so every badge reads one store, and the bell and the Notifications row share one
 * Novu subscription. A new count is a Core provider plus its key below.
 */

/** Counts the server computes (Core `BadgeCountKeys`), sent as `include` and answered by key. */
export const SERVER_BADGE_COUNT_KEYS = ['calls', 'messages', 'chats', 'weather', 'callsImOn', 'checkIns', 'certifications', 'deployments', 'checklists', 'shifts', 'shiftTrades', 'workOrders'] as const;

export type ServerBadgeCountKey = (typeof SERVER_BADGE_COUNT_KEYS)[number];

/**
 * Every count a badge can show: the server counts, the Novu inbox's unread count, and the calls awaiting resources
 * (Dispatch's run card requirements, counted from the awaiting-resources store; Core has no badge count for them).
 */
export type NavBadgeKey = ServerBadgeCountKey | 'notifications' | 'awaitingResources';

/** What a nav entry or tab shows: one count, or several as their sum (Shifts: today's shifts and trade requests). */
export type NavBadge = NavBadgeKey | readonly NavBadgeKey[];

type ServerCounts = Partial<Record<ServerBadgeCountKey, number>>;

const isServerKey = (key: string): key is ServerBadgeCountKey => SERVER_BADGE_COUNT_KEYS.some((known) => known === key);

export const isServerBadgeCountKey = (key: NavBadgeKey): key is ServerBadgeCountKey => key !== 'notifications' && key !== 'awaitingResources';

const NO_KEYS: readonly NavBadgeKey[] = [];

/** The keys a badge is made of. */
export const badgeKeysOf = (badge: NavBadge | null | undefined): readonly NavBadgeKey[] => (badge == null ? NO_KEYS : NO_KEYS.concat(badge));

/** A count from the server: a non-negative integer, or null (not usable). */
const countOf = (value: number | null | undefined): number | null => (value != null && Number.isFinite(value) && value >= 0 ? Math.floor(value) : null);

/** The server's answer as the store keeps it: known keys with usable counts; anything else is ignored. */
export const toBadgeCounts = (data: readonly BadgeCountResultData[] | null | undefined): ServerCounts => {
  const counts: ServerCounts = {};

  for (const item of data ?? []) {
    const count = countOf(item?.Count);

    if (item && isServerKey(item.Key) && count !== null) counts[item.Key] = count;
  }

  return counts;
};

/**
 * An answer replaces the counts it was asked for: one it leaves out is gone (no permission, module off), and one asked
 * for later keeps showing until its own first answer.
 */
const mergeCounts = (previous: ServerCounts, answer: ServerCounts, asked: readonly ServerBadgeCountKey[]): ServerCounts => {
  const merged: ServerCounts = {};

  for (const key of SERVER_BADGE_COUNT_KEYS) {
    const value = asked.includes(key) ? answer[key] : previous[key];

    if (value !== undefined) merged[key] = value;
  }

  return merged;
};

type BadgeCountsSlice = 'counts';

interface BadgeCountsData extends SliceMeta<BadgeCountsSlice> {
  /** Last server counts; a key that is absent shows no badge. */
  counts: ServerCounts;
  /** Server counts something on screen needs this session. Requests ask only for these. */
  wanted: ServerBadgeCountKey[];
  /** The server has no `Counts/GetBadgeCounts` (an older Core): no badges, and no more requests this session. */
  unsupported: boolean;
  /** The Novu inbox's unread count, set by the shell while the inbox is ready. */
  unreadNotifications: number;
  /** Calls still awaiting run card resources, set by the awaiting-resources store. */
  awaitingResources: number;
}

export interface BadgeCountsState extends BadgeCountsData {
  /**
   * Adds counts to the ones this session asks for (they stay until sign-out, so a drawer that unmounts when closed does
   * not drop its counts) and fetches when any is new.
   */
  requestBadgeCounts: (keys: readonly NavBadge[], params?: BadgeCountsParams) => Promise<void>;
  /** One request for every wanted count. Overlapping calls share it, plus one trailing run for a call made mid-flight. */
  fetchBadgeCounts: (params?: BadgeCountsParams, options?: FetchOptions) => Promise<void>;
  setUnreadNotifications: (count: number) => void;
  setAwaitingResources: (count: number) => void;
}

export interface BadgeCountsParams {
  /** Unit app: the active unit, so its chat channels count too. */
  activeUnitId?: number | null;
}

const initialData = (): BadgeCountsData => ({ ...emptySliceMeta<BadgeCountsSlice>(), counts: {}, wanted: [], unsupported: false, unreadNotifications: 0, awaitingResources: 0 });

let runner: SliceRunner<BadgeCountsSlice, BadgeCountsState>;
let lastParams: BadgeCountsParams = {};

/** When the last request left (epoch ms), for `refreshBadgeCountsIfStale`. */
let lastRequestAt = 0;

export const useBadgeCountsStore = create<BadgeCountsState>()(
  persist(
    (set, get) => {
      runner = createSliceRunner<BadgeCountsSlice, BadgeCountsState>('badge-counts', set);

      return {
        ...initialData(),

        requestBadgeCounts: async (keys, params) => {
          if (params) lastParams = params;
          const current = get().wanted;

          const added = keys
            .flatMap(badgeKeysOf)
            .filter(isServerBadgeCountKey)
            .filter((key) => !current.includes(key));

          if (added.length === 0) return;
          set({ wanted: SERVER_BADGE_COUNT_KEYS.filter((key) => current.includes(key) || added.includes(key)) });
          // Trailing: a request already out was sent without the new counts.
          await get().fetchBadgeCounts(undefined, { bypassCache: true });
        },

        fetchBadgeCounts: async (params, options) => {
          if (params) lastParams = params;

          if (get().unsupported || get().wanted.length === 0 || !hasDataApiContext()) return;

          const result = await runner.run(
            'counts',
            // Read when the request leaves, not when it was asked for: a trailing run carries counts wanted meanwhile.
            async () => {
              lastRequestAt = dataNow();
              const asked = get().wanted;
              const query: BadgeCountsQuery = { include: asked, activeUnitId: lastParams.activeUnitId || null };
              const response = await getBadgeCounts(getDataApiContext(), query);

              assertV4Success(response);

              return { asked, counts: toBadgeCounts(response.Data) };
            },
            (answer, state) => ({ counts: mergeCounts(state.counts, answer.counts, answer.asked) }),
            { trailing: options?.bypassCache === true, silent: true }
          );

          // An older Core without the endpoint: stop asking until the next sign-in, and show no stale counts. A stale answer
          // (sent before a sign-out or server switch) says nothing about the server this session talks to.
          if (!result.ok && !result.stale && result.error?.code === 'not_found') set({ unsupported: true, counts: {} });
        },

        setUnreadNotifications: (count) => {
          const next = countOf(count) ?? 0;

          if (get().unreadNotifications !== next) set({ unreadNotifications: next });
        },

        setAwaitingResources: (count) => {
          const next = countOf(count) ?? 0;

          if (get().awaitingResources !== next) set({ awaitingResources: next });
        },
      };
    },
    dataPersistOptions<BadgeCountsState, Pick<BadgeCountsData, 'counts' | 'fetchedAt'>>({
      name: 'omni-badge-counts-storage',
      partialize: (state) => ({ counts: state.counts, fetchedAt: state.fetchedAt }),
    })
  )
);

registerPersistedStore('omni-badge-counts-storage', useBadgeCountsStore);

/** A local change (a channel read, a message opened or deleted) refetches once its burst settles. */
export const BADGE_COUNTS_REFRESH_DELAY_MS = 1000;

let refreshTimer: ReturnType<typeof setTimeout> | null = null;

const cancelScheduledRefresh = (): void => {
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = null;
};

/**
 * Refetches the counts after `delayMs` of quiet: every call within the window moves the one refetch later, so a burst of
 * read marks or realtime pings costs one request. Callers that react to a department-wide ping add jitter to the delay,
 * so a whole department does not ask in the same instant.
 */
export function refreshBadgeCountsSoon(delayMs: number = BADGE_COUNTS_REFRESH_DELAY_MS): void {
  cancelScheduledRefresh();
  refreshTimer = setTimeout(
    () => {
      refreshTimer = null;
      void useBadgeCountsStore.getState().fetchBadgeCounts(undefined, { bypassCache: true });
    },
    Math.max(0, delayMs)
  );
}

/** A screen that shows counts refreshes them on focus unless a request left this recently. */
export const BADGE_COUNTS_STALE_MS = 15_000;

/** Refreshes the counts unless a request left within `maxAgeMs` (a screen's focus right after the shell asked). */
export function refreshBadgeCountsIfStale(maxAgeMs: number = BADGE_COUNTS_STALE_MS): void {
  if (dataNow() - lastRequestAt >= maxAgeMs) refreshBadgeCountsSoon(0);
}

registerDataStoreReset<BadgeCountsState>('badge-counts', useBadgeCountsStore, initialData, () => {
  runner.invalidate();
  cancelScheduledRefresh();
  lastParams = {};
  lastRequestAt = 0;
});

/** The count a badge shows, or null for none (unknown, unsupported server, or zero). Several keys show their sum. */
export const selectBadgeCount =
  (badge: NavBadge) =>
  (state: Pick<BadgeCountsData, 'counts' | 'unreadNotifications'> & Partial<Pick<BadgeCountsData, 'awaitingResources'>>): number | null => {
    let total = 0;

    for (const key of badgeKeysOf(badge)) {
      const value = key === 'notifications' ? state.unreadNotifications : key === 'awaitingResources' ? (state.awaitingResources ?? 0) : state.counts[key];

      if (value && value > 0) total += value;
    }

    return total > 0 ? total : null;
  };

/**
 * A badge's count for a mounted control (a tab, a menu row). The first use of a server count adds it to the session's
 * requests, so a tab bar that is on screen asks for its own counts without any list of them elsewhere.
 */
export function useBadgeCount(badge: NavBadge | null | undefined): number | null {
  const count = useBadgeCountsStore((state) => (badge ? selectBadgeCount(badge)(state) : null));
  const keyList = badgeKeysOf(badge).join('|');

  useEffect(() => {
    if (badge) void useBadgeCountsStore.getState().requestBadgeCounts([badge]);
    // keyList stands for badge (an array may be a new one on every render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyList]);

  return count;
}

/**
 * Counts for a tab bar: one lookup by badge, re-rendering when any count changes. Unlike `useBadgeCount` it asks for
 * nothing — the shell requests the counts of its nav entries; a bar with counts of its own requests them
 * (`requestBadgeCounts`).
 */
export function useBadgeCountLookup(): (badge: NavBadge | null | undefined) => number | null {
  const counts = useBadgeCountsStore((state) => state.counts);
  const unreadNotifications = useBadgeCountsStore((state) => state.unreadNotifications);
  const awaitingResources = useBadgeCountsStore((state) => state.awaitingResources);

  return useCallback((badge) => (badge ? selectBadgeCount(badge)({ counts, unreadNotifications, awaitingResources }) : null), [counts, unreadNotifications, awaitingResources]);
}

/**
 * A server count as a number card shows it (zero included), or null until it is known: before the first answer, on an
 * older server without the endpoint, or when the caller cannot see it. Asks for the count on first use.
 */
export function useServerCount(key: ServerBadgeCountKey): number | null {
  const count = useBadgeCountsStore((state) => state.counts[key] ?? null);

  useEffect(() => {
    void useBadgeCountsStore.getState().requestBadgeCounts([key]);
  }, [key]);

  return count;
}
