import { escalateCall, getCallRecommendation, getDispatchRecommendation } from '@resgrid/api';
import type { DispatchRecommendationResultData, EscalateCallResult } from '@resgrid/models';
import { create } from 'zustand';

import { assertV4Success, type Enveloped, unwrapItem } from '../core/envelope';
import { type DataError, toDataError } from '../core/errors';
import { registerDataStoreReset } from '../core/reset';
import { getDataApiContext, getDataLogger } from '../core/runtime';

/**
 * Run card recommendations (Dispatch baseline `stores/runcards`). A recommendation is a *preview*: fetching it
 * dispatches nothing. The dispatcher applies it into the normal dispatch selection, which then rides the ordinary
 * manual pipeline; auto-dispatch (when a department has it on) happens server-side at call creation.
 *
 * Two independent slices: the New Call preview (one call being composed) and add-resources recommendations per call
 * already out (a dispatcher may compose a new call while adding a unit to another one). Department flags
 * (Dispatch.RunCards / RunCardConditions) are checked by the features before they call in: data never imports auth.
 * Not persisted: a preview is only meaningful for the form on screen.
 */

/** Priority, type and location all change while the dispatcher types; each change runs the whole selection engine. */
export const RUN_CARD_RECOMMENDATION_DEBOUNCE_MS = 600;

export interface RunCardRecommendationRequest {
  /** Call priority id (system 0-3 or DepartmentCallPriorityId); null until the dispatcher picks one. */
  priority: number | null;
  /** Call type name (Core resolves it case-insensitively). */
  type: string;
  latitude?: number | null;
  longitude?: number | null;
  /** 1 for a new call; the next level when previewing an escalation. */
  alarmLevel?: number;
}

/** The dispatcher's response code choices over a proposal (conditional run cards): unit id → code id, null for none. */
export type UnitResponseCodeChoices = Record<number, number | null>;

export interface CallRecommendationEntry {
  recommendation: DispatchRecommendationResultData | null;
  isLoading: boolean;
  /** A re-evaluation keeps the pinned answer on screen while the fresh walk runs. */
  isReevaluating: boolean;
  error: DataError | null;
  hasFetched: boolean;
}

interface RunCardsData {
  recommendation: DispatchRecommendationResultData | null;
  isLoading: boolean;
  error: DataError | null;
  /** True once a fetch settled, so the UI can tell "not asked yet" from "asked, no card matched". */
  hasFetched: boolean;
  /** The run card the dispatcher applied, so the panel shows it as applied. */
  appliedRunCardId: number | null;
  /** Posted as UnitResponseCodes when the call is saved. */
  unitResponseCodes: UnitResponseCodeChoices;
  isEscalating: boolean;
  escalationError: DataError | null;
  callRecommendations: Record<string, CallRecommendationEntry>;
}

export interface RunCardsState extends RunCardsData {
  fetchRecommendation: (request: RunCardRecommendationRequest) => Promise<void>;
  fetchRecommendationDebounced: (request: RunCardRecommendationRequest) => void;
  markApplied: (runCardId: number | null) => void;
  setUnitResponseCode: (unitId: number, codeId: number | null) => void;
  /** Drops the New Call preview (and cancels a pending or in-flight lookup). */
  clear: () => void;
  /** "Strike Next Alarm" (online only, irreversible). Null when the request failed (see `escalationError`). */
  escalate: (callId: string) => Promise<EscalateCallResult | null>;
  /** Add-resources recommendation for a call already out. Returns false when a re-evaluation failed (the pinned answer stays). */
  fetchCallRecommendation: (callId: string, options?: { reevaluate?: boolean }) => Promise<boolean>;
  clearCallRecommendation: (callId: string) => void;
}

const initialData = (): RunCardsData => ({
  recommendation: null,
  isLoading: false,
  error: null,
  hasFetched: false,
  appliedRunCardId: null,
  unitResponseCodes: {},
  isEscalating: false,
  escalationError: null,
  callRecommendations: {},
});

const EMPTY_ENTRY: CallRecommendationEntry = { recommendation: null, isLoading: false, isReevaluating: false, error: null, hasFetched: false };

/** The recommendation inside a v4 envelope (Swagger types `Data` loosely); `not_found` / missing → null. */
const recommendationOf = (result: unknown): DispatchRecommendationResultData | null => unwrapItem(result as Enveloped<DispatchRecommendationResultData>);

const isUsableNumber = (value: number | null | undefined): value is number => typeof value === 'number' && Number.isFinite(value);

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let inFlight: AbortController | null = null;
const callControllers = new Map<string, AbortController>();
let generation = 0;

const cancelPreview = (): void => {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  inFlight?.abort();
  inFlight = null;
};

