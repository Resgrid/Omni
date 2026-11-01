import { dismissRequirement, dispatchUnitToAwaitingCall, getAwaitingCalls, getAwaitingResourceResponseCodes, getCallRequirements } from '@resgrid/api';
import {
  type AwaitingResourcesCallData,
  type CallOutstandingRequirementData,
  type DispatchResponseCodeData,
  type OutstandingRequirementsAlert,
  type OutstandingRequirementsAlertCall,
  OutstandingRequirementsAlertKind,
} from '@resgrid/models';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { assertV4Success, unwrapItem, unwrapList } from '../core/envelope';
import { type DataError, toDataError } from '../core/errors';
import { dataPersistOptions, registerPersistedStore } from '../core/persist';
import { registerDataStoreReset } from '../core/reset';
import { dataNow, getDataApiContext, getDataLogger } from '../core/runtime';
import { createSliceRunner, emptySliceMeta, type FetchOptions, type SliceMeta, type SliceRunner } from '../core/slices';
import { activeResponseCodes, parseOutstandingRequirementsAlert } from './awaiting-resources-alerts';

/**
 * Calls awaiting resources (conditional run cards, Dispatch baseline `stores/awaiting-resources`) and the department's
 * response code catalog.
 *
 * A call is "awaiting resources" when a required resource marked "keep outstanding" could not be sent as configured (a
 * substitute went instead, or nothing could be sent). It stays awaiting until a matching resource is dispatched, a
 * person dismisses the requirement, or the call closes — never on a timer. The list drives the persistent banner, the
 * menu badge and the Awaiting Resources screen; it is refreshed on every `outstandingRequirementsUpdated` push.
 *
 * Everything here is inert unless the features call in, which they do only with Dispatch.RunCards and
 * Dispatch.RunCardConditions on (data never imports auth). Dispatching to a waiting call and dismissing are online
 * writes: neither is in Dispatch's offline write scope (plan §8.5). The list and catalog persist for offline reads.
 */

/** Newest unit-available alerts kept on screen at once; older ones drop off. */
export const MAX_UNIT_ALERTS = 5;

/**
 * A unit that became available and matches calls awaiting resources. Stays until the dispatcher dispatches the unit,
 * closes it, or every call it names stops waiting.
 */
export interface AwaitingUnitAlert {
  /** One alert per unit: a newer push for the same unit replaces it. */
  id: string;
  unitId: number;
  unitName: string | null;
  unitTypeName: string | null;
  message: string | null;
  calls: OutstandingRequirementsAlertCall[];
  receivedAt: number;
}

/** What an awaiting-resources action did: `message` is the server's plain-English outcome for the dispatcher, when sent. */
export interface AwaitingActionOutcome {
  ok: boolean;
  message: string | null;
  error: DataError | null;
}

type AwaitingSlice = 'calls' | 'requirements';

interface AwaitingResourcesData extends SliceMeta<AwaitingSlice> {
  /** Active calls awaiting a required resource, highest priority then oldest. */
  calls: AwaitingResourcesCallData[];
  /** Unit-available alerts waiting on the dispatcher, newest first. */
  unitAlerts: AwaitingUnitAlert[];
  /** When the last push arrived (epoch ms), so a call's own view can refetch on it. */
  lastPushAt: number;
  /** The action in flight (`dispatch:<callId>:<unitId>` or `dismiss:<requirementId>`), so its button can spin. */
  busyKey: string | null;
  /** Pickable codes (retired left out). Empty means the department uses none: no code UI anywhere. */
  responseCodes: DispatchResponseCodeData[];
  /** Every code including retired ones, for showing the code a call was sent with. */
  allResponseCodes: DispatchResponseCodeData[];
  showCodesToCrews: boolean;
  responseCodesLoaded: boolean;
  /** Open outstanding requirements per call (call detail section). */
  requirementsByCall: Record<string, CallOutstandingRequirementData[]>;
}

