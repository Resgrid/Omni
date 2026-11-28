import { completeCallProtocolChecklist, getCallProtocolChecklists, getProtocolSopLibrary, recordCallProtocolStep, startCallProtocolChecklist } from '@resgrid/api';
import type { CallProtocolChecklistResult, CallProtocolChecklistResultData, ProtocolStepStateValue, SopLibraryItemData } from '@resgrid/models';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { assertV4Success, unwrapItem, unwrapList } from '../core/envelope';
import { type DataError, toDataError } from '../core/errors';
import { defineIdempotentDataHandler, drainOrderGroup, submitWrite, type WriteResult } from '../core/outbox';
import { dataPersistOptions, registerPersistedStore } from '../core/persist';
import { registerQueuedMarkerSource } from '../core/queued-markers';
import { registerDataStoreReset } from '../core/reset';
import { dataNow, getDataApiContext } from '../core/runtime';
import { createSliceRunner, emptySliceMeta, type FetchOptions, type SliceMeta, type SliceRunner } from '../core/slices';

export const PROTOCOL_STEP_RECORD_EVENT = 'protocols.step.record';

/** Calls whose checklists stay on the device (the calls a member works); oldest dropped first. */
export const CALL_CHECKLIST_CACHE_LIMIT = 25;

/** A step event waiting in the outbox (shown at once, sent on reconnect). */
export interface QueuedStepEvent {
  localId: string;
  callId: string;
  callProtocolId: string;
  stepId: string;
  state: ProtocolStepStateValue;
  at: string;
  rejected?: boolean;
}

export interface ProtocolStepPayload {
  callId: string;
  callProtocolId: string;
  stepId: string;
  state: ProtocolStepStateValue;
  /** When the member ticked the step on the device (Core keeps its own server time beside it). */
  deviceTimestamp: string;
}

type StepsSlice = 'checklists' | 'sops';

interface StepsData extends SliceMeta<StepsSlice> {
  checklistsByCall: Record<string, CallProtocolChecklistResultData[]>;
  /** Insertion order of `checklistsByCall` (retention). */
  callOrder: string[];
  sopLibrary: SopLibraryItemData[];
  queuedSteps: QueuedStepEvent[];
  actionError: DataError | null;
}

export interface CallProtocolStepsState extends StepsData {
  fetchChecklists: (callId: string, options?: FetchOptions) => Promise<void>;
  fetchSopLibrary: (options?: FetchOptions) => Promise<void>;
  /** Starts a protocol (an incident SOP) on the call; online only. */
  startChecklist: (callId: string, protocolId: string) => Promise<CallProtocolChecklistResultData | null>;
  /** One step event; queued offline and replayed with its device time and outbox id (Core deduplicates on it). */
  recordStep: (payload: Omit<ProtocolStepPayload, 'deviceTimestamp'>) => Promise<WriteResult>;
  completeChecklist: (callId: string, callProtocolId: string) => Promise<CallProtocolChecklistResultData | null>;
  applyQueuedStep: (step: QueuedStepEvent) => void;
  settleQueuedStep: (localId: string, rejected: boolean | null) => void;
  /** Replaces one checklist of a call with the server's copy (after a write). */
  keepChecklist: (callId: string, checklist: CallProtocolChecklistResultData) => void;
}

const initialData = (): StepsData => ({ ...emptySliceMeta<StepsSlice>(), checklistsByCall: {}, callOrder: [], sopLibrary: [], queuedSteps: [], actionError: null });

/** A call's checklists with the device's queued step events applied on top (newest event per step wins). */
export function withQueuedSteps(checklists: readonly CallProtocolChecklistResultData[], queued: readonly QueuedStepEvent[]): CallProtocolChecklistResultData[] {
  if (queued.length === 0) return [...checklists];

  return checklists.map((checklist) => {
    const mine = queued.filter((event) => event.callProtocolId === checklist.CallProtocolId && !event.rejected);

    if (mine.length === 0) return checklist;

    const steps = (checklist.Steps ?? []).map((step) => {
      const last = [...mine].reverse().find((event) => event.stepId === step.Id);

      return last ? { ...step, State: last.state, At: last.at } : step;
    });

    return { ...checklist, Steps: steps, Done: steps.filter((step) => step.State !== 0).length };
  });
}

