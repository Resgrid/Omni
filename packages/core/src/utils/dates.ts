import { format as formatWithDateFns } from 'date-fns';

// Dates (AGENTS.md, resgrid-v4-api skill): instants are UTC on the wire; department-local time is for display and
// wall-clock input only. `*Utc` fields sometimes arrive WITHOUT a zone designator ("2025-08-06T17:30:00") and
// `new Date()` would read those as device-local time, so they always go through parseApiUtcDate.

const ZONE_DESIGNATOR = /(?:[zZ]|[+-]\d{2}(?::?\d{2})?)$/;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** True when an ISO-like timestamp carries "Z" or a ±hh[:mm] offset. */
export const hasTimeZoneDesignator = (value: string): boolean => /\d[T ]\d{2}:\d{2}/.test(value) && ZONE_DESIGNATOR.test(value.trim());

/** Normalises what JS engines (Hermes included) parse reliably: "T" separator, ≤ 3 fractional digits, ±HH:MM. */
const normalizeIso = (value: string): string =>
  value
    .trim()
    .replace(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})/, '$1T$2')
    .replace(/(\.\d{3})\d+/, '$1')
    .replace(/([+-]\d{2})(\d{2})$/, '$1:$2')
    .replace(/(T[\d:.]+[+-]\d{2})$/, '$1:00');

/**
 * Parses a server UTC timestamp. Zone-less strings are UTC (not device-local); strings with Z or an offset keep
 * it; a date-only string is UTC midnight; Dates pass through; epoch milliseconds are accepted. Null when unparseable.
 */
