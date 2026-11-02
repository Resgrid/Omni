/** `[longitude, latitude]`, the GeoJSON order every route coordinate uses. */
export type LngLat = [number, number];

const EARTH_RADIUS_METERS = 6_371_008.8;
const RAD = Math.PI / 180;

/** Great-circle distance in metres. */
export const haversineMeters = (a: LngLat, b: LngLat): number => {
  const dLat = (b[1] - a[1]) * RAD;
  const dLon = (b[0] - a[0]) * RAD;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * RAD) * Math.cos(b[1] * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
};

/** Initial bearing from `a` to `b`, degrees clockwise from north in [0, 360). */
export const bearingDegrees = (a: LngLat, b: LngLat): number => {
  const lat1 = a[1] * RAD;
  const lat2 = b[1] * RAD;
  const dLon = (b[0] - a[0]) * RAD;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return normalizeBearing(Math.atan2(y, x) / RAD);
};

export const normalizeBearing = (degrees: number): number => ((degrees % 360) + 360) % 360;

/** Smallest angle between two bearings, in [0, 180]. */
export const angleBetween = (a: number, b: number): number => {
  const diff = Math.abs(normalizeBearing(a) - normalizeBearing(b));
  return diff > 180 ? 360 - diff : diff;
};

export interface SegmentProjection {
  /** The closest point on the segment. */
  point: LngLat;
  /** Position along the segment, 0 at `a`, 1 at `b`. */
  t: number;
  /** Metres from the query point to `point`. */
  distance: number;
}

/**
 * Closest point on segment a–b to `p`, in a local equirectangular frame around `p` (route segments are short, so the
 * error is centimetres).
 */
export const projectOnSegment = (p: LngLat, a: LngLat, b: LngLat): SegmentProjection => {
  const cosLat = Math.cos(p[1] * RAD);
  const ax = (a[0] - p[0]) * cosLat;
  const ay = a[1] - p[1];
  const bx = (b[0] - p[0]) * cosLat;
  const by = b[1] - p[1];
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lengthSquared));
  const point: LngLat = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  return { point, t, distance: haversineMeters(p, point) };
};

/** Distance along the line at each coordinate, starting at 0. */
export const cumulativeDistances = (coordinates: readonly LngLat[]): number[] => {
  const result: number[] = new Array<number>(coordinates.length);
  let total = 0;
  for (let i = 0; i < coordinates.length; i += 1) {
    if (i > 0) total += haversineMeters(coordinates[i - 1], coordinates[i]);
    result[i] = total;
  }
  return result;
};

/** Index of the segment (i → i+1) that contains `distance` along the line. */
export const segmentAtDistance = (cumulative: readonly number[], distance: number): number => {
  if (cumulative.length < 2) return 0;
  let low = 0;
  let high = cumulative.length - 2;
  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if (cumulative[mid] <= distance) low = mid;
    else high = mid - 1;
  }
  return low;
};

/** The point `distance` metres along the line (clamped to its ends) and the bearing of the segment it lies on. */
export const pointAtDistance = (coordinates: readonly LngLat[], cumulative: readonly number[], distance: number): { point: LngLat; bearing: number } => {
  if (coordinates.length === 0) return { point: [0, 0], bearing: 0 };
  if (coordinates.length === 1) return { point: coordinates[0], bearing: 0 };
  const clamped = Math.max(0, Math.min(distance, cumulative[cumulative.length - 1]));
  const index = segmentAtDistance(cumulative, clamped);
  const a = coordinates[index];
  const b = coordinates[index + 1];
  const length = cumulative[index + 1] - cumulative[index];
  const t = length > 0 ? (clamped - cumulative[index]) / length : 0;
  return { point: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], bearing: bearingDegrees(a, b) };
};

/** The part of the line between two distances along it (inclusive end points), for traversed/remaining drawing. */
export const sliceLine = (coordinates: readonly LngLat[], cumulative: readonly number[], from: number, to: number): LngLat[] => {
  if (coordinates.length < 2 || to <= from) return [];
  const start = pointAtDistance(coordinates, cumulative, from).point;
  const end = pointAtDistance(coordinates, cumulative, to).point;
  const result: LngLat[] = [start];
  for (let i = 0; i < coordinates.length; i += 1) {
    if (cumulative[i] > from && cumulative[i] < to) result.push(coordinates[i]);
  }
  result.push(end);
  return result;
};

/** Every coordinate a finite, in-range `[lon, lat]`. */
export const isValidLngLat = (value: unknown): value is LngLat =>
  Array.isArray(value) &&
  value.length >= 2 &&
  typeof value[0] === 'number' &&
  typeof value[1] === 'number' &&
  Number.isFinite(value[0]) &&
  Number.isFinite(value[1]) &&
  Math.abs(value[0]) <= 180 &&
  Math.abs(value[1]) <= 90;
