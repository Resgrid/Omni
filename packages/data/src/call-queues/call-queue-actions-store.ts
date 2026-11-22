import { closeCallWith, dismissIntakeCallAsSpam, dispatchCallNow } from '@resgrid/api';
import { IntakeDismissOutcomes } from '@resgrid/models';
import { create } from 'zustand';

import { useCallsStore } from '../calls/calls-store';
import { assertV4Success } from '../core/envelope';
import { type DataError, toDataError } from '../core/errors';
import { registerDataStoreReset } from '../core/reset';
import { getDataApiContext, getDataLogger } from '../core/runtime';

/**
 * Actions on the not-yet-dispatched queues (Dispatch baseline `use-call-dispatch-now`): dispatching a Pending call, or a
 * scheduled call ahead of its time (`Calls/DispatchCallNow`), and cancelling a Pending call (closed as Cancelled; nobody
 * was paged for it, so nobody is told). Online writes: neither is in Dispatch's offline scope (plan §8.5), and paging
 * people must never replay late. After a success the pending/scheduled lists and the active calls are refreshed.
 */

/** Core CallStates.Cancelled. */
const CANCELLED_STATE = 2;

export interface QueueActionOutcome {
  ok: boolean;
  error: DataError | null;
}

interface CallQueueActionsData {
  /** The call an action is running for (its row shows a spinner). */
  busyCallId: string | null;
}

export interface CallQueueActionsState extends CallQueueActionsData {
  /** `dispatchList` replaces the call's proposed recipients; omitted, the server dispatches whoever was proposed. */
  dispatchNow: (callId: string, options?: { dispatchList?: string; unitResponseCodes?: string }) => Promise<QueueActionOutcome>;
  cancelPending: (callId: string) => Promise<QueueActionOutcome>;
  /**
   * Cancels a pending intake call as spam (Core M0326 `IntakeScreening/DismissAsSpam`): nobody is notified, nothing is texted back and,
   * with `blockSender`, the sender is blocked from the department's intake channels. Fails (ok false) when the call is no longer pending.
   */
  dismissAsSpam: (callId: string, blockSender: boolean) => Promise<QueueActionOutcome>;
}

const initialData = (): CallQueueActionsData => ({ busyCallId: null });

const refreshAfterWrite = (activeChanged: boolean): void => {
  const calls = useCallsStore.getState();
  void calls.refreshQueuedCallLists();
  if (activeChanged) void calls.fetchCalls({ bypassCache: true });
};

export const useCallQueueActionsStore = create<CallQueueActionsState>()((set) => {
  const run = async (callId: string, label: string, write: () => Promise<unknown>, activeChanged: boolean): Promise<QueueActionOutcome> => {
    set({ busyCallId: callId });
    try {
      assertV4Success(await write());
      refreshAfterWrite(activeChanged);
      return { ok: true, error: null };
    } catch (error) {
      const dataError = toDataError(error);
      getDataLogger().warn({ message: label, context: { code: dataError.code, status: dataError.status } });
      return { ok: false, error: dataError };
    } finally {
      set({ busyCallId: null });
    }
  };

  return {
    ...initialData(),

    dispatchNow: (callId, options = {}) =>
      run(
        callId,
        'Dispatch call now failed',
        () =>
          dispatchCallNow(getDataApiContext(), {
            CallId: callId,
            ...(options.dispatchList ? { DispatchList: options.dispatchList } : {}),
            ...(options.unitResponseCodes ? { UnitResponseCodes: options.unitResponseCodes } : {}),
          }),
        true
      ),

    cancelPending: (callId) => run(callId, 'Cancelling a pending call failed', () => closeCallWith(getDataApiContext(), { callId, type: CANCELLED_STATE, sendNotification: false }), false),

    dismissAsSpam: (callId, blockSender) =>
      run(
        callId,
        'Dismissing an intake call as spam failed',
        async () => {
          const result = await dismissIntakeCallAsSpam(getDataApiContext(), { CallId: Number(callId), BlockSender: blockSender });

          // NotFound / NotPending arrive as a 200 `not_found` envelope, which is no failure to assertV4Success: the call was not dismissed.
          if (result?.Data?.Outcome !== IntakeDismissOutcomes.Dismissed && result?.Status !== 'failure') throw new Error(`Intake call not dismissed: ${result?.Data?.Outcome ?? 'no outcome'}`);

          return result;
        },
        false
      ),
  };
});

registerDataStoreReset<CallQueueActionsState>('call-queue-actions', useCallQueueActionsStore, initialData);
