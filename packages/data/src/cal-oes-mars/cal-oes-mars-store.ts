import { buildCalOesMarsF42, getCalOesMarsAccess, getCalOesMarsQueue, validateCalOesMarsWorkItem } from '@resgrid/api';
import type { CalOesMarsAccess, CalOesMarsQueueItem, CalOesMarsValidation } from '@resgrid/models';
import { create } from 'zustand';

import { assertV4Success, unwrapItem, unwrapList } from '../core/envelope';
import { type DataError, toDataError } from '../core/errors';
import { registerDataStoreReset } from '../core/reset';
import { getDataApiContext } from '../core/runtime';
import { createSliceRunner, emptySliceMeta, type SliceMeta, type SliceRunner } from '../core/slices';

type MarsSlice = 'access' | 'queue';

/**
 * CAL OES MARS F-42 from the field (Workforce & Business Operations plan, Phase C-M3; R/U/I `operations` stores):
 * the department's MARS access, the work-item queue, drafting an F-42 from a deployment's submitted time reports and
 * the portal validation. Online only and never persisted — submission itself stays a manual, audited hand-off on the
 * web, and the queue is re-read on every open.
 */
interface CalOesMarsData extends SliceMeta<MarsSlice> {
  access: CalOesMarsAccess | null;
  queue: CalOesMarsQueueItem[];
  validation: CalOesMarsValidation | null;
  busy: boolean;
  actionError: DataError | null;
}

export interface CalOesMarsState extends CalOesMarsData {
  loadAccess: () => Promise<CalOesMarsAccess | null>;
  loadQueue: () => Promise<CalOesMarsQueueItem[]>;
  /** Drafts the F-42 from the deployment's time reports, then re-reads the queue. */
  draftF42: (deploymentId: string) => Promise<boolean>;
  /** Runs the portal validation for one work item; resolves to whether it is ready for the portal. */
  validate: (workItemId: string) => Promise<boolean>;
}

const initialData = (): CalOesMarsData => ({ ...emptySliceMeta<MarsSlice>(), access: null, queue: [], validation: null, busy: false, actionError: null });

let runner: SliceRunner<MarsSlice, CalOesMarsState>;

export const useCalOesMarsStore = create<CalOesMarsState>()((set, get) => {
  runner = createSliceRunner<MarsSlice, CalOesMarsState>('cal-oes-mars', set);
  const ctx = () => getDataApiContext();
  const act = async <T>(fn: () => Promise<T>): Promise<T | null> => {
    set({ busy: true, actionError: null });
    try {
      return await fn();
    } catch (error) {
      set({ actionError: toDataError(error) });
      return null;
    } finally {
      set({ busy: false });
    }
  };
  return {
    ...initialData(),
    loadAccess: async () => {
      const result = await runner.run(
        'access',
        async () => unwrapItem(await getCalOesMarsAccess(ctx())),
        (access) => ({ access })
      );
      return result.ok ? result.value : get().access;
    },
    loadQueue: async () => {
      const result = await runner.run(
        'queue',
        async () => unwrapList(await getCalOesMarsQueue(ctx())),
        (queue) => ({ queue })
      );
      return result.ok ? result.value : get().queue;
    },
    draftF42: async (deploymentId) => {
      const built = await act(async () => {
        assertV4Success(await buildCalOesMarsF42(ctx(), { DeploymentId: deploymentId }));
        return true;
      });
      if (built) await get().loadQueue();
      return built === true;
    },
    validate: async (workItemId) => {
      const validation = await act(async () => unwrapItem(await validateCalOesMarsWorkItem(ctx(), { id: workItemId })));
      if (validation) set({ validation });
      return validation?.IsReadyForPortal === true;
    },
  };
});

registerDataStoreReset<CalOesMarsState>('cal-oes-mars', useCalOesMarsStore, initialData, () => runner.invalidate());

/** The queue's work items for one deployment. */
export const selectMarsItemsForDeployment = (state: Pick<CalOesMarsState, 'queue'>, deploymentId: string): CalOesMarsQueueItem[] => state.queue.filter((item) => item.DeploymentId === deploymentId);
