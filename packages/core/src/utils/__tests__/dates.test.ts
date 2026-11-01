// Zone-less server timestamps must never be read in device-local time. Assertions compare instants (toISOString),
// so they hold in any machine zone; on a machine with a non-zero offset a local-time misparse fails them.

import {
  formatDateForDisplay,
  formatInTimeZone,
  formatLocalDateString,
  formatUtcInDepartmentTime,
  getDeviceTimeZone,
  getTimeZoneOffsetMinutes,
  hasTimeZoneDesignator,
  parseApiUtcDate,
  parseDateISOString,
  parseUtcMs,
  resolveTimeZone,
  safeFormatDate,
  safeFormatTimestamp,
  toApiUtcString,
  toZonedWallClock,
  zonedWallClockToUtc,
} from '../dates';

describe('parseApiUtcDate', () => {
  it('treats a zone-less *Utc value as UTC, not device-local', () => {
    expect(parseApiUtcDate('2025-08-06T17:30:00')?.toISOString()).toBe('2025-08-06T17:30:00.000Z');
  });

  it('keeps an explicit Z or offset', () => {
    expect(parseApiUtcDate('2025-08-06T17:30:00Z')?.toISOString()).toBe('2025-08-06T17:30:00.000Z');
    expect(parseApiUtcDate('2025-08-06T13:30:00-04:00')?.toISOString()).toBe('2025-08-06T17:30:00.000Z');
    expect(parseApiUtcDate('2025-08-06T13:30:00-0400')?.toISOString()).toBe('2025-08-06T17:30:00.000Z');
    expect(parseApiUtcDate('2025-08-06T13:30:00-04')?.toISOString()).toBe('2025-08-06T17:30:00.000Z');
  });

  it('accepts .NET 7-digit fractions, a space separator and date-only values', () => {
    expect(parseApiUtcDate('2025-08-06T17:30:00.1234567')?.toISOString()).toBe('2025-08-06T17:30:00.123Z');
    expect(parseApiUtcDate('2025-08-06 17:30:00')?.toISOString()).toBe('2025-08-06T17:30:00.000Z');
    expect(parseApiUtcDate('2025-08-06')?.toISOString()).toBe('2025-08-06T00:00:00.000Z');
  });

  it('is DST-independent: the same zone-less instant in winter and summer', () => {
    expect(parseApiUtcDate('2026-01-15T12:00:00')?.toISOString()).toBe('2026-01-15T12:00:00.000Z');
    expect(parseApiUtcDate('2026-07-15T12:00:00')?.toISOString()).toBe('2026-07-15T12:00:00.000Z');
    // Inside the spring-forward gap in New York: still a valid UTC instant.
    expect(parseApiUtcDate('2026-03-08T02:30:00')?.toISOString()).toBe('2026-03-08T02:30:00.000Z');
  });

  it('passes Dates and epoch ms through and returns null for junk', () => {
    const d = new Date('2026-01-01T00:00:00Z');
    expect(parseApiUtcDate(d)).toBe(d);
    expect(parseApiUtcDate(d.getTime())?.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(parseApiUtcDate('')).toBeNull();
    expect(parseApiUtcDate(null)).toBeNull();
    expect(parseApiUtcDate(undefined)).toBeNull();
    expect(parseApiUtcDate('not a date')).toBeNull();
    expect(parseApiUtcDate(new Date('x'))).toBeNull();
    expect(parseApiUtcDate({})).toBeNull();
  });

  it('parseUtcMs returns epoch ms or null (IC)', () => {
    expect(parseUtcMs('2025-08-06T17:30:00')).toBe(Date.UTC(2025, 7, 6, 17, 30, 0));
    expect(parseUtcMs('2025-08-06T17:30:00Z')).toBe(Date.UTC(2025, 7, 6, 17, 30, 0));
    expect(parseUtcMs(null)).toBeNull();
    expect(parseUtcMs('garbage')).toBeNull();
  });

  it('serialises for the wire with Z', () => {
    expect(toApiUtcString(new Date(Date.UTC(2026, 0, 2, 3, 4, 5)))).toBe('2026-01-02T03:04:05.000Z');
  });

  it('detects zone designators only on timestamps', () => {
    expect(hasTimeZoneDesignator('2026-07-19T04:13:22Z')).toBe(true);
    expect(hasTimeZoneDesignator('2026-07-19T04:13:22+02:00')).toBe(true);
    expect(hasTimeZoneDesignator('2026-07-19T04:13:22')).toBe(false);
    expect(hasTimeZoneDesignator('2026-07-19')).toBe(false);
  });
});

describe('parseDateISOString (Responder, local wall clock)', () => {
  it('respects an explicit UTC timezone instead of reading the clock digits as local', () => {
    expect(parseDateISOString('2026-07-19T04:13:22Z')?.getTime()).toBe(new Date('2026-07-19T04:13:22Z').getTime());
  });

  it('respects explicit, hour-only and colon-less offsets', () => {
    expect(parseDateISOString('2026-07-19T04:13:22-04:00')?.getTime()).toBe(new Date('2026-07-19T04:13:22-04:00').getTime());
    expect(parseDateISOString('2026-07-19T04:13:22-04')?.getTime()).toBe(new Date('2026-07-19T04:13:22-04:00').getTime());
    expect(parseDateISOString('2026-07-19T04:13:22+0400')?.getTime()).toBe(new Date('2026-07-19T04:13:22+04:00').getTime());
  });

  it('parses date-only strings as local midnight and offset-less datetimes as local time', () => {
    const day = parseDateISOString('2026-07-19');
    expect([day?.getFullYear(), day?.getMonth(), day?.getDate(), day?.getHours()]).toEqual([2026, 6, 19, 0]);
    const time = parseDateISOString('2026-07-19T09:30:00');
    expect([time?.getHours(), time?.getMinutes()]).toEqual([9, 30]);
  });

  it('returns null instead of throwing for bad input (Dispatch)', () => {
    expect(parseDateISOString('')).toBeNull();
    expect(parseDateISOString(null)).toBeNull();
    expect(parseDateISOString('2026')).toBeNull();
  });
});

describe('formatDateForDisplay (Responder)', () => {
  it('renders a real hour and am/pm (regression: "h" and "amt"/"pmt")', () => {
    expect(formatDateForDisplay(new Date(2026, 6, 19, 14, 5, 0), 'MMM dd, yyyy h:mm tt')).toBe('Jul 19, 2026 2:05 pm');
    expect(formatDateForDisplay(new Date(2026, 6, 19, 9, 30, 0), 'MMM dd, yyyy h:mm tt')).toBe('Jul 19, 2026 9:30 am');
  });

  it('handles midnight and noon in 12-hour format', () => {
    expect(formatDateForDisplay(new Date(2026, 0, 1, 0, 5, 0), 'h:mm tt')).toBe('12:05 am');
    expect(formatDateForDisplay(new Date(2026, 0, 1, 12, 5, 0), 'h:mm tt')).toBe('12:05 pm');
  });

  it('does not corrupt month names containing "h" (March)', () => {
    expect(formatDateForDisplay(new Date(2026, 2, 3, 8, 15, 0), 'MMMM dd, yyyy hh:mm tt')).toBe('March 03, 2026 08:15 am');
  });

  it('supports 24-hour and padded formats, and the time zone token', () => {
    expect(formatDateForDisplay(new Date(2026, 6, 19, 14, 5, 0), 'MM/dd/yyyy HH:mm')).toBe('07/19/2026 14:05');
    const summer = new Date(2026, 6, 19, 14, 5, 0);
    const zone = new Intl.DateTimeFormat('en-US', { timeZoneName: 'short' }).formatToParts(summer).find((p) => p.type === 'timeZoneName')?.value;
    expect(formatDateForDisplay(summer, 'yyyy-MM-dd HH:mm Z')).toBe(`2026-07-19 14:05 ${zone}`);
  });

  it('uses localised month names when a locale is given', () => {
    expect(formatDateForDisplay(new Date(2026, 2, 3), 'dd MMMM yyyy', 'de-DE')).toBe('03 März 2026');
  });

  it('returns an empty string for missing or invalid dates', () => {
    expect(formatDateForDisplay(null)).toBe('');
    expect(formatDateForDisplay(new Date('x'))).toBe('');
  });
});

describe('safe formatting', () => {
  it('safeFormatTimestamp parses local wall clock and returns "" on failure', () => {
    expect(safeFormatTimestamp('2026-07-19T14:05:00', 'yyyy-MM-dd HH:mm')).toBe('2026-07-19 14:05');
    expect(safeFormatTimestamp(undefined, 'yyyy-MM-dd')).toBe('');
    expect(safeFormatTimestamp('junk', 'yyyy-MM-dd')).toBe('');
  });

  it('safeFormatDate never throws (Unit) and can read *Utc fields', () => {
    expect(safeFormatDate('', 'yyyy-MM-dd')).toBe('--');
    expect(safeFormatDate('nope', 'yyyy-MM-dd', 'n/a')).toBe('n/a');
    expect(safeFormatDate(new Date(2026, 0, 2, 3, 4), 'yyyy-MM-dd HH:mm')).toBe('2026-01-02 03:04');
    const utcInstant = new Date(Date.UTC(2025, 7, 6, 17, 30));
    const localClock = `${String(utcInstant.getHours()).padStart(2, '0')}:${String(utcInstant.getMinutes()).padStart(2, '0')}`;
    expect(safeFormatDate('2025-08-06T17:30:00', 'HH:mm', '--', { utc: true })).toBe(localClock);
    expect(safeFormatDate('2025-08-06T17:30:00', 'HH:mm')).toBe('17:30');
    // date-fns throws RangeError on unescaped letters; the helper falls back instead.
    expect(safeFormatDate(new Date(2026, 0, 2), 'yyyy-nn')).toBe('--');
  });

  it('formatLocalDateString pads month and day', () => {
    expect(formatLocalDateString(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('department-local time', () => {
  it('resolves IANA ids, common Windows ids, and falls back to the device zone', () => {
    expect(resolveTimeZone('Europe/Berlin')).toBe('Europe/Berlin');
    expect(resolveTimeZone('Eastern Standard Time')).toBe('America/New_York');
    expect(resolveTimeZone('Pacific Standard Time')).toBe('America/Los_Angeles');
    expect(resolveTimeZone('Not/AZone')).toBe(getDeviceTimeZone());
    expect(resolveTimeZone(null)).toBe(getDeviceTimeZone());
  });

  it('reports DST-aware offsets', () => {
    expect(getTimeZoneOffsetMinutes(new Date('2026-01-15T12:00:00Z'), 'America/Chicago')).toBe(-360);
    expect(getTimeZoneOffsetMinutes(new Date('2026-07-15T12:00:00Z'), 'America/Chicago')).toBe(-300);
    expect(getTimeZoneOffsetMinutes(new Date('2026-07-15T12:00:00Z'), 'Asia/Kolkata')).toBe(330);
    expect(getTimeZoneOffsetMinutes(new Date('2026-07-15T12:00:00Z'), 'UTC')).toBe(0);
  });

  it('reads the wall clock of an instant in a zone', () => {
    expect(toZonedWallClock(new Date('2026-07-15T03:30:00Z'), 'Europe/London')).toEqual({ year: 2026, month: 7, day: 15, hour: 4, minute: 30, second: 0 });
    expect(toZonedWallClock(new Date('2026-07-15T03:30:00Z'), 'America/Los_Angeles')).toEqual({ year: 2026, month: 7, day: 14, hour: 20, minute: 30, second: 0 });
  });

  it('converts department wall-clock input to UTC across DST', () => {
    expect(zonedWallClockToUtc({ year: 2026, month: 1, day: 15, hour: 10, minute: 0, second: 0 }, 'America/New_York').toISOString()).toBe('2026-01-15T15:00:00.000Z');
    expect(zonedWallClockToUtc({ year: 2026, month: 7, day: 15, hour: 10, minute: 0, second: 0 }, 'America/New_York').toISOString()).toBe('2026-07-15T14:00:00.000Z');
    expect(zonedWallClockToUtc({ year: 2026, month: 7, day: 15, hour: 10, minute: 0, second: 0 }, 'Europe/Berlin').toISOString()).toBe('2026-07-15T08:00:00.000Z');
  });

  it('resolves a spring-forward gap forward and a fall-back overlap to the first occurrence', () => {
    // 2026-03-08 02:30 does not exist in New York; it becomes 03:30 EDT (07:30Z).
    expect(zonedWallClockToUtc({ year: 2026, month: 3, day: 8, hour: 2, minute: 30, second: 0 }, 'America/New_York').toISOString()).toBe('2026-03-08T07:30:00.000Z');
    // 2026-11-01 01:30 happens twice; the first (EDT, 05:30Z) wins.
    expect(zonedWallClockToUtc({ year: 2026, month: 11, day: 1, hour: 1, minute: 30, second: 0 }, 'America/New_York').toISOString()).toBe('2026-11-01T05:30:00.000Z');
  });

  it('round-trips wall clock ↔ instant', () => {
    const wall = { year: 2026, month: 10, day: 31, hour: 23, minute: 45, second: 10 };
    expect(toZonedWallClock(zonedWallClockToUtc(wall, 'Australia/Sydney'), 'Australia/Sydney')).toEqual(wall);
  });

  it('formats instants and zone-less *Utc fields in the department zone', () => {
    const at = new Date('2026-07-15T17:30:00Z');
    expect(formatInTimeZone(at, 'America/Denver', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }, 'en-US')).toBe('11:30');
    expect(formatUtcInDepartmentTime('2026-07-15T17:30:00', 'Central Standard Time', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }, 'en-US')).toBe('12:30');
    expect(formatUtcInDepartmentTime('', 'UTC', undefined, 'en-US', '--')).toBe('--');
    expect(formatInTimeZone(null, 'UTC')).toBe('');
  });
});
