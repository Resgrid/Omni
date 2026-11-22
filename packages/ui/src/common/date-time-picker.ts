import { toZonedWallClock, zonedWallClockToUtc } from '@resgrid/core/utils/dates';

export type PickerMode = 'date' | 'time' | 'datetime';

const pad = (value: number) => String(value).padStart(2, '0');
export const pickerDate = (date: Date) => `${String(date.getFullYear()).padStart(4, '0')}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
export const pickerTime = (date: Date) => `${pad(date.getHours())}:${pad(date.getMinutes())}`;

// Calendar dates and deployment clock times are local values, never UTC instants.
export const parsePickerValue = (value: string, mode: PickerMode, now = new Date()): Date => {
  if (mode === 'datetime' && value) {
    // Record timestamps without an offset are UTC in the API contract.
    const parsed = new Date(/(?:Z|[+-]\d{2}:\d{2})$/i.test(value) ? value : `${value}Z`);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  const date = new Date(now);
  // A standalone clock is independent of today's daylight-saving transition.
  if (mode === 'time') date.setFullYear(2000, 0, 15);
  if (mode === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-').map(Number);
    date.setHours(12, 0, 0, 0);
    date.setFullYear(year, month - 1, day);
    if (pickerDate(date) === value) return date;
    return new Date(now);
  }
  if (mode === 'time' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    const [hour, minute] = value.split(':').map(Number);
    date.setHours(hour, minute, 0, 0);
  }
  return date;
};

export const serializePickerValue = (date: Date, mode: PickerMode) => (mode === 'date' ? pickerDate(date) : mode === 'time' ? pickerTime(date) : date.toISOString());

/**
 * A datetime picked as another zone's wall clock (the department's): the picker works on a device-local Date that holds
 * that zone's clock reading of the instant...
 */
export const toZonedPickerDate = (instant: Date, timeZone: string): Date => {
  const wall = toZonedWallClock(instant, timeZone);

  return new Date(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second);
};

/** ...and the reading picked is turned back into the instant it names in that zone. */
export const fromZonedPickerDate = (reading: Date, timeZone: string): Date =>
  zonedWallClockToUtc({ year: reading.getFullYear(), month: reading.getMonth() + 1, day: reading.getDate(), hour: reading.getHours(), minute: reading.getMinutes(), second: reading.getSeconds() }, timeZone);
