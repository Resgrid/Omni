import { attestChecklistRun, getChecklistAccess, getChecklistRun, startChecklistRun } from '@resgrid/api';
import type { ChecklistAccess, ChecklistRun, ChecklistStartInput, ChecklistWitnessInput } from '@resgrid/models';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { assertV4Success, unwrapItem } from '../core/envelope';
import { type DataError, toDataError } from '../core/errors';
import { dataPersistOptions, registerPersistedStore } from '../core/persist';
import { registerDataStoreReset } from '../core/reset';
import { getDataApiContext } from '../core/runtime';
import { createSliceRunner, emptySliceMeta, type FetchOptions, type SliceMeta, type SliceRunner } from '../core/slices';

type ChecklistsSlice = 'access' | 'run';

/**
 * Readiness checklists (Responder/Unit). TODO(api): the due list, history and run save (`GetDueChecklists`,
 * `GetChecklistHistory`, `SaveChecklistRun`) are not in @resgrid/api yet, so offline checklist runs (plan §8.5)
 * and the legacy ciphertext vault (`checklists-ciphertext-v1`) move here once they are.
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
            async () => unwrapItem(await getChecklistRun(getDataApiContext(), { id, occurrenceId })),
            (run, state) => (run ? { runsById: { ...state.runsById, [run.Id]: run } } : {}),
            {
              flightKey: `run:${id}`,
            }
          );
          return result.ok ? result.value : (cached ?? null);
        },
        startRun: (input) => act(async () => unwrapItem(assertV4Success(await startChecklistRun(getDataApiContext(), input)))),
        attestRun: (input) => act(async () => unwrapItem(assertV4Success(await attestChecklistRun(getDataApiContext(), input)))),
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