let runner: SliceRunner<StepsSlice, CallProtocolStepsState>;

/** One order group per checklist: its step events reach Core in the order they were ticked, and before its completion. */
export const protocolStepsOrderKey = (callProtocolId: string): string => `protocol-steps:${callProtocolId}`;

/** Step events of a checklist still waiting to be sent (a refused one no longer waits: it is shown as refused, not done). */
const hasUnsentSteps = (queued: readonly QueuedStepEvent[], callProtocolId: string): boolean => queued.some((event) => event.callProtocolId === callProtocolId && !event.rejected);

/** Completion waits for the checklist's queued steps; when they could not be sent (offline), the member is told to try again. */
const STEPS_NOT_SENT: DataError = { code: 'network', messageKey: 'errors.data.network' };

const keepCall = (state: StepsData, callId: string, checklists: CallProtocolChecklistResultData[]): Pick<StepsData, 'checklistsByCall' | 'callOrder'> => {
  const order = [...state.callOrder.filter((id) => id !== callId), callId];
  const dropped = order.slice(0, Math.max(0, order.length - CALL_CHECKLIST_CACHE_LIMIT));
  const kept = { ...state.checklistsByCall, [callId]: checklists };

  for (const id of dropped) delete kept[id];

  return { checklistsByCall: kept, callOrder: order.slice(dropped.length) };
};

/**
 * Protocol step-through on a call (protocols plan P3; apps with `capabilities.protocols.stepThrough`): the call's checklists,
 * the incident SOP library, starting and completing a checklist, and step events (done, skipped, not applicable, back to
 * pending). Step events go through the outbox, so a crew ticks steps without signal; the rest is online only.
 */
export const useCallProtocolStepsStore = create<CallProtocolStepsState>()(
  persist(
    (set, get) => {
      runner = createSliceRunner<StepsSlice, CallProtocolStepsState>('callProtocolSteps', set);
      const ctx = () => getDataApiContext();

      // An answer that lands after a reset (sign-out) belongs to the session that asked: it must not repopulate the store.
      const act = async (callId: string, fn: () => Promise<CallProtocolChecklistResult>, startedIn = runner.generation()): Promise<CallProtocolChecklistResultData | null> => {
        set({ actionError: null });

        try {
          const checklist = unwrapItem(assertV4Success(await fn()));

          if (runner.generation() !== startedIn) return null;

          if (checklist) get().keepChecklist(callId, checklist);

          return checklist;
        } catch (error) {
          if (runner.generation() !== startedIn) return null;
          set({ actionError: toDataError(error) });

          return null;
        }
      };

      return {
        ...initialData(),
        fetchChecklists: async (callId, options) => {
          await runner.run(
            'checklists',
            async () => unwrapList(await getCallProtocolChecklists(ctx(), { callId })),
            (checklists, state) => keepCall(state, callId, checklists),
            // A read asked for after a write (bypassCache) runs after the one in flight, which may predate the write.
            { flightKey: `checklists:${callId}`, raceKey: `checklists:${callId}`, trailing: options?.bypassCache === true }
          );
        },
        fetchSopLibrary: async () => {
          await runner.run(
            'sops',
            async () => unwrapList(await getProtocolSopLibrary(ctx())),
            (sopLibrary) => ({ sopLibrary })
          );
        },
        startChecklist: (callId, protocolId) => act(callId, () => startCallProtocolChecklist(ctx(), { CallId: Number(callId), ProtocolId: Number(protocolId) })),
        completeChecklist: async (callId, callProtocolId) => {
          const startedIn = runner.generation();

          // Core takes no step for a completed checklist: the steps ticked before it (queued offline, or retrying) are sent first.
          try {
            await drainOrderGroup(protocolStepsOrderKey(callProtocolId));
          } catch {
            // Undelivered steps stay queued; the check below keeps the completion back.
          }

          if (runner.generation() !== startedIn) return null;

          if (hasUnsentSteps(get().queuedSteps, callProtocolId)) {
            set({ actionError: STEPS_NOT_SENT });

            return null;
          }

          return act(callId, () => completeCallProtocolChecklist(ctx(), { CallId: Number(callId), CallProtocolId: Number(callProtocolId) }), startedIn);
        },
        recordStep: (payload) =>
          submitWrite<ProtocolStepPayload>({ type: PROTOCOL_STEP_RECORD_EVENT, payload: { ...payload, deviceTimestamp: new Date(dataNow()).toISOString() }, orderKey: protocolStepsOrderKey(payload.callProtocolId) }),
        applyQueuedStep: (step) => set((state) => ({ queuedSteps: [...state.queuedSteps.filter((event) => event.localId !== step.localId), step] })),
        settleQueuedStep: (localId, rejected) =>
          set((state) => ({
            queuedSteps: rejected === null ? state.queuedSteps.filter((event) => event.localId !== localId) : state.queuedSteps.map((event) => (event.localId === localId ? { ...event, rejected } : event)),
          })),
        keepChecklist: (callId, checklist) =>
          set((state) => {
            const current = state.checklistsByCall[callId] ?? [];
            const next = current.some((item) => item.CallProtocolId === checklist.CallProtocolId) ? current.map((item) => (item.CallProtocolId === checklist.CallProtocolId ? checklist : item)) : [...current, checklist];

            return keepCall(state, callId, next);
          }),
      };
    },
    dataPersistOptions<CallProtocolStepsState, Pick<StepsData, 'checklistsByCall' | 'callOrder' | 'sopLibrary' | 'queuedSteps' | 'fetchedAt'>>({
      name: 'omni-call-protocol-steps-storage',
      partialize: (state) => ({ checklistsByCall: state.checklistsByCall, callOrder: state.callOrder, sopLibrary: state.sopLibrary, queuedSteps: state.queuedSteps, fetchedAt: state.fetchedAt }),
    })
  )
);

