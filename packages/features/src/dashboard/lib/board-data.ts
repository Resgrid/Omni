import { parseDateISOString, parseUtcMs } from '@resgrid/core/utils/dates';
import { ActionBaseTypes, isStatusResponding, resolveCurrentStatusId, staffingAvailability, statusAvailability, toBaseTypeNumber } from '@resgrid/features/status';
import type { CallPriorityResultData, CallResultData, DispatchedEventResultData, NoteResultData, PersonnelInfoResultData, StatusesResultData, UnitInfoResultData } from '@resgrid/models';

import type { NotesWidgetSettings, PersonnelWidgetSettings, ScheduledCallsWidgetSettings } from './widget-settings';

// ------------------------------------------------------------------------------------------------ personnel

/** Status meaning "not responding" (BaseType 1). Decided by meaning, never by the department's name for it. */
const NOT_RESPONDING_BASE_TYPE = 1;

/**
 * The personnel rows the widget shows: hidden groups removed, then BigBoard's three options by MEANING (the legacy
 * widget compared status text, so a department that renamed "Responding" broke them). Responding people float to the
 * top when asked; otherwise the server's order is kept.
 */
export function selectPersonnelRows(
  personnel: readonly PersonnelInfoResultData[],
  settings: Pick<PersonnelWidgetSettings, 'hideGroups' | 'hideNotResponding' | 'hideUnavailable' | 'sortRespondingToTop'>
): PersonnelInfoResultData[] {
  const hidden = new Set(settings.hideGroups);
  const rows = personnel.filter((person) => {
    if (person.GroupId && hidden.has(String(person.GroupId))) return false;
    if (settings.hideNotResponding && toBaseTypeNumber(person.StatusBaseType) === NOT_RESPONDING_BASE_TYPE) return false;
    if (settings.hideUnavailable && staffingAvailability(person.StaffingBaseType) === 'unavailable') return false;
    return true;
  });
  if (!settings.sortRespondingToTop) return rows;
  const responding = (person: PersonnelInfoResultData): number => (isStatusResponding(person.StatusBaseType) ? 0 : 1);
  return rows
    .map((person, index) => ({ person, index }))
    .sort((a, b) => responding(a.person) - responding(b.person) || a.index - b.index)
    .map(({ person }) => person);
}

export interface OptionCount {
  option: StatusesResultData;
  count: number;
}

/**
 * People per status (or staffing) option. Each person is matched to an option by the server's id first and by the
 * status meaning second (`resolveCurrentStatusId`), never by its text (BigBoard counted by name).
 */
export function countByOption(personnel: readonly PersonnelInfoResultData[], options: readonly StatusesResultData[], kind: 'status' | 'staffing'): OptionCount[] {
  const counts = new Map<string, number>();
  for (const person of personnel) {
    const current = kind === 'status' ? { StateId: person.StatusId, BaseType: person.StatusBaseType } : { StateId: person.StaffingId, BaseType: person.StaffingBaseType };
    const optionId = resolveCurrentStatusId(options, current);
    if (optionId !== null) counts.set(optionId, (counts.get(optionId) ?? 0) + 1);
  }
  return options.map((option) => ({ option, count: counts.get(String(option.Id).trim()) ?? 0 }));
}

// ------------------------------------------------------------------------------------------------ units

export interface UnitsSummary {
  total: number;
  available: number;
  responding: number;
  onScene: number;
}

/** Dispatched and moving, not yet at the incident (BigBoard's grouping, which mirrors the server's AvailabilityMatrix). */
const UNIT_RESPONDING: ReadonlySet<number> = new Set([ActionBaseTypes.Dispatched, ActionBaseTypes.Responding, ActionBaseTypes.Enroute, ActionBaseTypes.Staging]);
/** Working the incident or the transport that follows it. */
const UNIT_ON_SCENE: ReadonlySet<number> = new Set([
  ActionBaseTypes.OnScene,
  ActionBaseTypes.MadeContact,
  ActionBaseTypes.Investigating,
  ActionBaseTypes.Searching,
  ActionBaseTypes.AtPatient,
  ActionBaseTypes.Loading,
  ActionBaseTypes.Transporting,
  ActionBaseTypes.Delivering,
  ActionBaseTypes.AtHospital,
]);

