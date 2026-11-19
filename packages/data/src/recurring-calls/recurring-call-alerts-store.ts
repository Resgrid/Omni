import { acknowledgeRecurringCallAlert, dismissRecurringCallAlert, getRecurringCallAlerts } from '@resgrid/api';
import type { RecurringCallActionResult, RecurringCallAlertResultData } from '@resgrid/models';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { useBadgeCountsStore } from '../badge-counts/badge-counts-store';
import { assertV4Success, unwrapList } from '../core/envelope';
import { type DataError, toDataError } from '../core/errors';
import { createKeyedFlight } from '../core/keyed-flight';
import { dataPersistOptions, registerPersistedStore } from '../core/persist';
import { registerDataStoreReset } from '../core/reset';
import { dataNow, getDataApiContext, getDataLogger } from '../core/runtime';
import { createSliceRunner, emptySliceMeta, type FetchOptions, type SliceMeta, type SliceRunner } from '../core/slices';

/**
 * Recurring call alerts (Dispatch, Core M0320): an occurrence whose call could not be created or was missed, one held as
 * pending because nobody could be sent, one sent without some of its chosen resources, or a dispatcher-mode occurrence
 * that is due. The open list drives the menu badge, the banner and the alerts screen. It is read again on every
 * `recurringCallAlertsUpdated` push (an id-only ping), after a hub rejoin and when the app returns to the foreground;
 * alerts that were not in the previous answer are marked new so the screens can highlight them until seen.
 *
 * Inert until the features call in (only with `capabilities.calls.recurringCalls`). Acknowledging and dismissing are online
 * writes, never queued. The list persists for offline reads; sign-out clears it.
 */

type AlertsSlice = 'alerts';

/** What an alert action did: `message` is the server's plain-English outcome when it sent one. */
export interface RecurringCallAlertOutcome {
  ok: boolean;
  message: string | null;
  error: DataError | null;
}

interface RecurringCallAlertsData extends SliceMeta<AlertsSlice> {
  /** Open alerts: not yet acknowledged first, then by occurrence. */
  alerts: RecurringCallAlertResultData[];
  /** Alerts raised since the dispatcher last looked, highlighted until seen. */
  newAlertIds: string[];
  /** When the last batch of new alerts arrived (epoch ms); 0 when none this session. */
  lastNewAt: number;
  /** The actions in flight (`alert:<id>`), so their buttons can spin. One per alert. */
  busyKeys: string[];
  /** The server has no recurring calls (an older Core): no requests until the next sign-in. */
  unsupported: boolean;
}

export interface RecurringCallAlertsState extends RecurringCallAlertsData {
  fetchAlerts: (options?: FetchOptions) => Promise<void>;
  /** Acknowledging or dismissing an alert while an action on it runs joins the one in flight. */
  acknowledgeAlert: (alertId: string) => Promise<RecurringCallAlertOutcome>;
  dismissAlert: (alertId: string, note?: string) => Promise<RecurringCallAlertOutcome>;
  /** The dispatcher has seen these alerts (all of them when no ids are given): they stop being highlighted. */
  markAlertsSeen: (alertIds?: readonly string[]) => void;
  /** The department or the variant has no recurring calls: drop everything (no request is made). */
  disable: () => void;
}

/** The busy key of an alert action. */
export const recurringAlertKey = (alertId: string): string => `alert:${alertId}`;

/** Not yet acknowledged first, then the earliest occurrence; the server's order breaks ties. */
export const sortRecurringCallAlerts = (alerts: readonly RecurringCallAlertResultData[]): RecurringCallAlertResultData[] =>
  alerts
    .map((alert, index) => ({ alert, index }))
    .sort((a, b) => Number(!!a.alert.AcknowledgedOn) - Number(!!b.alert.AcknowledgedOn) || (a.alert.OccurrenceOn ?? '').localeCompare(b.alert.OccurrenceOn ?? '') || a.index - b.index)
    .map((entry) => entry.alert);

/**
 * The alerts of `next` that `previous` did not have. The first answer of a session raises nothing (what was open before
 * the app started is not news).
 */
export const findNewAlertIds = (previous: readonly RecurringCallAlertResultData[] | null, next: readonly RecurringCallAlertResultData[]): string[] => {
  if (previous === null) return [];
  const known = new Set(previous.map((alert) => alert.AlertId));

  return next.flatMap((alert) => (known.has(alert.AlertId) ? [] : [alert.AlertId]));
};

const initialData = (): RecurringCallAlertsData => ({ ...emptySliceMeta<AlertsSlice>(), alerts: [], newAlertIds: [], lastNewAt: 0, busyKeys: [], unsupported: false });

type PersistedAlerts = Pick<RecurringCallAlertsData, 'alerts' | 'fetchedAt'>;

