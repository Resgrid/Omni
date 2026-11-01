const HAS_ZONE = /(?:[zZ]|[+-]\d{2}:?\d{2})$/;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
/** .NET `DateTime.MinValue` — Core's "not set" for non-nullable dates; never a real instant. */
const DOTNET_MIN_VALUE = /^0001-01-01(?:[T ]00:00:00(?:\.0+)?)?(?:[zZ]|[+-]00:?00)?$/;

/**
 * Parses an API UTC timestamp. Core's `*Utc` fields sometimes arrive **without** a zone designator
 * (`"2025-08-06T17:30:00"`); `new Date()` would read those as device-local time and shift them by the offset, so
 * designator-less values are treated as UTC. Accepts a space instead of `T`, date-only values (midnight UTC), `Date`
 * objects and epoch milliseconds. Returns null for empty, unparseable or `0001-01-01` (.NET MinValue) input.
 */
export function parseApiUtcDate(input: unknown): Date | null {
  if (input === null || input === undefined || input === '') {
    return null;
  }
  if (input instanceof Date) {
    return Number.isNaN(input.getTime()) ? null : input;
  }
  if (typeof input === 'number') {
    const fromNumber = new Date(input);
    return Number.isFinite(input) && !Number.isNaN(fromNumber.getTime()) ? fromNumber : null;
  }
  if (typeof input !== 'string') {
    return null;
  }
  let value = input.trim();
  if (!value || DOTNET_MIN_VALUE.test(value)) {
    return null;
  }
  if (DATE_ONLY.test(value)) {
    value = `${value}T00:00:00Z`;
  } else {
    value = value.replace(' ', 'T');
    if (!HAS_ZONE.test(value)) {
      value = `${value}Z`;
    }
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Epoch ms of an API UTC timestamp (same rules as {@link parseApiUtcDate}), or null. */
export function parseUtcMs(input: unknown): number | null {
  const date = parseApiUtcDate(input);
  return date ? date.getTime() : null;
}

/** ISO-8601 UTC string for the wire (`2025-08-06T17:30:00.000Z`). */
export function toApiUtcString(date: Date | number = new Date()): string {
  return (typeof date === 'number' ? new Date(date) : date).toISOString();
}
