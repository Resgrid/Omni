import { parseUtcMs } from '@resgrid/api';
import type { CallResultData } from '@resgrid/models';

type OrderedCall = Pick<CallResultData, 'CallId' | 'LoggedOnUtc'>;

/** Core's call ids grow with every call; a call with no numeric id (a device-local GUID) sorts as the oldest. */
const callIdOrder = (callId: string): number => {
  const id = Number(callId);

  return callId !== '' && Number.isFinite(id) ? id : Number.NEGATIVE_INFINITY;
};

const loggedOnOrder = (call: OrderedCall): number => parseUtcMs(call.LoggedOnUtc) ?? Number.NEGATIVE_INFINITY;

const descending = (a: number, b: number): number => (a === b ? 0 : a > b ? -1 : 1);

/**
 * Newest call first (every call list, call picker and status destination list in all five apps): by the time the call
 * was logged (the shared UTC parser; some `*Utc` fields arrive without "Z"), then by call id — Core's own order
 * (`OrderByDescending(LoggedOn).ThenByDescending(CallId)`). A call without a logged time goes after the dated ones.
 */
export const compareCallsNewestFirst = (a: OrderedCall, b: OrderedCall): number => descending(loggedOnOrder(a), loggedOnOrder(b)) || descending(callIdOrder(a.CallId), callIdOrder(b.CallId));

/** A newest-first copy (the input is never reordered in place; store arrays stay immutable). */
export const sortCallsNewestFirst = <T extends OrderedCall>(calls: readonly T[]): T[] => [...calls].sort(compareCallsNewestFirst);