/** Unit counts by what each status means (BigBoard once compared the unit TYPE id, so every counter read zero). */
export function summarizeUnits(units: readonly Pick<UnitInfoResultData, 'CurrentStatusBaseType'>[]): UnitsSummary {
  let available = 0;
  let responding = 0;
  let onScene = 0;
  for (const unit of units) {
    const baseType = toBaseTypeNumber(unit.CurrentStatusBaseType);
    if (baseType === null) continue;
    if (UNIT_RESPONDING.has(baseType)) responding += 1;
    else if (UNIT_ON_SCENE.has(baseType)) onScene += 1;
    else if (statusAvailability(baseType) === 'available') available += 1;
  }
  return { total: units.length, available, responding, onScene };
}

// ------------------------------------------------------------------------------------------------ calls

/**
 * Compares two priorities for "most urgent first": the meaning (`BaseType` 0 Low … 3 Emergency) decides, then the
 * department's sort order; without any meaning (older servers) the built-in ids (0 Low … 3 Emergency) are compared.
 */
export function comparePriorityUrgency(a: number, b: number, prioritiesById: ReadonlyMap<number, CallPriorityResultData>): number {
  const pa = prioritiesById.get(a);
  const pb = prioritiesById.get(b);
  const ba = toBaseTypeNumber(pa?.BaseType);
  const bb = toBaseTypeNumber(pb?.BaseType);
  const hasA = ba !== null && ba >= 0;
  const hasB = bb !== null && bb >= 0;
  if (!hasA && !hasB) return b - a;
  if (hasA !== hasB) return hasA ? -1 : 1;
  return (bb as number) - (ba as number) || (pa?.Sort ?? 0) - (pb?.Sort ?? 0);
}

export interface CallsSummaryRow {
  priority: CallPriorityResultData;
  count: number;
}

/** Active calls per priority, keyed by id (two priorities can share a name). `priorityIds` picks and orders rows; `max` 0 = all. */
export function summarizeCallPriorities(
  calls: readonly Pick<CallResultData, 'Priority'>[],
  priorities: readonly CallPriorityResultData[],
  options: { priorityIds: readonly number[]; maxPrioritiesToShow: number }
): CallsSummaryRow[] {
  const active = priorities.filter((priority) => !priority.IsDeleted);
  const sorted = [...active].sort((a, b) => a.Sort - b.Sort || a.Id - b.Id);
  const selected = options.priorityIds.length > 0 ? options.priorityIds.map((id) => active.find((priority) => priority.Id === id)).filter((priority): priority is CallPriorityResultData => !!priority) : sorted;
  const limited = options.maxPrioritiesToShow > 0 ? selected.slice(0, options.maxPrioritiesToShow) : selected;
  return limited.map((priority) => ({ priority, count: calls.filter((call) => call.Priority === priority.Id).length }));
}

/** The most recently logged call (by the shared UTC parser), or null. */
export function mostRecentCall<T extends Pick<CallResultData, 'LoggedOnUtc' | 'LoggedOn'>>(calls: readonly T[]): T | null {
  let best: T | null = null;
  let bestAt = -Infinity;
  for (const call of calls) {
    const at = parseUtcMs(call.LoggedOnUtc || call.LoggedOn) ?? -Infinity;
    if (best === null || at > bestAt) {
      best = call;
      bestAt = at;
    }
  }
  return best;
}

// ------------------------------------------------------------------------------------------------ notes

/** A board shows at most this many notes. */
export const MAX_NOTES = 20;

/** Unexpired notes in the configured category (BigBoard ignored its category settings; honoured now), newest first. */
export function selectNotes(notes: readonly NoteResultData[], settings: NotesWidgetSettings, now: number): NoteResultData[] {
  const category = settings.category.trim().toLowerCase();
  return notes
    .filter((note) => {
      // Note dates are department-local wall clock.
      const expires = note.ExpiresOn ? parseDateISOString(note.ExpiresOn) : null;
      if (expires && expires.getTime() <= now) return false;
      if (!category) return true;
      const noteCategory = (note.Category ?? '').trim().toLowerCase();
      return noteCategory ? noteCategory === category : settings.includeUncategorized;
    })
    .sort((a, b) => (parseDateISOString(b.AddedOn)?.getTime() ?? 0) - (parseDateISOString(a.AddedOn)?.getTime() ?? 0))
    .slice(0, MAX_NOTES);
}

