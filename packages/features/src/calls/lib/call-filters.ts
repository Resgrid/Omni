import { isRedactedValue } from '@resgrid/auth';
import type { CallResultData } from '@resgrid/models';

/** Call list view state (filters live in the feature, never in the domain store — plan §5.5). */
export interface CallListFilters {
  query: string;
  /** Empty = every priority. */
  priorityIds: number[];
  /** Call type names; empty = every type. */
  types: string[];
}

export const EMPTY_CALL_FILTERS: CallListFilters = { query: '', priorityIds: [], types: [] };

/** The list tabs. Pending and scheduled exist only when `capabilities.calls.queues` (Dispatch). */
export type CallListTab = 'active' | 'pending' | 'scheduled';

const TAG_PATTERN = /<[^>]*>/g;
const WHITESPACE_PATTERN = /\s+/g;

const searchable = (value: string | null | undefined): string => (value && !isRedactedValue(value) ? value.replace(TAG_PATTERN, ' ').replace(WHITESPACE_PATTERN, ' ').toLowerCase() : '');

export function matchesCallQuery(call: Pick<CallResultData, 'Name' | 'Nature' | 'Address' | 'Number' | 'Type' | 'Note'>, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [call.Number, call.Name, call.Nature, call.Address, call.Type, call.Note].some((field) => searchable(field).includes(needle));
}

export function filterCalls<T extends CallResultData>(calls: readonly T[], filters: CallListFilters): T[] {
  return calls.filter((call) => {
    if (filters.priorityIds.length > 0 && !filters.priorityIds.includes(call.Priority)) return false;
    if (filters.types.length > 0 && !filters.types.includes(call.Type)) return false;
    return matchesCallQuery(call, filters.query);
  });
}

export const hasActiveFilters = (filters: CallListFilters): boolean => filters.query.trim().length > 0 || filters.priorityIds.length > 0 || filters.types.length > 0;