export interface AwaitingResourcesState extends AwaitingResourcesData {
  fetchAwaitingCalls: (options?: FetchOptions) => Promise<void>;
  /** Loads the response code catalog once per session; `force` reloads it. */
  fetchResponseCodes: (force?: boolean) => Promise<void>;
  fetchCallRequirements: (callId: string, options?: FetchOptions) => Promise<void>;
  dismissRequirement: (callId: number, requirementId: number, note?: string) => Promise<AwaitingActionOutcome>;
  dispatchUnit: (callId: number, unitId: number) => Promise<AwaitingActionOutcome>;
  /** The `outstandingRequirementsUpdated` hub event (call id or "0", payload JSON). Returns the parsed alert, if any. */
  handleOutstandingRequirementsUpdated: (id: unknown, payload?: unknown) => OutstandingRequirementsAlert | null;
  dismissUnitAlert: (alertId: string) => void;
  /** The department turned conditional run cards off: drop everything (no request is made). */
  disable: () => void;
}

const initialData = (): AwaitingResourcesData => ({
  ...emptySliceMeta<AwaitingSlice>(),
  calls: [],
  unitAlerts: [],
  lastPushAt: 0,
  busyKey: null,
  responseCodes: [],
  allResponseCodes: [],
  showCodesToCrews: false,
  responseCodesLoaded: false,
  requirementsByCall: {},
});

/** Keeps each alert to the calls still awaiting resources, dropping alerts with nothing left to act on. */
export const pruneUnitAlerts = (alerts: readonly AwaitingUnitAlert[], calls: readonly AwaitingResourcesCallData[]): AwaitingUnitAlert[] => {
  const waiting = new Set(calls.map((call) => call.CallId));
  return alerts.map((alert) => ({ ...alert, calls: alert.calls.filter((call) => waiting.has(call.callId)) })).filter((alert) => alert.calls.length > 0);
};

type PersistedAwaiting = Pick<AwaitingResourcesData, 'calls' | 'responseCodes' | 'allResponseCodes' | 'showCodesToCrews' | 'fetchedAt'>;

let runner: SliceRunner<AwaitingSlice, AwaitingResourcesState>;

