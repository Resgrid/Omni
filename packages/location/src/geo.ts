import type { LocationFix } from './types';

export interface Coordinates {
  latitude: number;
  longitude: number;
}

const EARTH_RADIUS_METERS = 6371008.8;

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

/** Great-circle distance in meters (haversine). */
export const distanceInMeters = (from: Coordinates, to: Coordinates): number => {
  const deltaLatitude = toRadians(to.latitude - from.latitude);
  const deltaLongitude = toRadians(to.longitude - from.longitude);
  const a = Math.sin(deltaLatitude / 2) ** 2 + Math.cos(toRadians(from.latitude)) * Math.cos(toRadians(to.latitude)) * Math.sin(deltaLongitude / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

/** A position that can be placed on a map: finite, in range, and not 0,0 (the shape of a missing value). */
export const isUsableCoordinate = (coords: Coordinates): boolean =>
  Number.isFinite(coords.latitude) &&
  Number.isFinite(coords.longitude) &&
  coords.latitude >= -90 &&
  coords.latitude <= 90 &&
  coords.longitude >= -180 &&
  coords.longitude <= 180 &&
  !(coords.latitude === 0 && coords.longitude === 0);

/**
 * The OS hands the background task a batch — every fix collected while deferring, oldest first, but not guaranteed
 * ordered. Only the newest says where the device is now; the first can be a whole deferral window old (Unit).
 */
export const newestFix = (fixes: readonly LocationFix[] | null | undefined): LocationFix | undefined =>
  fixes?.reduce<LocationFix | undefined>((newest, candidate) => (!newest || candidate.timestamp >= newest.timestamp ? candidate : newest), undefined);

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const toNullableNumber = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);

/** Validates an untrusted fix (task data, browser position) into a `LocationFix`, or null. */
export const toLocationFix = (value: unknown): LocationFix | null => {
  if (!isRecord(value) || !isRecord(value.coords)) return null;
  const coords = value.coords;
  const latitude = toNullableNumber(coords.latitude);
  const longitude = toNullableNumber(coords.longitude);
  const timestamp = toNullableNumber(value.timestamp);
  if (latitude === null || longitude === null || timestamp === null) return null;
  return {
    coords: {
      latitude,
      longitude,
      altitude: toNullableNumber(coords.altitude),
      accuracy: toNullableNumber(coords.accuracy),
      altitudeAccuracy: toNullableNumber(coords.altitudeAccuracy),
      heading: toNullableNumber(coords.heading),
      speed: toNullableNumber(coords.speed),
    },
    timestamp,
    ...(value.mocked === true ? { mocked: true } : {}),
  };
};

/** The `locations` array of an expo-location task event, validated. */
export const extractTaskFixes = (data: unknown): LocationFix[] => {
  if (!isRecord(data) || !Array.isArray(data.locations)) return [];
  return data.locations.map(toLocationFix).filter((fix): fix is LocationFix => fix !== null);
};
