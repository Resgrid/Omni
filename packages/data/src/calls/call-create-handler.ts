import { getCall, getCallLocationHistory, parseUtcMs, saveCall } from '@resgrid/api';
import type { CallResultData, NewCallInput, SaveCallResult } from '@resgrid/models';

import { assertV4Success, unwrapItem } from '../core/envelope';
import { defineDataHandler } from '../core/outbox';
import { dataNow, getDataApiContext, getDataLogger } from '../core/runtime';
import { CALL_CREATE_EVENT, type CallCreatePayload, useCallsStore } from './calls-store';

/** Another call at the same location logged within this window of the queued call is a possible duplicate. */
export const DUPLICATE_CALL_WINDOW_MS = 60 * 60 * 1000;

/**
 * `SaveCall` body with the client GUID as idempotency key (plan §8.6 item 2: Core honours it once the
 * idempotent-create change ships; older servers ignore the unknown field, so the request stays valid).
 */
export type IdempotentNewCallInput = NewCallInput & { IdempotencyKey: string; ClientCallId: string };

const findPossibleDuplicates = async (serverCallId: string, createdAt: number): Promise<string[]> => {
  try {
    const history = unwrapItem(await getCallLocationHistory(getDataApiContext(), { callId: serverCallId }));
    return (history?.Calls ?? [])
      .filter((call) => call.CallId !== serverCallId)
      .filter((call) => {
        if (call.State === 0) return true;
        const loggedOn = parseUtcMs(call.LoggedOnUtc);
        return loggedOn !== null && Math.abs(loggedOn - createdAt) <= DUPLICATE_CALL_WINDOW_MS;
      })
      .map((call) => call.CallId);
  } catch {
    // Location history is a hint only; a failed lookup never blocks the sync.
    return [];
  }
};

/**
 * Offline call creation (owner decision, plan §8.5): the call is saved locally under the outbox event id
 * (client GUID) and shown as "Queued — not dispatched yet"; nobody is paged until the server accepts it.
 * On delivery the local record is replaced by the server call and the creator is told (with a
 * possible-duplicate flag). A refusal dead-letters the event: the local record stays, marked rejected,
 * for correction (`correctQueuedCall`) or discard from Pending sync.
 */
export const callCreateHandler = defineDataHandler<CallCreatePayload, SaveCallResult>({
  type: CALL_CREATE_EVENT,
  optimisticApply: (event) => {
    useCallsStore.getState().applyQueuedCall({ localId: event.id, request: event.payload.request, input: event.payload.input, createdAt: event.createdAt, state: 'queued' });
  },
  send: async (event, context) => {
    const body: IdempotentNewCallInput = { ...event.payload.input, IdempotencyKey: context.idempotencyKey, ClientCallId: event.id };
    return assertV4Success(await saveCall(getDataApiContext(), body));
  },
  afterAck: async (event, result) => {
    const callId = result?.Id ?? '';
    let serverCall: CallResultData | null = null;
    if (callId) {
      try {
        serverCall = unwrapItem(await getCall(getDataApiContext(), { callId }));
      } catch {
        getDataLogger().warn({ message: 'Queued call delivered; reading it back failed', context: { type: event.type } });
      }
    }
    const duplicateCallIds = callId ? await findPossibleDuplicates(callId, event.createdAt) : [];
    useCallsStore.getState().replaceQueuedCall(event.id, serverCall, {
      localId: event.id,
      callId,
      number: serverCall?.Number ?? '',
      syncedAt: dataNow(),
      possibleDuplicate: duplicateCallIds.length > 0,
      duplicateCallIds,
    });
    void useCallsStore.getState().fetchCalls({ bypassCache: true });
  },
  rollback: (event, reason) => {
    if (reason === 'discarded') useCallsStore.getState().removeQueuedCall(event.id);
    else useCallsStore.getState().markQueuedCallRejected(event.id);
  },
});
