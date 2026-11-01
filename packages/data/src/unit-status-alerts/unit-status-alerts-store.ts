import { acknowledgeUnitStatusAlert, clearUnitStatusAlert, getActiveUnitStatusAlertAcknowledgements, isApiError } from '@resgrid/api';
import type { AcknowledgeUnitStatusAlertInput, UnitStatusAlertAcknowledgementError, UnitStatusAlertAcknowledgementResultData } from '@resgrid/models';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { unwrapList } from '../core/envelope';
import { dataPersistOptions, registerPersistedStore } from '../core/persist';
import { registerDataStoreReset } from '../core/reset';
import { getDataApiContext, getDataLogger } from '../core/runtime';
import { createSliceRunner, emptySliceMeta, type FetchOptions, type SliceMeta, type SliceRunner } from '../core/slices';

/**
 * Unit status timer acknowledgements (BigBoard): a dispatcher marks a unit that sat in a status past its timer as seen,
 * or mutes it, optionally with a reason; every board in the department sees the result (`unitStatusAlertUpdated`).
 * Writes go straight to the server (online only — BigBoard queues nothing); a refusal comes back as a typed outcome so
 * the board can explain it (status changed, no longer overdue, someone else got there first, reason required).
 */

type AlertsSlice = 'acknowledgements';

interface UnitStatusAlertsData extends SliceMeta<AlertsSlice> {
  /** The acknowledgement covering each unit's current status episode, keyed by UnitId. */
  acknowledgements: Record<string, UnitStatusAlertAcknowledgementResultData>;
}

export type UnitAlertAcknowledgementOutcome = { ok: true } | { ok: false; error: UnitStatusAlertAcknowledgementError | 'offline' | 'unknown' };

export interface UnitStatusAlertsState extends UnitStatusAlertsData {
  fetchAcknowledgements: (options?: FetchOptions) => Promise<void>;
  acknowledge: (input: AcknowledgeUnitStatusAlertInput) => Promise<UnitAlertAcknowledgementOutcome>;
  clear: (acknowledgement: UnitStatusAlertAcknowledgementResultData) => Promise<UnitAlertAcknowledgementOutcome>;
}

const initialData = (): UnitStatusAlertsData => ({ ...emptySliceMeta<AlertsSlice>(), acknowledgements: {} });

const byUnit = (rows: UnitStatusAlertAcknowledgementResultData[]): Record<string, UnitStatusAlertAcknowledgementResultData> =>
  rows.reduce<Record<string, UnitStatusAlertAcknowledgementResultData>>((map, row) => {
    if (row?.UnitId) map[String(row.UnitId)] = row;
    return map;
  }, {});

interface RefusalBody {
  Error?: UnitStatusAlertAcknowledgementError | null;
  Data?: UnitStatusAlertAcknowledgementResultData | null;
}

const refusalOf = (value: unknown): RefusalBody | null => (value && typeof value === 'object' && 'Error' in value && typeof (value as RefusalBody).Error === 'string' ? (value as RefusalBody) : null);

let runner: SliceRunner<AlertsSlice, UnitStatusAlertsState>;

export const useUnitStatusAlertsStore = create<UnitStatusAlertsState>()(
  persist(
    (set, get) => {
      runner = createSliceRunner<AlertsSlice, UnitStatusAlertsState>('unit-status-alerts', set);
      // Bumped by every local write: a list fetched before one would bring back an alert the dispatcher just handled.
      let localWrites = 0;

      const upsert = (row: UnitStatusAlertAcknowledgementResultData): void => {
        localWrites += 1;
        set((state) => ({ acknowledgements: { ...state.acknowledgements, [String(row.UnitId)]: row } }));
      };

      const remove = (unitId: string): void => {
        localWrites += 1;
        set((state) => {
          const next = { ...state.acknowledgements };
          delete next[unitId];
          return { acknowledgements: next };
        });
      };

      /** Applies a server refusal and turns it into an outcome; anything else is offline/unknown (never logged with a body). */
      const outcomeOf = (error: unknown, unitId: string): UnitAlertAcknowledgementOutcome => {
        const refusal = refusalOf(isApiError(error) ? error.data : error);
        if (!refusal?.Error) {
          const offline = isApiError(error) && (error.kind === 'network' || error.kind === 'timeout');
          getDataLogger().warn({ message: 'Unit status alert acknowledgement failed', context: { kind: isApiError(error) ? error.kind : 'unknown', status: isApiError(error) ? error.status : undefined } });
          return { ok: false, error: offline ? 'offline' : 'unknown' };
        }
        if (refusal.Error === 'unit_alert_conflict' && refusal.Data) upsert(refusal.Data);
        else if (refusal.Error === 'unit_alert_status_changed' || refusal.Error === 'unit_alert_not_overdue') remove(unitId);
        return { ok: false, error: refusal.Error };
      };

      return {
        ...initialData(),

        fetchAcknowledgements: async (options) => {
          await runner.run(
            'acknowledgements',
            async () => {
              // A write that lands while the request is out is not in its answer: ask again until none did.
              for (let attempt = 0; attempt < 3; attempt++) {
                const writesAtStart = localWrites;
                const rows = unwrapList(await getActiveUnitStatusAlertAcknowledgements(getDataApiContext()));
                if (writesAtStart === localWrites) return rows;
              }
              return null;
            },
            (rows, state) => (rows ? { acknowledgements: byUnit(rows) } : { acknowledgements: state.acknowledgements }),
            { trailing: options?.bypassCache === true }
          );
        },

        acknowledge: async (input) => {
          const unitId = String(input.UnitId);
          try {
            const result = await acknowledgeUnitStatusAlert(getDataApiContext(), input);
            const refusal = refusalOf(result);
            if (refusal?.Error) return outcomeOf(refusal, unitId);
            if (result?.Data) upsert(result.Data);
            return { ok: true };
          } catch (error) {
            return outcomeOf(error, unitId);
          }
        },

        clear: async (acknowledgement) => {
          const unitId = String(acknowledgement.UnitId);
          try {
            const result = await clearUnitStatusAlert(getDataApiContext(), { id: acknowledgement.UnitStatusAlertAcknowledgementId });
            const refusal = refusalOf(result);
            if (refusal?.Error && refusal.Error !== 'unit_alert_not_found') return outcomeOf(refusal, unitId);
            remove(unitId);
            return { ok: true };
          } catch (error) {
            // Already gone (cleared elsewhere, unit removed) is the state that was asked for.
            if (refusalOf(isApiError(error) ? error.data : error)?.Error === 'unit_alert_not_found') {
              remove(unitId);
              return { ok: true };
            }
            return outcomeOf(error, unitId);
          }
        },
      };
    },
    dataPersistOptions<UnitStatusAlertsState, Pick<UnitStatusAlertsData, 'acknowledgements' | 'fetchedAt'>>({
      name: 'omni-unit-status-alerts-storage',
      partialize: (state) => ({ acknowledgements: state.acknowledgements, fetchedAt: state.fetchedAt }),
    })
  )
);

registerPersistedStore('omni-unit-status-alerts-storage', useUnitStatusAlertsStore);
registerDataStoreReset<UnitStatusAlertsState>('unit-status-alerts', useUnitStatusAlertsStore, initialData, () => runner.invalidate());