// ------------------------------------------------------------------------------------------------ scheduled calls

/** When a scheduled call goes active (UTC ms): dispatch time, then scheduled time, then logged time. */
export const scheduledAt = (call: Pick<CallResultData, 'DispatchedOnUtc' | 'ScheduledOnUtc' | 'LoggedOnUtc'>): number | null =>
  parseUtcMs(call.DispatchedOnUtc) ?? parseUtcMs(call.ScheduledOnUtc) ?? parseUtcMs(call.LoggedOnUtc);

/** Minutes until the call goes active (negative when overdue); null when no time is known. */
export const minutesUntilActive = (call: Pick<CallResultData, 'DispatchedOnUtc' | 'ScheduledOnUtc' | 'LoggedOnUtc'>, now: number): number | null => {
  const at = scheduledAt(call);
  return at === null ? null : (at - now) / 60000;
};

/** The urgency colour for a scheduled call (red/yellow/green thresholds in minutes, default colour beyond). */
export const scheduledUrgencyColor = (
  minutes: number | null,
  settings: Pick<ScheduledCallsWidgetSettings, 'colorThresholdRedMinutes' | 'colorThresholdYellowMinutes' | 'colorThresholdGreenMinutes' | 'colorRedHex' | 'colorYellowHex' | 'colorGreenHex' | 'colorDefaultHex'>
): string => {
  if (minutes === null) return settings.colorDefaultHex;
  if (minutes <= settings.colorThresholdRedMinutes) return settings.colorRedHex;
  if (minutes <= settings.colorThresholdYellowMinutes) return settings.colorYellowHex;
  if (minutes <= settings.colorThresholdGreenMinutes) return settings.colorGreenHex;
  return settings.colorDefaultHex;
};

const dispatchKind = (type: string | null | undefined): 'personnel' | 'unit' | 'group' | 'role' | null => {
  const lower = (type ?? '').toLowerCase();
  if (lower === 'personnel' || lower === 'user') return 'personnel';
  if (lower === 'unit') return 'unit';
  if (lower === 'group' || lower === 'station') return 'group';
  if (lower === 'role') return 'role';
  return null;
};

/**
 * Scheduled calls after the board's filters (a call matches when one of its dispatches matches each active filter
 * kind) and sort. Calls whose dispatches are not loaded yet only pass when no filter is set.
 */
export function selectScheduledCalls(
  calls: readonly CallResultData[],
  dispatchesByCall: Readonly<Record<string, readonly DispatchedEventResultData[] | undefined>>,
  prioritiesById: ReadonlyMap<number, CallPriorityResultData>,
  settings: Pick<ScheduledCallsWidgetSettings, 'filterGroupIds' | 'filterUnitIds' | 'filterPersonnelIds' | 'filterRoleIds' | 'sortBy' | 'sortOrder'>
): CallResultData[] {
  const filters = { group: settings.filterGroupIds, unit: settings.filterUnitIds, personnel: settings.filterPersonnelIds, role: settings.filterRoleIds };
  const active = (Object.keys(filters) as (keyof typeof filters)[]).filter((kind) => filters[kind].length > 0);
  const filtered =
    active.length === 0
      ? [...calls]
      : calls.filter((call) => {
          const dispatches = dispatchesByCall[call.CallId] ?? [];
          return active.every((kind) =>
            dispatches.some(
              (dispatch) => dispatchKind(dispatch.Type) === kind && (filters[kind].includes(String(dispatch.Id)) || (kind === 'group' && !!dispatch.GroupId && filters.group.includes(String(dispatch.GroupId))))
            )
          );
        });
  const direction = settings.sortOrder === 'desc' ? -1 : 1;
  return filtered.sort((a, b) => {
    let cmp = 0;
    if (settings.sortBy === 'priority') cmp = -comparePriorityUrgency(a.Priority, b.Priority, prioritiesById);
    else if (settings.sortBy === 'name') cmp = (a.Name || '').localeCompare(b.Name || '');
    else cmp = (scheduledAt(a) ?? Number.MAX_SAFE_INTEGER) - (scheduledAt(b) ?? Number.MAX_SAFE_INTEGER);
    return cmp * direction;
  });
}
