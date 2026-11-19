import {
  type CallPersonCandidate,
  type CallResourceLists,
  type CallUnitCandidate,
  isPersonOnCall as isPersonOnCallLists,
  isScheduledCall,
  isUnitOnCall as isUnitOnCallLists,
  matchesCallQuery,
} from '@resgrid/features/calls';
import type { CallResultData, PersonnelInfoResultData, UnitInfoResultData } from '@resgrid/models';

import { isPersonAvailable, isUnitAvailable } from './console-stats';

/** The selected call's dispatches and released resources, when the console is filtered to a call. */
export type ConsoleCallFilter = CallResourceLists;

const lower = (value: string | null | undefined): string => (value ?? '').toLowerCase();

/** Active calls on the console (scheduled ones wait in their queue), matching the search. */
export const filterConsoleCalls = (calls: readonly CallResultData[], query: string, now: number): CallResultData[] =>
  calls.filter((call) => call.State === 0 && !isScheduledCall(call, now) && matchesCallQuery(call, query));

/**
 * A unit is on the filtered call when it was dispatched to it (by id, else by name) or its active call or status points
 * at it, unless it was released from the call (`isUnitOnCall` in calls).
 */
export const isUnitOnCall = (unit: CallUnitCandidate, filter: ConsoleCallFilter | null): boolean => filter !== null && isUnitOnCallLists(unit, filter);

/**
 * A person is on the filtered call when dispatched to it by name, through their group or a role, riding a unit dispatched
 * to it, or their status points at it, unless they were released from the call (`isPersonOnCall` in calls).
 */
export const isPersonOnCall = (person: CallPersonCandidate, filter: ConsoleCallFilter | null): boolean => filter !== null && isPersonOnCallLists(person, filter);

export interface ResourceFilterOptions {
  query: string;
  availableOnly: boolean;
  callFilter: ConsoleCallFilter | null;
}

/** The units panel's rows: on the filtered call (when filtering), matching the search, available only when toggled. */
export const filterConsoleUnits = (units: readonly UnitInfoResultData[], { query, availableOnly, callFilter }: ResourceFilterOptions): UnitInfoResultData[] => {
  const needle = query.trim().toLowerCase();
  return units.filter((unit) => {
    if (callFilter && !isUnitOnCall(unit, callFilter)) return false;
    if (availableOnly && !isUnitAvailable(unit)) return false;
    if (!needle) return true;
    const roles = (unit.Roles ?? []).map((role) => `${role.RoleName ?? ''} ${role.Name ?? ''}`).join(' ');
    return [unit.Name, unit.Type, unit.GroupName, unit.CurrentStatus, unit.Note, roles].some((value) => lower(value).includes(needle));
  });
};

/** The personnel panel's rows, filtered like the units. */
export const filterConsolePersonnel = (personnel: readonly PersonnelInfoResultData[], { query, availableOnly, callFilter }: ResourceFilterOptions): PersonnelInfoResultData[] => {
  const needle = query.trim().toLowerCase();
  return personnel.filter((person) => {
    if (callFilter && !isPersonOnCall(person, callFilter)) return false;
    if (availableOnly && !isPersonAvailable(person)) return false;
    if (!needle) return true;
    return [person.FirstName, person.LastName, `${person.FirstName} ${person.LastName}`, person.GroupName, person.Status, person.Staffing, person.IdentificationNumber, ...(person.Roles ?? [])].some((value) =>
      lower(value).includes(needle)
    );
  });
};

export interface UnitCrew {
  /** Role seats someone is assigned to. */
  filled: number;
  /** Every role seat the unit defines. */
  total: number;
  /** Who fills the seats, in the unit's role order. */
  names: string[];
}

/** The unit's role seats and who is active on them ("3/4"). */
export const getUnitCrew = (unit: Pick<UnitInfoResultData, 'Roles'> | null | undefined): UnitCrew => {
  const roles = unit?.Roles ?? [];
  const filled = roles.filter((role) => !!role?.UserId);
  return { filled: filled.length, total: roles.length, names: filled.map((role) => (role.Name ?? '').trim()).filter(Boolean) };
};

/** Strips server HTML to text for a one-line preview (never rendered as HTML). */
export const plainText = (html: string | null | undefined): string =>
  (html ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