export const useRunCardsStore = create<RunCardsState>()((set, get) => {
  const patchCall = (callId: string, patch: Partial<CallRecommendationEntry>): void =>
    set((state) => ({ callRecommendations: { ...state.callRecommendations, [callId]: { ...(state.callRecommendations[callId] ?? EMPTY_ENTRY), ...patch } } }));

  return {
    ...initialData(),

    fetchRecommendation: async (request) => {
      // Run cards match on priority and/or call type: asking before both are picked only wastes a round trip.
      if (!isUsableNumber(request.priority) || !request.type.trim()) {
        cancelPreview();
        set({ recommendation: null, isLoading: false, error: null, hasFetched: false });
        return;
      }

      inFlight?.abort();
      const controller = new AbortController();
      inFlight = controller;
      const startedIn = generation;
      set({ isLoading: true, error: null });

      try {
        const params = {
          priority: request.priority,
          type: request.type,
          ...(isUsableNumber(request.latitude) && isUsableNumber(request.longitude) ? { latitude: request.latitude, longitude: request.longitude } : {}),
          ...(request.alarmLevel && request.alarmLevel > 1 ? { alarmLevel: request.alarmLevel } : {}),
        };
        const recommendation = recommendationOf(await getDispatchRecommendation(getDataApiContext(), params, { signal: controller.signal }));
        // A newer request (or a reset) superseded this one while it was out.
        if (inFlight !== controller || startedIn !== generation) return;
        inFlight = null;
        // Code choices follow the units: a choice for a unit the new proposal still carries stays, the rest go.
        const proposed = new Set((recommendation?.Units ?? []).map((unit) => unit.UnitId));
        const unitResponseCodes = Object.fromEntries(Object.entries(get().unitResponseCodes).filter(([unitId]) => proposed.has(Number(unitId)))) as UnitResponseCodeChoices;
        set({ recommendation, isLoading: false, hasFetched: true, error: null, unitResponseCodes });
      } catch (error) {
        if (controller.signal.aborted || inFlight !== controller || startedIn !== generation) return;
        inFlight = null;
        const dataError = toDataError(error);
        getDataLogger().warn({ message: 'Run card recommendation failed', context: { code: dataError.code, status: dataError.status } });
        // Never block call creation: the panel shows a quiet failure and the dispatcher selects resources by hand.
        set({ recommendation: null, isLoading: false, hasFetched: true, error: dataError });
      }
    },

    fetchRecommendationDebounced: (request) => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        void get().fetchRecommendation(request);
      }, RUN_CARD_RECOMMENDATION_DEBOUNCE_MS);
    },

    markApplied: (runCardId) => set({ appliedRunCardId: runCardId }),

    setUnitResponseCode: (unitId, codeId) => set((state) => ({ unitResponseCodes: { ...state.unitResponseCodes, [unitId]: codeId } })),

    clear: () => {
      cancelPreview();
      set({ recommendation: null, isLoading: false, error: null, hasFetched: false, appliedRunCardId: null, unitResponseCodes: {}, isEscalating: false, escalationError: null });
    },

    escalate: async (callId) => {
      set({ isEscalating: true, escalationError: null });
      try {
        const result = assertV4Success(await escalateCall(getDataApiContext(), { callId }));
        set({ isEscalating: false });
        return result;
      } catch (error) {
        const dataError = toDataError(error);
        getDataLogger().warn({ message: 'Alarm escalation failed', context: { code: dataError.code, status: dataError.status } });
        set({ isEscalating: false, escalationError: dataError });
        return null;
      }
    },

    fetchCallRecommendation: async (callId, options = {}) => {
      const reevaluate = options.reevaluate === true;
      callControllers.get(callId)?.abort();
      const controller = new AbortController();
      callControllers.set(callId, controller);
      const startedIn = generation;
      patchCall(callId, reevaluate ? { isReevaluating: true, error: null } : { isLoading: true, error: null });

      try {
        const params = reevaluate ? { callId, reevaluate: true } : { callId };
        const recommendation = recommendationOf(await getCallRecommendation(getDataApiContext(), params, { signal: controller.signal }));
        if (callControllers.get(callId) !== controller || startedIn !== generation) return true;
        callControllers.delete(callId);
        patchCall(callId, { recommendation, isLoading: false, isReevaluating: false, hasFetched: true, error: null });
        return true;
      } catch (error) {
        if (controller.signal.aborted || callControllers.get(callId) !== controller || startedIn !== generation) return true;
        callControllers.delete(callId);
        const dataError = toDataError(error);
        getDataLogger().warn({ message: 'Add-resources recommendation failed', context: { code: dataError.code, status: dataError.status, reevaluate } });
        if (reevaluate) {
          // The pinned answer is still valid: a failed fresh walk must not take it off screen.
          patchCall(callId, { isReevaluating: false });
          return false;
        }
        patchCall(callId, { recommendation: null, isLoading: false, isReevaluating: false, hasFetched: true, error: dataError });
        return true;
      }
    },

    clearCallRecommendation: (callId) => {
      callControllers.get(callId)?.abort();
      callControllers.delete(callId);
      set((state) => {
        if (!(callId in state.callRecommendations)) return {};
        const next = { ...state.callRecommendations };
        delete next[callId];
        return { callRecommendations: next };
      });
    },
  };
});

registerDataStoreReset<RunCardsState>('run-cards', useRunCardsStore, initialData, () => {
  generation++;
  cancelPreview();
  callControllers.forEach((controller) => controller.abort());
  callControllers.clear();
});

/** The add-resources entry for a call (a stable empty entry before the first fetch). */
export const selectCallRecommendation = (state: Pick<RunCardsState, 'callRecommendations'>, callId: string | null | undefined): CallRecommendationEntry =>
  (callId ? state.callRecommendations[callId] : undefined) ?? EMPTY_ENTRY;
