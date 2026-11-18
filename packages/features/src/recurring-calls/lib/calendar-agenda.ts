import type { RecurringCallsCalendarWindow, RecurringOccurrenceAction } from '@resgrid/data';
import { type ScheduledCallCalendarEntryData, ScheduledCallCalendarEntryKind } from '@resgrid/models';

import { wallClockDay } from './schedule-format';

/** Days the agenda shows at once (Core answers at most 100). */
export const AGENDA_DAYS = 14;

/** Days before the start day that are still shown, so yesterday's missed or held occurrences stay in view. */
export const AGENDA_LOOKBACK_DAYS = 1;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Local midnight of the day `date` falls on. */
export const startOfDay = (date: Date): Date => new Date(date.getFullYear(), date.getMonth(), date.getDate());

/** `date` moved by whole days (calendar days, so a daylight-saving change does not shift midnight). */
export const addDays = (date: Date, days: number): Date => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);

/** The calendar request for the agenda starting on `from`: the lookback day through `AGENDA_DAYS` later, as UTC instants. */
export function agendaWindow(from: Date): RecurringCallsCalendarWindow {
  const start = addDays(startOfDay(from), -AGENDA_LOOKBACK_DAYS);
  const end = addDays(startOfDay(from), AGENDA_DAYS);

  return { start: start.toISOString(), end: end.toISOString() };
}

/** A local day as "yyyy-MM-dd". */
export const dayKey = (date: Date): string => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

/** The first and last day an agenda shows ("yyyy-MM-dd"). */
export interface AgendaRange {
  first: string;
  last: string;
}

/** The days the agenda starting on `from` shows. */
export const agendaRange = (from: Date): AgendaRange => ({ first: dayKey(addDays(from, -AGENDA_LOOKBACK_DAYS)), last: dayKey(addDays(from, AGENDA_DAYS - 1)) });

/** Whole days between two local midnights (navigation and tests). */
export const daysBetween = (a: Date, b: Date): number => Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / DAY_MS);

export interface AgendaDay {
  /** The department calendar day ("yyyy-MM-dd"). */
  day: string;
  entries: ScheduledCallCalendarEntryData[];
}

/**
 * Entries grouped by the department day they go out on, in time order. Grouped by the department's wall clock the server
 * sends (`DispatchOnLocal`), never by the device's zone, so an 08:00 transfer is on its own day wherever the desk is.
 */
export function groupAgenda(entries: readonly ScheduledCallCalendarEntryData[], recurringCallId: number | null = null): AgendaDay[] {
  const days = new Map<string, ScheduledCallCalendarEntryData[]>();
  const ordered = [...entries].sort((a, b) => (a.DispatchOnLocal ?? '').localeCompare(b.DispatchOnLocal ?? '') || (a.ScheduleName ?? a.Name ?? '').localeCompare(b.ScheduleName ?? b.Name ?? ''));

  for (const entry of ordered) {
    if (recurringCallId !== null && entry.RecurringCallId !== recurringCallId) continue;
    const day = wallClockDay(entry.DispatchOnLocal) || wallClockDay(entry.DispatchOn);
    const list = days.get(day);

    if (list) list.push(entry);
    else days.set(day, [entry]);
  }

  return [...days.entries()].map(([day, list]) => ({ day, entries: list }));
}

const KIND_LABEL_KEYS = new Map<number, string>([
  [ScheduledCallCalendarEntryKind.Scheduled, 'recurring_calls.calendar.kind_scheduled'],
  [ScheduledCallCalendarEntryKind.Dispatched, 'recurring_calls.calendar.kind_dispatched'],
  [ScheduledCallCalendarEntryKind.Cancelled, 'recurring_calls.calendar.kind_cancelled'],
  [ScheduledCallCalendarEntryKind.Projected, 'recurring_calls.calendar.kind_projected'],
  [ScheduledCallCalendarEntryKind.Skipped, 'recurring_calls.calendar.kind_skipped'],
  [ScheduledCallCalendarEntryKind.Due, 'recurring_calls.calendar.kind_due'],
  [ScheduledCallCalendarEntryKind.Missed, 'recurring_calls.calendar.kind_missed'],
  [ScheduledCallCalendarEntryKind.Held, 'recurring_calls.calendar.kind_held'],
]);

export const entryKindLabelKey = (entry: Pick<ScheduledCallCalendarEntryData, 'KindId'>): string => KIND_LABEL_KEYS.get(entry.KindId) ?? 'recurring_calls.calendar.kind_other';

/** Entries that need a dispatcher (due, missed, held) stand out. */
export const entryNeedsAttention = (entry: Pick<ScheduledCallCalendarEntryData, 'KindId'>): boolean =>
  entry.KindId === ScheduledCallCalendarEntryKind.Due || entry.KindId === ScheduledCallCalendarEntryKind.Missed || entry.KindId === ScheduledCallCalendarEntryKind.Held;

/** Occurrences with no call yet: still to come, waiting for a dispatcher, or missed. */
const WITHOUT_CALL: readonly number[] = [ScheduledCallCalendarEntryKind.Projected, ScheduledCallCalendarEntryKind.Due, ScheduledCallCalendarEntryKind.Missed];

/**
 * What a dispatcher can do with one entry (Core's occurrence rules): an occurrence without a call can be sent now, have
 * its call created to change it first, or be skipped; a skipped one can be restored. Entries that are calls open the call
 * instead, and scheduled calls that no schedule made have no occurrence actions.
 */
export function occurrenceActionsFor(entry: Pick<ScheduledCallCalendarEntryData, 'KindId' | 'RecurringCallId' | 'OccurrenceOn' | 'CallId'>): RecurringOccurrenceAction[] {
  if (!entry.RecurringCallId || !entry.OccurrenceOn) return [];

  if (entry.KindId === ScheduledCallCalendarEntryKind.Skipped) return ['restore'];

  return WITHOUT_CALL.includes(entry.KindId) && !entry.CallId ? ['dispatch', 'create', 'skip'] : [];
}
