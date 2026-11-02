import { getActiveNavigations } from '@resgrid/api';
import type { UnitNavigationData } from '@resgrid/models';
import { create } from 'zustand';

import { unwrapList } from '../core/envelope';
import { registerDataStoreReset } from '../core/reset';
import { dataNow, getDataApiContext } from '../core/runtime';
import { createSliceRunner, emptySliceMeta, type FetchOptions, type SliceMeta, type SliceRunner } from '../core/slices';
import { isEndedNavigationState, navigationsByUnit, parseUnitNavigationUpdate, serverClockOffset, type UnitNavigationUpdate } from './navigation-eta';

/**
 * Live ETAs of units navigating in the Unit app (MapLibre plan §9.4), for Dispatch and Big Board.
 *
 * Loaded from `Routing/GetActiveNavigations` (department-wide; Core lists only units and calls the caller may see) and
 * kept live by the `unitNavigationUpdated` push, which carries ids and state only: every push refetches — bypassing
 * caches, coalesced so a department full of navigating units costs at most one request a second plus one trailing
 * re-run — and an Arrived/Ended push drops the unit at once, without waiting for the answer. The features wire the push
 * and the hub rejoin to `handleUnitNavigationUpdated` / `requestRefresh` (data never imports realtime).
 *
 * Transient operational data: not persisted (Core keeps it two minutes in Redis), reset with the session.
 */

/** A burst of pushes within this window costs one refetch. */
export const NAVIGATION_REFRESH_COALESCE_MS = 1000;

type NavigationSlice = 'navigations';

interface NavigationEtaData extends SliceMeta<NavigationSlice> {
  /** Units navigating now, keyed by UnitId (as a string, like `UnitInfoResultData.UnitId`). */
  navigations: Record<string, UnitNavigationData>;
  /** Device minus server clock (ms) measured at the last load, so countdowns run on the server's clock; 0 until known. */
  serverClockOffsetMs: number;
}

export interface NavigationEtaState extends NavigationEtaData {
  /** Loads every visible navigation; `bypassCache` (pushes, rejoins) queues a trailing re-run behind one in flight. */
  fetchActiveNavigations: (options?: FetchOptions) => Promise<void>;
  /**
   * The `unitNavigationUpdated` hub event (unit id, payload JSON). Arrived/Ended removes the unit immediately; every push
   * schedules a coalesced refetch. Returns the parsed payload, if any.
   */
  handleUnitNavigationUpdated: (id: unknown, payload?: unknown) => UnitNavigationUpdate | null;
  /** A coalesced, cache-bypassing refetch (hub joined after an outage, screen came back). */
  requestRefresh: () => void;
  /** Drops a scheduled refetch (the last screen showing ETAs went away). */
  cancelPendingRefresh: () => void;
  /** The department or app stopped showing ETAs: drop everything (no request is made). */
  clear: () => void;
}

const initialData = (): NavigationEtaData => ({ ...emptySliceMeta<NavigationSlice>(), navigations: {}, serverClockOffsetMs: 0 });

interface NavigationsAnswer {
  rows: UnitNavigationData[];
  startedAt: number;
  offsetMs: number | null;
}

let runner: SliceRunner<NavigationSlice, NavigationEtaState>;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;
/**
 * When each unit's navigation ended (device ms). A load that left before the end may still list the unit: its answer
 * must not bring the unit back. Cleared by the first load that started after the end, and by a newer push for the unit.
 */
const endedAt = new Map<string, number>();

const cancelRefreshTimer = (): void => {
  if (refreshTimer) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }
};

export const useNavigationEtaStore = create<NavigationEtaState>()((set, get) => {
  runner = createSliceRunner<NavigationSlice, NavigationEtaState>('navigation-eta', set);

  return {
    ...initialData(),

    fetchActiveNavigations: async (options) => {
      // A failed refresh keeps the last ETAs: they grey out (stale) and then expire on their own.
      await runner.run<NavigationsAnswer>(
        'navigations',
        async () => {
          const startedAt = dataNow();
          const response = await getActiveNavigations(getDataApiContext());
          const rows = unwrapList(response);
          return { rows, startedAt, offsetMs: response?.Timestamp ? serverClockOffset(response.Timestamp, dataNow()) : null };
        },
        ({ rows, startedAt, offsetMs }, state) => {
          const navigations = navigationsByUnit(rows);
          endedAt.forEach((at, unitId) => {
            if (at >= startedAt) delete navigations[unitId];
            else endedAt.delete(unitId);
          });
          return { navigations, serverClockOffsetMs: offsetMs ?? state.serverClockOffsetMs };
        },
        { trailing: options?.bypassCache === true }
      );
    },

    handleUnitNavigationUpdated: (id, payload) => {
      const update = parseUnitNavigationUpdate(payload, id);
      if (update?.unitId) {
        const unitId = update.unitId;
        if (isEndedNavigationState(update.state)) {
          endedAt.set(unitId, dataNow());
          if (get().navigations[unitId]) {
            set((state) => {
              const navigations = { ...state.navigations };
              delete navigations[unitId];
              return { navigations };
            });
          }
        } else {
          // Navigating again (a new destination after an arrival): the next answer may list it.
          endedAt.delete(unitId);
        }
      }
      // The ETA itself is never in the push: read it again (Core applies the viewer's visibility there).
      get().requestRefresh();
      return update;
    },

    requestRefresh: () => {
      if (refreshTimer) return;
      refreshTimer = setTimeout(() => {
        refreshTimer = null;
        void get().fetchActiveNavigations({ bypassCache: true });
      }, NAVIGATION_REFRESH_COALESCE_MS);
    },

    cancelPendingRefresh: cancelRefreshTimer,

    clear: () => {
      cancelRefreshTimer();
      runner.invalidate();
      endedAt.clear();
      set(initialData());
    },
  };
});

registerDataStoreReset<NavigationEtaState>('navigation-eta', useNavigationEtaStore, initialData, () => {
  cancelRefreshTimer();
  runner.invalidate();
  endedAt.clear();
});

/** The navigations heading to a call, in unit-id order. */
export const selectCallNavigations = (navigations: Readonly<Record<string, UnitNavigationData>>, callId: string | number | null | undefined): UnitNavigationData[] => {
  const wanted = callId === null || callId === undefined ? NaN : Number(callId);
  if (!Number.isFinite(wanted)) return [];
  return Object.keys(navigations)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((unitId) => navigations[unitId])
    .filter((navigation) => navigation.CallId === wanted && !isEndedNavigationState(navigation.State));
};
