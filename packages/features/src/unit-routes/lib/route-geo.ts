/**
 * Route geometry for the map slot. The server stores and returns the route as a GeoJSON string (Core `RouteService`,
 * drawn by the web app with `L.geoJSON`); the app never asks a routing provider for one. Minimal GeoJSON types are
 * declared here so this package needs no GeoJSON dependency.
 */

/** [longitude, latitude] */
export type LngLat = [number, number];

export interface RouteLineString {
  type: 'LineString';
  coordinates: LngLat[];
}

export interface RouteMultiLineString {
  type: 'MultiLineString';
  coordinates: LngLat[][];
}

export type RouteGeometry = RouteLineString | RouteMultiLineString;

const isPosition = (value: unknown): value is LngLat => Array.isArray(value) && value.length >= 2 && Number.isFinite(value[0]) && Number.isFinite(value[1]);

const toLine = (coordinates: unknown): LngLat[] | null => {
  if (!Array.isArray(coordinates)) return null;
  const line = coordinates.filter(isPosition).map((position) => [Number(position[0]), Number(position[1])] as LngLat);
  return line.length >= 2 ? line : null;
};

const fromGeometry = (geometry: unknown): RouteGeometry | null => {
  if (!geometry || typeof geometry !== 'object') return null;
  const value = geometry as { type?: unknown; coordinates?: unknown; geometry?: unknown; features?: unknown };
  if (value.type === 'Feature') return fromGeometry(value.geometry);
  if (value.type === 'FeatureCollection' && Array.isArray(value.features)) {
    const lines = value.features.map((feature) => fromGeometry(feature)).flatMap((part) => (part === null ? [] : part.type === 'LineString' ? [part.coordinates] : part.coordinates));
    if (lines.length === 0) return null;
    return lines.length === 1 ? { type: 'LineString', coordinates: lines[0] } : { type: 'MultiLineString', coordinates: lines };
  }
  if (value.type === 'LineString') {
    const line = toLine(value.coordinates);
    return line ? { type: 'LineString', coordinates: line } : null;
  }
  if (value.type === 'MultiLineString' && Array.isArray(value.coordinates)) {
    const lines = value.coordinates.map(toLine).filter((line): line is LngLat[] => line !== null);
    return lines.length > 0 ? { type: 'MultiLineString', coordinates: lines } : null;
  }
  return null;
};

/** Parses the server's route geometry (GeoJSON Feature, FeatureCollection, LineString, MultiLineString or a bare coordinate array). */
export function parseRouteGeometry(geometry: string | null | undefined): RouteGeometry | null {
  if (!geometry || geometry.trim() === '') return null;
  try {
    const parsed: unknown = JSON.parse(geometry);
    if (Array.isArray(parsed)) {
      const line = toLine(parsed);
      return line ? { type: 'LineString', coordinates: line } : null;
    }
    return fromGeometry(parsed);
  } catch {
    return null;
  }
}

/** Every position of a geometry (for camera bounds). */
export const geometryPositions = (geometry: RouteGeometry | null): LngLat[] => (geometry === null ? [] : geometry.type === 'LineString' ? geometry.coordinates : geometry.coordinates.flat());

const EARTH_RADIUS_M = 6_371_000;

/** A closed polygon ring approximating a geofence circle (`steps` segments). */
export function geofenceRing(latitude: number, longitude: number, radiusMeters: number, steps = 64): LngLat[] {
  const ring: LngLat[] = [];
  const latRad = (latitude * Math.PI) / 180;
  for (let i = 0; i <= steps; i += 1) {
    const angle = (i / steps) * 2 * Math.PI;
    const dLat = (radiusMeters / EARTH_RADIUS_M) * Math.cos(angle);
    const dLng = (radiusMeters / (EARTH_RADIUS_M * Math.cos(latRad))) * Math.sin(angle);
    ring.push([longitude + (dLng * 180) / Math.PI, latitude + (dLat * 180) / Math.PI]);
  }
  return ring;
}

/** A map point that is present, in range and not the (0,0) "no data" sentinel. */
export const isMappable = (latitude: number | null | undefined, longitude: number | null | undefined): boolean =>
  typeof latitude === 'number' &&
  typeof longitude === 'number' &&
  Number.isFinite(latitude) &&
  Number.isFinite(longitude) &&
  !(latitude === 0 && longitude === 0) &&
  Math.abs(latitude) <= 90 &&
  Math.abs(longitude) <= 180;

export interface RouteBounds {
  ne: LngLat;
  sw: LngLat;
}

/** The bounding box of the positions, or null when there are none. */
export function boundsOf(positions: readonly LngLat[]): RouteBounds | null {
  if (positions.length === 0) return null;
  const lngs = positions.map((position) => position[0]);
  const lats = positions.map((position) => position[1]);
  return { ne: [Math.max(...lngs), Math.max(...lats)], sw: [Math.min(...lngs), Math.min(...lats)] };
}
