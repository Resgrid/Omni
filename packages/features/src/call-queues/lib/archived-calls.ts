import { CLOSE_CALL_TYPES } from '@resgrid/features/calls';
import type { CallResultData } from '@resgrid/models';

/** The close types an archived call can have, Closed (1) through False Alarm (7), with the close sheet's labels. */
export const ARCHIVED_CALL_STATES: readonly { value: number; labelKey: string }[] = CLOSE_CALL_TYPES;

/** The translation key for an archived call's close type, or null for a state that is not one. */
export const archivedCallStateLabelKey = (state: number | string | null | undefined): string | null => ARCHIVED_CALL_STATES.find((entry) => entry.value === Number(state))?.labelKey ?? null;

export interface ArchivedCallFilters {
  /** Free text; every word must appear somewhere in the call (number, name, nature, notes, address, ids, contact). */
  query: string;
  /** Close types to keep; empty keeps all. */
  states: number[];
  /** Priority ids to keep; empty keeps all. */
  priorities: number[];
  /** Call type names to keep; empty keeps all. */
  types: string[];
  /** First day (YYYY-MM-DD, department calendar) a call may have been logged on; empty for no limit. */
  fromDate: string;
  /** Last day (YYYY-MM-DD) a call may have been logged on; empty for no limit. */
  toDate: string;
}

export const EMPTY_ARCHIVED_CALL_FILTERS: ArchivedCallFilters = { query: '', states: [], priorities: [], types: [], fromDate: '', toDate: '' };

/** How many filters narrow the list (search text not counted). */
export const countActiveArchivedCallFilters = (filters: ArchivedCallFilters): number =>
  (filters.states.length > 0 ? 1 : 0) + (filters.priorities.length > 0 ? 1 : 0) + (filters.types.length > 0 ? 1 : 0) + (filters.fromDate || filters.toDate ? 1 : 0);

const searchableText = (call: CallResultData): string =>
  [call.Number, call.CallId, call.Name, call.Nature, call.Note, call.Address, call.Type, call.DestinationName, call.IncidentId, call.ReferenceId, call.ExternalId, call.ContactName, call.ContactInfo]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .join('\n')
    .toLowerCase();

/** The calendar day a call was logged, YYYY-MM-DD in department time (LoggedOn is department-local). */
const loggedOnDay = (call: CallResultData): string => (call.LoggedOn || call.LoggedOnUtc || '').slice(0, 10);

/** The calls that pass every filter, in the order given. */
export const filterArchivedCalls = (calls: readonly CallResultData[], filters: ArchivedCallFilters): CallResultData[] => {
  const terms = filters.query.toLowerCase().split(/\s+/).filter(Boolean);
  const states = new Set(filters.states);
  const priorities = new Set(filters.priorities);
  const types = new Set(filters.types);
  return calls.filter((call) => {
    if (states.size > 0 && !states.has(Number(call.State))) return false;
    if (priorities.size > 0 && !priorities.has(call.Priority)) return false;
    if (types.size > 0 && !types.has(call.Type || '')) return false;
    if (filters.fromDate || filters.toDate) {
      const day = loggedOnDay(call);
      if (!day) return false;
      if (filters.fromDate && day < filters.fromDate) return false;
      if (filters.toDate && day > filters.toDate) return false;
    }
    if (terms.length > 0) {
      const text = searchableText(call);
      return terms.every((term) => text.includes(term));
    }
    return true;
  });
};

/** The call types the loaded calls carry, A-Z: archived calls can have types the department has since removed. */
export const archivedCallTypes = (calls: readonly CallResultData[]): string[] =>
  Array.from(new Set(calls.map((call) => call.Type).filter((type): type is string => typeof type === 'string' && type.length > 0))).sort((a, b) => a.localeCompare(b));

export const toggled = <T>(values: readonly T[], value: T): T[] => (values.includes(value) ? values.filter((entry) => entry !== value) : [...values, value]);
