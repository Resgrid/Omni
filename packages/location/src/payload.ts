import { LOCATION_PERSON_EVENT, LOCATION_UNIT_EVENT } from './constants';
import type { LocationFix, LocationTarget, LocationWireFields, PersonLocationPayload, UnitLocationPayload } from './types';

/**
 * iOS reports -1 for course, speed and the accuracy fields when the value is unavailable — a stationary device reports
 * it on every fix. Those sentinels (and null/NaN, which Android sends for altitude accuracy) become '0', the value
 * both legacy apps sent for "unknown" (Unit).
 */
const nonNegativeString = (value: number | null | undefined): string => (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value.toString() : '0');

/** Altitude is legitimately negative below sea level, so only non-finite values are replaced. */
const finiteString = (value: number | null | undefined): string => (typeof value === 'number' && Number.isFinite(value) ? value.toString() : '0');

/** The wire fields of a fix: UTC ISO timestamp (with `Z`), strings throughout (Core takes strings). */
export const toWireFields = (fix: LocationFix): LocationWireFields => ({
  Timestamp: new Date(fix.timestamp).toISOString(),
  Latitude: fix.coords.latitude.toString(),
  Longitude: fix.coords.longitude.toString(),
  Accuracy: nonNegativeString(fix.coords.accuracy),
  Altitude: finiteString(fix.coords.altitude),
  AltitudeAccuracy: nonNegativeString(fix.coords.altitudeAccuracy),
  Speed: nonNegativeString(fix.coords.speed),
  Heading: nonNegativeString(fix.coords.heading),
});

export const buildPersonLocationPayload = (userId: string, fix: LocationFix): PersonLocationPayload => ({ UserId: userId, ...toWireFields(fix) });

export const buildUnitLocationPayload = (unitId: string, fix: LocationFix): UnitLocationPayload => ({ UnitId: unitId, ...toWireFields(fix) });

/** Outbox event type for a target. */
export const eventTypeFor = (target: LocationTarget): string => (target === 'person' ? LOCATION_PERSON_EVENT : LOCATION_UNIT_EVENT);

/** Gate key for a target id: one pacing/backoff history per person or unit. */
export const targetKeyFor = (target: LocationTarget, id: string): string => `${target === 'person' ? 'p' : 'u'}:${id}`;

/**
 * Newest-wins collapse key: only the latest undelivered fix per person/unit is kept (plan §8.3). The outbox scopes
 * coalescing to the session (server + department + user), so the key only needs the entity.
 */
export const coalesceKeyFor = (target: LocationTarget, id: string): string => `${eventTypeFor(target)}:${id}`;