let runner: SliceRunner<AlertsSlice, RecurringCallAlertsState>;

/** Whether this session has had an answer yet (the persisted list may be from an earlier one). */
let loadedThisSession = false;

/** One action per alert: pressing again, or acknowledging while a dismiss runs, joins the one in flight. */
const writes = createKeyedFlight();

export const useRecurringCallAlertsStore = create<RecurringCallAlertsState>()(
  persist(
    (set, get) => {
      runner = createSliceRunner<AlertsSlice, RecurringCallAlertsState>('recurring-call-alerts', set);

      const runAlertWrite = (alertId: string, operation: 'acknowledge' | 'dismiss', write: () => Promise<RecurringCallActionResult>): Promise<RecurringCallAlertOutcome> => {
        const key = recurringAlertKey(alertId);

        return writes.run(key, async () => {
          // Disabling the alerts or signing out ends the session the action started in: a late answer then clears no busy
          // state and starts no read that could refill the cleared list.
          const generation = runner.generation();
          set((state) => ({ busyKeys: [...state.busyKeys.filter((entry) => entry !== key), key] }));
          let outcome: RecurringCallAlertOutcome;

          try {
            const result = assertV4Success(await write());
            outcome = { ok: result?.Success === true, message: result?.Message ?? null, error: null };
          } catch (error) {
            const dataError = toDataError(error);
            getDataLogger().warn({ message: 'A recurring call alert action failed', context: { operation, alertId, code: dataError.code, status: dataError.status } });
            outcome = { ok: false, message: null, error: dataError };
          }

          if (generation === runner.generation()) {
            // Only this alert's key: an action still running on another alert keeps its spinner.
            set((state) => ({ busyKeys: state.busyKeys.filter((entry) => entry !== key) }));
            void get().fetchAlerts({ bypassCache: true });
          }

          return outcome;
        });
      };

      return {
        ...initialData(),

        fetchAlerts: async (options) => {
          if (get().unsupported) return;

          // A failed refresh keeps the last list: an open alert must not vanish from the banner.
          const result = await runner.run(
            'alerts',
            async () => sortRecurringCallAlerts(unwrapList(await getRecurringCallAlerts(getDataApiContext())).filter((alert) => alert.IsOpen !== false)),
            (alerts, state) => {
              const added = findNewAlertIds(loadedThisSession ? state.alerts : null, alerts);
              const open = new Set(alerts.map((alert) => alert.AlertId));
              loadedThisSession = true;

              return {
                alerts,
                newAlertIds: [...added, ...state.newAlertIds.filter((id) => open.has(id) && !added.includes(id))],
                lastNewAt: added.length > 0 ? dataNow() : state.lastNewAt,
              };
            },
            { trailing: options?.bypassCache === true }
          );

          // An older Core without the controller: stop asking until the next sign-in, and show no stale alerts.
          if (!result.ok && !result.stale && result.error?.code === 'not_found') set({ unsupported: true, alerts: [], newAlertIds: [] });
        },

        acknowledgeAlert: (alertId) => runAlertWrite(alertId, 'acknowledge', () => acknowledgeRecurringCallAlert(getDataApiContext(), { AlertId: alertId })),

        dismissAlert: (alertId, note) => runAlertWrite(alertId, 'dismiss', () => dismissRecurringCallAlert(getDataApiContext(), { AlertId: alertId, Note: note?.trim() || null })),

        markAlertsSeen: (alertIds) => {
          const seen = alertIds ? new Set(alertIds) : null;
          const remaining = seen ? get().newAlertIds.filter((id) => !seen.has(id)) : [];

          if (remaining.length !== get().newAlertIds.length) set({ newAlertIds: remaining });
        },

        disable: () => {
          runner.invalidate();
          writes.clear();
          loadedThisSession = false;
          set(initialData());
        },
      };
    },
    dataPersistOptions<RecurringCallAlertsState, PersistedAlerts>({
      name: 'omni-recurring-call-alerts-storage',
      partialize: (state) => ({ alerts: state.alerts, fetchedAt: state.fetchedAt }),
    })
  )
);

registerPersistedStore('omni-recurring-call-alerts-storage', useRecurringCallAlertsStore);

registerDataStoreReset<RecurringCallAlertsState>('recurring-call-alerts', useRecurringCallAlertsStore, initialData, () => {
  runner.invalidate();
  writes.clear();
  loadedThisSession = false;
});

// The menu's Recurring Call Alerts badge counts the open alerts this store holds.
useRecurringCallAlertsStore.subscribe((state, previous) => {
  if (state.alerts !== previous.alerts) useBadgeCountsStore.getState().setRecurringCallAlerts(state.alerts.length);
});

// Alerts restored before the subscription existed count too.
useBadgeCountsStore.getState().setRecurringCallAlerts(useRecurringCallAlertsStore.getState().alerts.length);
