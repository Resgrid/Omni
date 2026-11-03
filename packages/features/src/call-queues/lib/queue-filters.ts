import { matchesCallQuery } from '@resgrid/features/calls';
import type { CallResultData } from '@resgrid/models';

/** The queue search: call id, number, name, nature, address, type or note contains the text. */
export const matchesQueueQuery = (call: CallResultData, query: string): boolean => {
  const needle = query.trim().toLowerCase();
  return !needle || call.CallId.toLowerCase().includes(needle) || matchesCallQuery(call, query);
};

/** When a scheduled call goes out (UTC wire value): the calls module owns the rule; re-exported for the queue screens. */
export { scheduledDispatchUtc } from '@resgrid/features/calls';
