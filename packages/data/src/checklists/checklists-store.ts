import { attestChecklistRun, completeChecklistRun, deleteChecklistRunFile, getChecklistAccess, getChecklistRun, saveChecklistRunProgress, startChecklistRun } from '@resgrid/api';
import type { ChecklistAccess, ChecklistCommandInput, ChecklistInput, ChecklistRun, ChecklistStartInput, ChecklistWitnessInput } from '@resgrid/models';
import { ProtectedPayloadError } from '@resgrid/offline';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { assertV4Success, unwrapItem } from '../core/envelope';
import { type DataError, toDataError } from '../core/errors';
import { defineDataHandler, submitWrite, type WriteOutcome } from '../core/outbox';
import { dataPersistOptions, registerPersistedStore } from '../core/persist';
import { registerDataStoreReset } from '../core/reset';
import { getDataApiContext } from '../core/runtime';
import { createSliceRunner, emptySliceMeta, type FetchOptions, type SliceMeta, type SliceRunner } from '../core/slices';

type ChecklistsSlice = 'access' | 'run';

export const CHECKLIST_RUN_SAVE_EVENT = 'checklists.run.save';

export interface ChecklistRunSavePayload {
  runId: string;
  input: ChecklistInput;
  /** CompleteChecklistRun rather than SaveChecklistRunProgress. */
  submit: boolean;
}

export interface ChecklistRunSaveOutcome {
  outcome: WriteOutcome;
  /** The run as the server now holds it, when it answered. */
  run: ChecklistRun | null;
}

/**
 * Readiness checklists (Responder/Unit). Run saves go through the outbox as protected (encrypted) events, ordered
 * per run, with progress saves coalesced so only the newest unsent draft replays (plan §8.5). TODO: import the legacy
 * ciphertext vault (`checklists-ciphertext-v1`) and the due list/history reads (still in the checklists feature).
 */
interface ChecklistsData extends SliceMeta<ChecklistsSlice> {
  access: ChecklistAccess | null;
  runsById: Record<string, ChecklistRun>;
  actionError: DataError | null;
}

export interface ChecklistsState extends ChecklistsData {
  fetchAccess: (options?: FetchOptions) => Promise<void>;
  fetchRun: (id: string, occurrenceId?: string, options?: FetchOptions) => Promise<ChecklistRun | null>;
  startRun: (input: ChecklistStartInput) => Promise<ChecklistRun | null>;
  attestRun: (input: ChecklistWitnessInput) => Promise<ChecklistRun | null>;
  /** Saves progress or submits a run the server already knows (start it first with `startRun`). */
  saveRun: (run: ChecklistRun, input: ChecklistInput, submit: boolean) => Promise<ChecklistRunSaveOutcome>;
  /** Removes one evidence file from an open run (online only: evidence lives on the server). */
  deleteRunFile: (input: ChecklistCommandInput) => Promise<ChecklistRun | null>;
  /** The server's copy after a delivered save (outbox handler). */
  applySavedRun: (run: ChecklistRun) => void;
}

const initialData = (): ChecklistsData => ({ ...emptySliceMeta<ChecklistsSlice>(), access: null, runsById: {}, actionError: null });

let runner: SliceRunner<ChecklistsSlice, ChecklistsState>;

export const useChecklistsStore = create<ChecklistsState>()(
  persist(
    (set, get) => {
      runner = createSliceRunner<ChecklistsSlice, ChecklistsState>('checklists', set);
      const keepRun = (run: ChecklistRun | null) => {
        if (run) set((state) => ({ runsById: { ...state.runsById, [run.Id]: run } }));
        return run;
      };
      const act = async (fn: () => Promise<ChecklistRun | null>): Promise<ChecklistRun | null> => {
        set({ actionError: null });
        try {
          return keepRun(await fn());
        } catch (error) {
          set({ actionError: toDataError(error) });
          return null;
        }
      };
      return {
        ...initialData(),
        fetchAccess: async () => {
          await runner.run(
            'access',
            async () => unwrapItem(await getChecklistAccess(getDataApiContext())),
            (access) => ({ access })
          );
        },
        fetchRun: async (id, occurrenceId, options) => {
          const cached = get().runsById[id];
          if (cached && !options?.bypassCache) return cached;
          const result = await runner.run(
            'run',
            async () => unwrapItem(await getChecklistRun(getDataApiContext(), occurrenceId ? { occurrenceId } : { id })),
            (run, state) => (run ? { runsById: { ...state.runsById, [run.Id]: run } } : {}),
            {
              flightKey: `run:${id}`,
            }
          );
          return result.ok ? result.value : (cached ?? null);
        },
        startRun: (input) => act(async () => unwrapItem(assertV4Success(await startChecklistRun(getDataApiContext(), input)))),
        attestRun: (input) => act(async () => unwrapItem(assertV4Success(await attestChecklistRun(getDataApiContext(), input)))),
        saveRun: async (run, input, submit) => {
          set({ actionError: null });
          const payload: ChecklistRunSavePayload = { runId: run.Id, input, submit };
          try {
            const { outcome } = await submitWrite<ChecklistRunSavePayload>({
              type: CHECKLIST_RUN_SAVE_EVENT,
              payload,
              orderKey: `checklist-run:${run.Id}`,
              // A newer unsent draft replaces an older one; a submit never coalesces with drafts.
              coalesceKey: submit ? undefined : `checklist-run-progress:${run.Id}`,
              protected: true,
            });
            return { outcome, run: outcome === 'sent' ? (get().runsById[run.Id] ?? null) : null };
          } catch (error) {
            // No payload cipher (web has no secure key store): answers may be protected, so they are never written to
            // the device unencrypted — send online only.
            if (!(error instanceof ProtectedPayloadError)) throw error;
            const saved = await act(async () => sendChecklistRunSave(payload));
            return { outcome: saved ? 'sent' : 'rejected', run: saved };
          }
        },
        deleteRunFile: (input) => act(async () => unwrapItem(assertV4Success(await deleteChecklistRunFile(getDataApiContext(), input)))),
        applySavedRun: (run) => {
          keepRun(run);
        },
      };
    },
    dataPersistOptions<ChecklistsState, Pick<ChecklistsData, 'access' | 'fetchedAt'>>({
      // Run contents can carry protected answers: they are not persisted in plain storage.
      name: 'omni-checklists-storage',
      partialize: (state) => ({ access: state.access, fetchedAt: state.fetchedAt }),
    })
  )
);

registerPersistedStore('omni-checklists-storage', useChecklistsStore);
registerDataStoreReset<ChecklistsState>('checklists', useChecklistsStore, initialData, () => runner.invalidate());

async function sendChecklistRunSave(payload: ChecklistRunSavePayload): Promise<ChecklistRun | null> {
  const body = { Id: payload.runId, Input: payload.input };
  const ctx = getDataApiContext();
  return unwrapItem(assertV4Success(payload.submit ? await completeChecklistRun(ctx, body) : await saveChecklistRunProgress(ctx, body)));
}

/** Delivers a queued run save (SaveChecklistRunProgress / CompleteChecklistRun). */
export const checklistRunSaveHandler = defineDataHandler<ChecklistRunSavePayload, ChecklistRun | null>({
  type: CHECKLIST_RUN_SAVE_EVENT,
  send: async (event) => sendChecklistRunSave(event.payload),
  afterAck: (_event, run) => {
    if (run) useChecklistsStore.getState().applySavedRun(run);
  },
});