export function parseApiUtcDate(input: unknown): Date | null {
  if (input === null || input === undefined || input === '') return null;
  if (input instanceof Date) return Number.isNaN(input.getTime()) ? null : input;
  if (typeof input === 'number') return Number.isFinite(input) ? new Date(input) : null;
  if (typeof input !== 'string') return null;

  let value = normalizeIso(input);
  if (!value) return null;
  if (DATE_ONLY.test(value)) value = `${value}T00:00:00Z`;
  else if (!ZONE_DESIGNATOR.test(value)) value = `${value}Z`;

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Epoch milliseconds of a server UTC timestamp (IC's parseUtcMs), or null. */
export function parseUtcMs(value: unknown): number | null {
  return parseApiUtcDate(value)?.getTime() ?? null;
}

/** ISO 8601 UTC with "Z", for the wire. */
export function toApiUtcString(date: Date): string {
  return date.toISOString();
}

/**
 * Parses a LOCAL wall-clock timestamp (Responder's parseDateISOString): a zone-less value keeps its clock digits
 * in device-local time (date-only = local midnight), while a value with Z or an offset is an exact instant.
 * Use for the zone-less local fields (`LoggedOn`) and calendar dates; use parseApiUtcDate for `*Utc` fields.
 * Null when unparseable (Dispatch's null-safe variant).
 */
export function parseDateISOString(input: string | null | undefined): Date | null {
  if (!input) return null;
  const s = input.trim();
  if (hasTimeZoneDesignator(s)) {
    const native = new Date(normalizeIso(s));
    if (!Number.isNaN(native.getTime())) return native;
  }
  const [year, month, day, hour = '0', minute = '0', second = '0'] = s.split(/\D/);
  if (!year || !month || !day) return null;
  const date = new Date(Number(year), Number(month) - 1, Number(day), Number(hour) || 0, Number(minute) || 0, Number(second) || 0);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * date-fns `format` that never throws (Unit's safeFormatDate): API date fields can be empty or malformed and
 * date-fns throws RangeError on an Invalid Date, crashing the screen. Zone-less strings are read as local wall
 * clock; pass `{ utc: true }` for `*Utc` fields.
 */
export function safeFormatDate(input: unknown, formatStr: string, fallback = '--', options: { utc?: boolean } = {}): string {
  const date = options.utc ? parseApiUtcDate(input) : input instanceof Date ? input : typeof input === 'number' ? new Date(input) : typeof input === 'string' ? parseDateISOString(input) : null;
  if (!date || Number.isNaN(date.getTime())) return fallback;
  try {
    return formatWithDateFns(date, formatStr);
  } catch {
    return fallback;
  }
}

const pad2 = (value: number): string => (value < 10 ? `0${value}` : String(value));

const monthName = (date: Date, style: 'long' | 'short', locale?: string): string => {
  try {
    return new Intl.DateTimeFormat(locale ?? 'en-US', { month: style }).format(date);
  } catch {
    return String(date.getMonth() + 1);
  }
};

const shortZoneName = (date: Date, locale?: string): string | undefined => {
  try {
    const part = new Intl.DateTimeFormat(locale ?? 'en-US', { timeZoneName: 'short' }).formatToParts(date).find((p) => p.type === 'timeZoneName');
    return part?.value;
  } catch {
    return undefined;
  }
};

/**
 * The legacy .NET-style token formatter shared by all five apps (Responder's fixed copy: "tt" before "t", hours
 * before month names so "March" keeps its "h"). Tokens: yyyy yy MMMM MMM MM dd HH H hh h mm ss tt t Z.
 * Month names come from Intl for `locale` (English by default, as before).
 */
export function formatDateForDisplay(date: Date | null | undefined, formatStr = 'MM/dd/yyyy', locale?: string): string {
  if (!date || Number.isNaN(date.getTime())) return '';
  let out = formatStr;
  const hours = date.getHours();
  const meridiem = hours > 11 ? 'pm' : 'am';
  if (out.includes('tt')) out = out.replace('tt', meridiem);
  else if (out.includes('t')) out = out.replace('t', meridiem);

  if (out.includes('HH')) out = out.replace('HH', pad2(hours));
  else if (out.includes('H')) out = out.replace('H', String(hours));
  const hours12 = hours % 12 === 0 ? 12 : hours % 12;
  if (out.includes('hh')) out = out.replace('hh', pad2(hours12));
  else if (out.includes('h')) out = out.replace('h', String(hours12));

  if (out.includes('MMMM')) out = out.replace('MMMM', monthName(date, 'long', locale));
  else if (out.includes('MMM')) out = out.replace('MMM', monthName(date, 'short', locale));
  else if (out.includes('MM')) out = out.replace('MM', pad2(date.getMonth() + 1));

  if (out.includes('yyyy')) out = out.replace('yyyy', String(date.getFullYear()));
  else if (out.includes('yy')) out = out.replace('yy', String(date.getFullYear()).slice(2));

  out = out.replace('dd', pad2(date.getDate()));
  if (out.includes('mm')) out = out.replace('mm', pad2(date.getMinutes()));
  if (out.includes('ss')) out = out.replace('ss', pad2(date.getSeconds()));
  if (out.includes('Z')) {
    const zone = shortZoneName(date, locale);
    if (zone) out = out.replace('Z', zone);
  }
  return out;
}

/** Formats a local wall-clock timestamp string; '' when it cannot be parsed (Responder's safeFormatTimestamp). */
export function safeFormatTimestamp(timestamp: string | null | undefined, formatStr: string, locale?: string): string {
  const parsed = parseDateISOString(timestamp);
  return parsed ? formatDateForDisplay(parsed, formatStr, locale) : '';
}

/** YYYY-MM-DD in device-local time. */
export function formatLocalDateString(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

// ---------------------------------------------------------------------------------------------------------
// Department-local time
// ---------------------------------------------------------------------------------------------------------

/** Common Windows zone ids (Core stores some department zones that way) mapped to IANA. */
const WINDOWS_TO_IANA: Record<string, string> = {
  UTC: 'UTC',
  'Coordinated Universal Time': 'UTC',
  'Hawaiian Standard Time': 'Pacific/Honolulu',
  'Alaskan Standard Time': 'America/Anchorage',
  'Pacific Standard Time': 'America/Los_Angeles',
  'US Mountain Standard Time': 'America/Phoenix',
  'Mountain Standard Time': 'America/Denver',
  'Central Standard Time': 'America/Chicago',
  'Eastern Standard Time': 'America/New_York',
  'US Eastern Standard Time': 'America/Indiana/Indianapolis',
  'Atlantic Standard Time': 'America/Halifax',
  'Newfoundland Standard Time': 'America/St_Johns',
  'GMT Standard Time': 'Europe/London',
  'Greenwich Standard Time': 'Atlantic/Reykjavik',
  'W. Europe Standard Time': 'Europe/Berlin',
  'Central Europe Standard Time': 'Europe/Budapest',
  'Central European Standard Time': 'Europe/Warsaw',
  'Romance Standard Time': 'Europe/Paris',
  'E. Europe Standard Time': 'Europe/Chisinau',
  'GTB Standard Time': 'Europe/Bucharest',
  'FLE Standard Time': 'Europe/Kiev',
  'AUS Eastern Standard Time': 'Australia/Sydney',
  'E. Australia Standard Time': 'Australia/Brisbane',
  'Cen. Australia Standard Time': 'Australia/Adelaide',
  'W. Australia Standard Time': 'Australia/Perth',
  'New Zealand Standard Time': 'Pacific/Auckland',
};

const isValidTimeZone = (zone: string): boolean => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone }).format(0);
    return true;
  } catch {
    return false;
  }
};

/** The device's IANA time zone. */
export function getDeviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/** An IANA zone for a department zone id (IANA or a common Windows id); the device zone when unknown. */
export function resolveTimeZone(zoneId: string | null | undefined): string {
  const id = zoneId?.trim();
  if (!id) return getDeviceTimeZone();
  if (isValidTimeZone(id)) return id;
  const mapped = WINDOWS_TO_IANA[id];
  return mapped && isValidTimeZone(mapped) ? mapped : getDeviceTimeZone();
}

export interface WallClock {
  year: number;
  /** 1–12 */
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/** The wall-clock reading of an instant in a zone (DST-aware, via Intl). */
export function toZonedWallClock(date: Date, zoneId: string | null | undefined): WallClock {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: resolveTimeZone(zoneId),
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes): number => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour') % 24, minute: get('minute'), second: get('second') };
}

/** Minutes the zone is ahead of UTC at that instant (e.g. -300 for New York in winter, -240 in summer). */
export function getTimeZoneOffsetMinutes(date: Date, zoneId: string | null | undefined): number {
  const w = toZonedWallClock(date, zoneId);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60_000);
}

