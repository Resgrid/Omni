import { matchesCallQuery } from '@resgrid/features/calls';
import type { CallResultData } from '@resgrid/models';

/** The queue search: call id, number, name, nature, address, type or note contains the text. */
export const matchesQueueQuery = (call: CallResultData, query: string): boolean => {
  const needle = query.trim().toLowerCase();
  return !needle || call.CallId.toLowerCase().includes(needle) || matchesCallQuery(call, query);
};

/** When a scheduled call goes out (UTC wire value): Core reports it as DispatchedOn; ScheduledOn only on newer servers. */
export const scheduledDispatchUtc = (call: Pick<CallResultData, 'ScheduledOnUtc' | 'DispatchedOnUtc'>): string => call.ScheduledOnUtc || call.DispatchedOnUtc || '';
