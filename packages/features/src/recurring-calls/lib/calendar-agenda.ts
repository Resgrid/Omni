import { toZonedWallClock, type WallClock, zonedWallClockToUtc } from '@resgrid/core/utils/dates';
import type { RecurringCallsCalendarWindow, RecurringOccurrenceAction } from '@resgrid/data';
import { type ScheduledCallCalendarEntryData, ScheduledCallCalendarEntryKind } from '@resgrid/models';

import { wallClockDay } from './schedule-format';

/** Days the agenda shows at once (Core reads at most 100 days per request). */
export const AGENDA_DAYS = 14;

/** Days before the start day that are still shown, so yesterday's missed or held occurrences stay in view. */
export const AGENDA_LOOKBACK_DAYS = 1;

const pad = (value: number): string => String(value).padStart(2, '0');

const toDayKey = (year: number, month: number, day: number): string => `${year}-${pad(month)}-${pad(day)}`;

/** A "yyyy-MM-dd" day as its parts; month 1–12. */
const dayParts = (day: string): Pick<WallClock, 'year' | 'month' | 'day'> => {
  const [year = 1970, month = 1, date = 1] = day.split('-').map((part) => Number.parseInt(part, 10));

  return { year, month, day: date };
};

/**
 * The department calendar day ("yyyy-MM-dd") `instant` falls on in the department's zone (the device's when the department
 * has none). The agenda pages by these days, the same days its entries are grouped by.
 */
export const departmentDay = (instant: Date, timeZone: string | null | undefined): string => {
  const wall = toZonedWallClock(instant, timeZone);

  return toDayKey(wall.year, wall.month, wall.day);
};

/** A "yyyy-MM-dd" day moved by whole calendar days. */
export const addDays = (day: string, days: number): string => {
  const parts = dayParts(day);
  const moved = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));

  return toDayKey(moved.getUTCFullYear(), moved.getUTCMonth() + 1, moved.getUTCDate());
};

/** The instant the department's day begins (its midnight; a daylight-saving gap moves it forward). */
const dayStart = (day: string, timeZone: string | null | undefined): Date => zonedWallClockToUtc({ ...dayParts(day), hour: 0, minute: 0, second: 0 }, timeZone);

/**
 * The calendar request for the agenda starting on the department day `from`: the lookback day's midnight through the
 * midnight `AGENDA_DAYS` later, both in the department's zone, as UTC instants. The request covers exactly the days shown,
 * wherever the desk is.
 */
export function agendaWindow(from: string, timeZone: string | null | undefined): RecurringCallsCalendarWindow {
  return { start: dayStart(addDays(from, -AGENDA_LOOKBACK_DAYS), timeZone).toISOString(), end: dayStart(addDays(from, AGENDA_DAYS), timeZone).toISOString() };
}

/** The first and last day an agenda shows ("yyyy-MM-dd"). */
export interface AgendaRange {
  first: string;
  last: string;
}

/** The department days the agenda starting on `from` shows. */
export const agendaRange = (from: string): AgendaRange => ({ first: addDays(from, -AGENDA_LOOKBACK_DAYS), last: addDays(from, AGENDA_DAYS - 1) });

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