/**
 * The instant a department-local wall-clock time denotes (for wall-clock input such as scheduled dispatch).
 * DST gaps resolve forward (02:30 on a spring-forward day becomes 03:30); ambiguous fall-back times take the
 * first occurrence.
 */
export function zonedWallClockToUtc(wall: WallClock, zoneId: string | null | undefined): Date {
  const naive = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second);
  // Two passes converge for every real-world zone: guess with the offset at the naive instant, then correct.
  const firstOffset = getTimeZoneOffsetMinutes(new Date(naive), zoneId);
  let candidate = naive - firstOffset * 60_000;
  const secondOffset = getTimeZoneOffsetMinutes(new Date(candidate), zoneId);
  if (secondOffset !== firstOffset) {
    const alternative = naive - secondOffset * 60_000;
    // In a gap neither guess reads back as the requested clock; prefer the later instant (forward resolution).
    const readsBack = (ms: number): boolean => {
      const w = toZonedWallClock(new Date(ms), zoneId);
      return w.hour === wall.hour && w.minute === wall.minute && w.day === wall.day;
    };
    if (readsBack(alternative) && !readsBack(candidate)) candidate = alternative;
    else if (!readsBack(alternative) && !readsBack(candidate)) candidate = Math.max(candidate, alternative);
    else if (readsBack(alternative) && readsBack(candidate)) candidate = Math.min(candidate, alternative);
  }
  return new Date(candidate);
}

/** Formats an instant in the department's zone with Intl options (display only). */
export function formatInTimeZone(date: Date | null | undefined, zoneId: string | null | undefined, options: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' }, locale?: string): string {
  if (!date || Number.isNaN(date.getTime())) return '';
  try {
    return new Intl.DateTimeFormat(locale, { ...options, timeZone: resolveTimeZone(zoneId) }).format(date);
  } catch {
    return '';
  }
}

/** Parses a server UTC timestamp and formats it in the department's zone; `fallback` when unparseable. */
export function formatUtcInDepartmentTime(input: unknown, zoneId: string | null | undefined, options?: Intl.DateTimeFormatOptions, locale?: string, fallback = ''): string {
  const date = parseApiUtcDate(input);
  return date ? formatInTimeZone(date, zoneId, options, locale) || fallback : fallback;
}