export const useAwaitingResourcesStore = create<AwaitingResourcesState>()(
  persist(
    (set, get) => {
      runner = createSliceRunner<AwaitingSlice, AwaitingResourcesState>('awaiting-resources', set);
      let codesGeneration = 0;

      const refresh = (): void => {
        void get().fetchAwaitingCalls({ bypassCache: true });
      };

      return {
        ...initialData(),

        fetchAwaitingCalls: async (options) => {
          // A failed refresh keeps the last list: a waiting call must not vanish from the banner.
          await runner.run(
            'calls',
            async () => {
              const response = await getAwaitingCalls(getDataApiContext());
              // The server re-checks the flag: Enabled false with an empty list means the department turned it off.
              return response?.Enabled === false ? [] : unwrapList(response);
            },
            (calls, state) => ({ calls, unitAlerts: pruneUnitAlerts(state.unitAlerts, calls) }),
            { trailing: options?.bypassCache === true }
          );
        },

        fetchResponseCodes: async (force = false) => {
          if (get().responseCodesLoaded && !force) return;
          const startedIn = ++codesGeneration;
          try {
            const config = unwrapItem(await getAwaitingResourceResponseCodes(getDataApiContext()));
            if (startedIn !== codesGeneration) return;
            const codes = config?.Codes ?? [];
            set({ responseCodes: activeResponseCodes(codes), allResponseCodes: codes, showCodesToCrews: !!config?.ShowToCrews, responseCodesLoaded: true });
          } catch (error) {
            // Codes are optional decoration on a proposal: without them it still works, just without a picker.
            const dataError = toDataError(error);
            getDataLogger().warn({ message: 'Response code catalog failed to load', context: { code: dataError.code, status: dataError.status } });
          }
        },

        fetchCallRequirements: async (callId, options) => {
          await runner.run(
            'requirements',
            async () => unwrapList(await getCallRequirements(getDataApiContext(), { callId })),
            (requirements, state) => ({ requirementsByCall: { ...state.requirementsByCall, [callId]: requirements } }),
            { flightKey: `requirements:${callId}`, trailing: options?.bypassCache === true, silent: true }
          );
        },

        dismissRequirement: async (callId, requirementId, note) => {
          set({ busyKey: `dismiss:${requirementId}` });
          try {
            const result = assertV4Success(await dismissRequirement(getDataApiContext(), { CallId: callId, RequirementId: requirementId, ...(note ? { Note: note } : {}) }));
            if (result?.Success) {
              set((state) => {
                const key = String(callId);
                const current = state.requirementsByCall[key];
                return current ? { requirementsByCall: { ...state.requirementsByCall, [key]: current.filter((row) => row.CallOutstandingRequirementId !== requirementId) } } : {};
              });
            }
            return { ok: !!result?.Success, message: result?.Message ?? null, error: null };
          } catch (error) {
            const dataError = toDataError(error);
            getDataLogger().warn({ message: 'Dismissing an outstanding requirement failed', context: { code: dataError.code, status: dataError.status } });
            return { ok: false, message: null, error: dataError };
          } finally {
            set({ busyKey: null });
            refresh();
          }
        },

        dispatchUnit: async (callId, unitId) => {
          set({ busyKey: `dispatch:${callId}:${unitId}` });
          try {
            const result = assertV4Success(await dispatchUnitToAwaitingCall(getDataApiContext(), { CallId: callId, UnitId: unitId }));
            if (result?.Success) {
              // The unit is on its way: any alert offering it elsewhere is spent.
              set((state) => ({ unitAlerts: state.unitAlerts.filter((alert) => alert.unitId !== unitId) }));
            }
            return { ok: !!result?.Success, message: result?.Message ?? null, error: null };
          } catch (error) {
            const dataError = toDataError(error);
            getDataLogger().warn({ message: 'Dispatching a unit to an awaiting call failed', context: { code: dataError.code, status: dataError.status } });
            return { ok: false, message: null, error: dataError };
          } finally {
            set({ busyKey: null });
            refresh();
          }
        },

        handleOutstandingRequirementsUpdated: (_id, payload) => {
          // Every kind changes the list somehow, and older servers send the call id alone: always refresh.
          set({ lastPushAt: dataNow() });
          refresh();

          const alert = parseOutstandingRequirementsAlert(payload);
          if (!alert) return null;

          if (alert.kind === OutstandingRequirementsAlertKind.UnitAvailable && alert.unitId !== null && alert.calls.length > 0) {
            const unitAlert: AwaitingUnitAlert = {
              id: `unit-${alert.unitId}`,
              unitId: alert.unitId,
              unitName: alert.unitName,
              unitTypeName: alert.unitTypeName,
              message: alert.message,
              calls: alert.calls,
              receivedAt: dataNow(),
            };
            set((state) => ({ unitAlerts: [unitAlert, ...state.unitAlerts.filter((existing) => existing.unitId !== alert.unitId)].slice(0, MAX_UNIT_ALERTS) }));
          } else if (alert.kind === OutstandingRequirementsAlertKind.AutoDispatched && alert.unitId !== null) {
            set((state) => ({ unitAlerts: state.unitAlerts.filter((existing) => existing.unitId !== alert.unitId) }));
          }
          return alert;
        },

        dismissUnitAlert: (alertId) => set((state) => ({ unitAlerts: state.unitAlerts.filter((alert) => alert.id !== alertId) })),

        disable: () => {
          runner.invalidate();
          codesGeneration++;
          set(initialData());
        },
      };
    },
    dataPersistOptions<AwaitingResourcesState, PersistedAwaiting>({
      name: 'omni-awaiting-resources-storage',
      partialize: (state) => ({
        calls: state.calls,
        responseCodes: state.responseCodes,
        allResponseCodes: state.allResponseCodes,
        showCodesToCrews: state.showCodesToCrews,
        fetchedAt: state.fetchedAt,
      }),
    })
  )
);

registerPersistedStore('omni-awaiting-resources-storage', useAwaitingResourcesStore);
registerDataStoreReset<AwaitingResourcesState>('awaiting-resources', useAwaitingResourcesStore, initialData, () => runner.invalidate());

/** The busy key for dispatching a unit to a waiting call (button spinners). */
export const awaitingDispatchKey = (callId: number, unitId: number): string => `dispatch:${callId}:${unitId}`;
/** The busy key for dismissing a requirement. */
export const awaitingDismissKey = (requirementId: number): string => `dismiss:${requirementId}`;
