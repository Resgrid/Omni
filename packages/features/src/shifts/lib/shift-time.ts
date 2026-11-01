import { parseDateISOString } from '@resgrid/core/utils/dates';
import { ShiftAssignmentType, type ShiftDayResultData } from '@resgrid/models';

// Shift times (`ShiftDay`, `Start`, `End`) are department-local wall-clock strings without an offset
// (`2026-09-24T19:00:00`) and are displayed as-is: never converted through UTC. Any offset a legacy server still
// appends is dropped so the digits never shift (Responder shift-utils).

const OFFSET_SUFFIX = /(Z|[+-]\d{2}:?\d{2})$/i;

/** The wall-clock reading of a shift time as a device-local Date (same digits), or null. */
export const parseWallClock = (value: string | null | undefined): Date | null => (value ? parseDateISOString(value.trim().replace(OFFSET_SUFFIX, '')) : null);

const formatWallClock = (value: string | null | undefined, options: Intl.DateTimeFormatOptions, locale?: string): string => {
  const parsed = parseWallClock(value);
  if (!parsed) return value ?? '';
  try {
    return new Intl.DateTimeFormat(locale, options).format(parsed);
  } catch {
    return value ?? '';
  }
};

export const formatShiftTime = (value: string | null | undefined, locale?: string): string => formatWallClock(value, { hour: 'numeric', minute: '2-digit' }, locale);

export const formatShiftDate = (value: string | null | undefined, locale?: string): string => formatWallClock(value, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }, locale);

export const formatShiftLongDate = (value: string | null | undefined, locale?: string): string => formatWallClock(value, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }, locale);

export const formatMonthLabel = (month: Date, locale?: string): string => {
  try {
    return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(month);
  } catch {
    return `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`;
  }
};

/** The `YYYY-MM-DD` query format the date-range endpoints take (device-local date). */
export const toDateParam = (date: Date): string => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

/** `YYYY-MM-DD` of a wall-clock value, or '' when it cannot be parsed. */
export const getDateKey = (value: string | null | undefined): string => {
  const parsed = parseWallClock(value);
  return parsed ? toDateParam(parsed) : '';
};

export interface DateRange {
  start: string;
  end: string;
}

/** First to last day (inclusive) of the month containing `date`. */
export const getMonthRange = (date: Date): DateRange => ({
  start: toDateParam(new Date(date.getFullYear(), date.getMonth(), 1)),
  end: toDateParam(new Date(date.getFullYear(), date.getMonth() + 1, 0)),
});

export const addMonths = (date: Date, months: number): Date => new Date(date.getFullYear(), date.getMonth() + months, 1);

/** The shift ends on a later calendar day than it starts (19:00 → 07:00). */
export const isOvernightShift = (start: string | null | undefined, end: string | null | undefined): boolean => {
  const startKey = getDateKey(start);
  const endKey = getDateKey(end);
  return startKey !== '' && endKey !== '' && endKey > startKey;
};

/** A static shift (workshift) day: unit crews for a set period, loaded and traded through its own endpoints. */
export const isWorkshiftDay = (day: Pick<ShiftDayResultData, 'ShiftType'> | null | undefined): boolean => day?.ShiftType === ShiftAssignmentType.Workshift;

/** Shift days and static shift days in one list, in start order (wall-clock strings sort as text). */
export const mergeShiftDays = (shiftDays: readonly ShiftDayResultData[], workshiftDays: readonly ShiftDayResultData[]): ShiftDayResultData[] => {
  if (workshiftDays.length === 0) return [...shiftDays];
  const known = new Set(shiftDays.map((day) => `${day.ShiftType}:${day.ShiftDayId}`));
  return [...shiftDays, ...workshiftDays.filter((day) => !known.has(`${day.ShiftType}:${day.ShiftDayId}`))].sort((a, b) => (a.Start || a.ShiftDay || '').localeCompare(b.Start || b.ShiftDay || ''));
};

/** The days of a month as `YYYY-MM-DD` keys plus the weekday (0 = Sunday) of the first one. */
export const monthGrid = (month: Date): { leadingBlanks: number; days: { key: string; day: number }[] } => {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const days = Array.from({ length: count }, (_, index) => {
    const date = new Date(month.getFullYear(), month.getMonth(), index + 1);
    return { key: toDateParam(date), day: index + 1 };
  });
  return { leadingBlanks: first.getDay(), days };
};
