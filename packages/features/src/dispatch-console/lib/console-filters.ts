import { isScheduledCall, isUnitDispatchType, matchesCallQuery } from '@resgrid/features/calls';
import type { CallResultData, DispatchedEventResultData, PersonnelInfoResultData, UnitInfoResultData } from '@resgrid/models';

import { isPersonAvailable, isUnitAvailable } from './console-stats';

/** The selected call's dispatches, when the console is filtered to a call. */
export interface ConsoleCallFilter {
  callId: string;
  dispatches: readonly DispatchedEventResultData[];
}

const lower = (value: string | null | undefined): string => (value ?? '').toLowerCase();

const isPersonDispatchType = (type: string | null | undefined): boolean => {
  const value = lower(type).trim();
  return value === 'p' || value.includes('user') || value.includes('personnel');
};

/** Active calls on the console (scheduled ones wait in their queue), matching the search. */
export const filterConsoleCalls = (calls: readonly CallResultData[], query: string, now: number): CallResultData[] =>
  calls.filter((call) => call.State === 0 && !isScheduledCall(call, now) && matchesCallQuery(call, query));

/** A unit is on the filtered call when it was dispatched to it (by id, else by name) or its status points at it. */
export const isUnitOnCall = (unit: Pick<UnitInfoResultData, 'UnitId' | 'Name' | 'CurrentDestinationId' | 'ActiveCallId'>, filter: ConsoleCallFilter | null): boolean => {
  if (!filter) return false;
  if (unit.ActiveCallId === filter.callId || unit.CurrentDestinationId === filter.callId) return true;
  return filter.dispatches.some((dispatch) => isUnitDispatchType(dispatch.Type) && (dispatch.Id === unit.UnitId || lower(dispatch.Name) === lower(unit.Name)));
};

/** A person is on the filtered call when dispatched to it (by id) or their status points at it. */
export const isPersonOnCall = (person: Pick<PersonnelInfoResultData, 'UserId' | 'StatusDestinationId'>, filter: ConsoleCallFilter | null): boolean => {
  if (!filter) return false;
  if (person.StatusDestinationId === filter.callId) return true;
  return filter.dispatches.some((dispatch) => isPersonDispatchType(dispatch.Type) && dispatch.Id === person.UserId);
};

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
