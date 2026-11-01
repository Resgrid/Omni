import { formatLocalDateString, parseDateISOString } from '@resgrid/core/utils/dates';
import { type CalendarItemResultData, mapCalendarItemResultData } from '@resgrid/models';

// Calendar items carry the department's wall-clock time in `Start` / `End` (zone-less, department-local) beside the
// `*Utc` instants. The calendar is display-only, so it reads the wall clock as is (parseDateISOString keeps the digits)
// and compares calendar days as YYYY-MM-DD strings; it never shifts a time into the device's zone.

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** YYYY-MM-DD of an item's date field, without zone conversion ("2026-03-04T00:00:00Z" → "2026-03-04"). */
export function extractDatePart(value: string): string {
  const datePart = value.slice(0, 10);
  if (DATE_KEY.test(datePart)) return datePart;
  const parsed = parseDateISOString(value);
  return parsed ? formatLocalDateString(parsed) : '';
}

/** A Date at local midnight of a YYYY-MM-DD key (calendar arithmetic and display only). */
export function dateFromKey(key: string): Date | null {
  if (!DATE_KEY.test(key)) return null;
  const [year, month, day] = key.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
}

const addDaysToKey = (key: string, days: number): string => {
  const date = dateFromKey(key);
  if (!date) return key;
  date.setDate(date.getDate() + days);
  return formatLocalDateString(date);
};

/**
 * The last day (inclusive) an all-day item covers. The server uses two conventions: an end with "Z" or an offset is
 * midnight of the day AFTER the last day (exclusive); a zone-less end is midnight of the last day itself.
 */
export function resolveAllDayEndDate(end: string): string {
  const endDate = end.slice(0, 10);
  const hasZone = /(?:Z|[+-]\d{2}:\d{2})$/i.test(end.trim());
  return hasZone ? addDaysToKey(endDate, -1) : endDate;
}

/** The first and last calendar day (inclusive) an item covers. */
export function itemDayRange(item: Pick<CalendarItemResultData, 'Start' | 'End' | 'IsAllDay'>): { start: string; end: string } {
  const start = extractDatePart(item.Start);
  const rawEnd = item.End ? (item.IsAllDay ? resolveAllDayEndDate(item.End) : extractDatePart(item.End)) : start;
  return { start, end: rawEnd && rawEnd >= start ? rawEnd : start };
}

/** Whether a calendar day (YYYY-MM-DD) falls within an item, multi-day and all-day conventions included. */
export function isDateInRange(date: string, item: Pick<CalendarItemResultData, 'Start' | 'End' | 'IsAllDay'>): boolean {
  const day = date.slice(0, 10);
  const range = itemDayRange(item);
  return day >= range.start && day <= range.end;
}

/** Every calendar day an item covers (capped, so a malformed range cannot loop for years). */
export function itemDays(item: Pick<CalendarItemResultData, 'Start' | 'End' | 'IsAllDay'>, maxDays = 62): string[] {
  const range = itemDayRange(item);
  const days: string[] = [];
  let current = range.start;
  while (current && current <= range.end && days.length < maxDays) {
    days.push(current);
    current = addDaysToKey(current, 1);
  }
  return days;
}

export const todayKey = (now: Date = new Date()): string => formatLocalDateString(now);

export interface DateRange {
  start: string;
  end: string;
}

/** Today (the server widens a range to whole days). */
export const todayRange = (now: Date = new Date()): DateRange => ({ start: todayKey(now), end: todayKey(now) });

/** Today and the next seven days (Responder's "Upcoming"). */
export const upcomingRange = (now: Date = new Date()): DateRange => ({ start: todayKey(now), end: addDaysToKey(todayKey(now), 7) });

/** First to last day of a month (`month` 1–12). */
export const monthRange = (year: number, month: number): DateRange => ({ start: formatLocalDateString(new Date(year, month - 1, 1)), end: formatLocalDateString(new Date(year, month, 0)) });

/** Items with `IsMultiDay` filled in when the server left it out. */
export const normalizeItems = (items: readonly CalendarItemResultData[]): CalendarItemResultData[] => items.map(mapCalendarItemResultData);

/** The items that fall on a day, in start order. */
export const itemsOnDate = (items: readonly CalendarItemResultData[], date: string): CalendarItemResultData[] =>
  items.filter((item) => isDateInRange(date, item)).sort((a, b) => (a.Start ?? '').localeCompare(b.Start ?? ''));

/** The item's wall-clock time ("09:30"), '' when it cannot be read. */
export function formatItemTime(value: string, locale?: string): string {
  const date = parseDateISOString(value);
  return date ? date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }) : '';
}

/** A calendar day for display ("Tue, Mar 4"); `long` adds the weekday and year in full. */
export function formatDayKey(key: string, locale?: string, style: 'short' | 'long' = 'short'): string {
  const date = dateFromKey(key);
  if (!date) return key;
  return style === 'long' ? date.toLocaleDateString(locale, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : date.toLocaleDateString(locale, { weekday: 'short', month: 'short', day: 'numeric' });
}

/** Whether members can sign up (a sign-up type and not locked). */
export const canSignUp = (item: Pick<CalendarItemResultData, 'SignupType' | 'LockEditing'>): boolean => item.SignupType > 0 && !item.LockEditing;