/**
 * Step events are idempotent on the outbox id (Core's ClientStepId) and carry the device time, so a replay after
 * reconnect records the step once, when it was ticked.
 */
export const protocolStepRecordHandler = defineIdempotentDataHandler<ProtocolStepPayload, CallProtocolChecklistResult>({
  type: PROTOCOL_STEP_RECORD_EVENT,
  optimisticApply: (event) => {
    useCallProtocolStepsStore.getState().applyQueuedStep({
      localId: event.id,
      callId: event.payload.callId,
      callProtocolId: event.payload.callProtocolId,
      stepId: event.payload.stepId,
      state: event.payload.state,
      at: event.payload.deviceTimestamp,
    });
  },
  send: async (event, context) =>
    assertV4Success(
      await recordCallProtocolStep(getDataApiContext(), {
        CallId: Number(event.payload.callId),
        CallProtocolId: Number(event.payload.callProtocolId),
        StepId: event.payload.stepId,
        State: event.payload.state,
        DeviceTimestamp: event.payload.deviceTimestamp,
        ClientStepId: context.idempotencyKey,
      })
    ),
  afterAck: (event, result) => {
    const checklist = result?.Data;

    if (checklist) useCallProtocolStepsStore.getState().keepChecklist(event.payload.callId, checklist);
    useCallProtocolStepsStore.getState().settleQueuedStep(event.id, null);
  },
  refresh: (event) => useCallProtocolStepsStore.getState().fetchChecklists(event.payload.callId, { bypassCache: true }),
  rollback: (event, reason) => {
    useCallProtocolStepsStore.getState().settleQueuedStep(event.id, reason === 'discarded' ? null : true);
  },
});

registerPersistedStore('omni-call-protocol-steps-storage', useCallProtocolStepsStore);

// A queued step whose outbox event is gone (the app closed between delivery and saving the cleared marker) is dropped, so it
// neither shows as waiting nor holds a checklist's completion back for good.
registerQueuedMarkerSource('call-protocol-steps', {
  ids: () => useCallProtocolStepsStore.getState().queuedSteps.map((event) => event.localId),
  remove: (ids) => useCallProtocolStepsStore.setState((state) => ({ queuedSteps: state.queuedSteps.filter((event) => !ids.includes(event.localId)) })),
});

registerDataStoreReset<CallProtocolStepsState>('callProtocolSteps', useCallProtocolStepsStore, initialData, () => runner.invalidate());
