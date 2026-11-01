import { isValidLngLat, type LngLat } from '../types';

/**
 * Camera helpers: Unit's follow-the-unit maths (`lib/map-camera.ts`) plus bounds fitting shared by every variant.
 * Pure functions; the hooks in `hooks/use-camera-helpers.ts` drive a `CameraRef` with them.
 */

/** Speed (m/s) → zoom anchor points, interpolated linearly (on foot: tight; highway: wide lookahead). */
const SPEED_ZOOM_STOPS: readonly (readonly [number, number])[] = [
  [0, 17],
  [1.5, 16.5],
  [4, 16],
  [9, 15],
  [18, 14],
  [28, 13.25],
  [40, 12.5],
];

/** GPS speed is m/s with "no fix" as -1 (iOS) or null; clamps to >= 0. */
export function normalizeSpeed(speed: number | null | undefined): number {
  if (speed == null || !Number.isFinite(speed) || speed < 0) {
    return 0;
  }
  return speed;
}

/** GPS heading in [0, 360) or null when there is no usable heading (-1 / null / NaN). */
export function normalizeHeading(heading: number | null | undefined): number | null {
  if (heading == null || !Number.isFinite(heading) || heading < 0) {
    return null;
  }
  return heading % 360;
}

export function zoomForSpeed(speedMps: number): number {
  const speed = normalizeSpeed(speedMps);
  const [firstSpeed, firstZoom] = SPEED_ZOOM_STOPS[0];
  if (speed <= firstSpeed) return firstZoom;
  for (let i = 1; i < SPEED_ZOOM_STOPS.length; i++) {
    const [stopSpeed, stopZoom] = SPEED_ZOOM_STOPS[i];
    if (speed <= stopSpeed) {
      const [prevSpeed, prevZoom] = SPEED_ZOOM_STOPS[i - 1];
      return prevZoom + ((stopZoom - prevZoom) * (speed - prevSpeed)) / (stopSpeed - prevSpeed);
    }
  }
  return SPEED_ZOOM_STOPS[SPEED_ZOOM_STOPS.length - 1][1];
}

/** Exponential moving average so noisy GPS speed does not pump the zoom. */
export function smoothSpeed(previous: number | null, next: number, alpha: number = 0.4): number {
  const target = normalizeSpeed(next);
  return previous == null ? target : previous + (target - previous) * alpha;
}

/** Keep the current zoom unless the target differs by at least `threshold` levels. */
export function applyZoomHysteresis(currentZoom: number | null, targetZoom: number, threshold: number = 0.25): number {
  if (currentZoom == null) return targetZoom;
  return Math.abs(targetZoom - currentZoom) >= threshold ? targetZoom : currentZoom;
}

export const FOLLOW_PITCH_MOVING = 45;
export const PITCH_TILT_UP_SPEED_MPS = 1.5;
export const PITCH_TILT_DOWN_SPEED_MPS = 0.7;

/** Tilt behind a moving unit, top-down when stopped, hold in between (hysteresis). */
export function applyPitchHysteresis(currentPitch: number | null, speedMps: number): number {
  const speed = normalizeSpeed(speedMps);
  if (speed >= PITCH_TILT_UP_SPEED_MPS) return FOLLOW_PITCH_MOVING;
  if (speed <= PITCH_TILT_DOWN_SPEED_MPS) return 0;
  return currentPitch ?? 0;
}

export function wrapLongitude(longitude: number): number {
  return ((((longitude + 180) % 360) + 360) % 360) - 180;
}

/** GeoJSON circle around a coordinate (radius in metres), corrected for latitude so it stays round. */
export function createCirclePolygon(longitude: number, latitude: number, radiusMeters: number, points: number = 64): GeoJSON.Feature<GeoJSON.Polygon> {
  const centerLon = wrapLongitude(longitude);
  const latRadiusDeg = radiusMeters / 110574;
  const cosLat = Math.cos((latitude * Math.PI) / 180);
  const lonRadiusDeg = radiusMeters / (111320 * Math.max(Math.abs(cosLat), 0.01));
  const coords: number[][] = [];
  for (let i = 0; i < points; i++) {
    const angle = (i / points) * 2 * Math.PI;
    const lat = Math.min(90, Math.max(-90, latitude + latRadiusDeg * Math.sin(angle)));
    coords.push([centerLon + lonRadiusDeg * Math.cos(angle), lat]);
  }
  coords.push([...coords[0]]);
  return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [coords] } };
}

export interface FitBoundsResult {
  ne: LngLat;
  sw: LngLat;
  /** A single point (or identical points): centre on it instead of fitting a zero-size box. */
  single: LngLat | null;
}

/**
 * Bounds around the given coordinates (invalid ones ignored), or null when none are valid. A degenerate box (one
 * point) is reported through `single` so callers centre at a sensible zoom instead.
 */
export function computeBounds(coordinates: readonly (readonly number[] | null | undefined)[]): FitBoundsResult | null {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  let count = 0;
  for (const coordinate of coordinates) {
    if (!isValidLngLat(coordinate)) continue;
    west = Math.min(west, coordinate[0]);
    east = Math.max(east, coordinate[0]);
    south = Math.min(south, coordinate[1]);
    north = Math.max(north, coordinate[1]);
    count++;
  }
  if (count === 0) {
    return null;
  }
  const single: LngLat | null = west === east && south === north ? [west, south] : null;
  return { ne: [east, north], sw: [west, south], single };
}
