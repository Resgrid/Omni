import { parseUtcMs } from '@resgrid/core/utils/dates';
import { EtaSource, type NearestPersonnelResult, type NearestUnitBoard, type NearestUnitResult, UnitPositionSource } from '@resgrid/models';
import { z } from 'zod';

/*
 * The nearest-unit board (`/Dispatch/GetNearestUnits`) joined onto the dispatch picker's rows, and its available entries
 * drawn on the call location map (Dispatch baseline `lib/dispatch-board`). Core ranks every unit and responder the viewer
 * may dispatch: available first, then response time (turnout + travel) to the second, then distance. Rows the board does
 * not list (out of the viewer's dispatch scope, or no call location yet) keep their place after the ranked ones, by name.
 */

/** How many of the closest available units or personnel get a "Nearest #n" badge. */
export const NEAREST_BADGE_COUNT = 3;

/** Only resources this close frame the call: one with a far-off fix would zoom the map out to a continent. */
export const FRAME_MAX_DISTANCE_METERS = 50_000;

const AGE_MINUTE_SECONDS = 60;

export interface BoardRank<T> {
  /** 0-based position on the board. */
  index: number;
  /** 1-based rank among the available entries with a distance; null for the rest. */
  nearestRank: number | null;
  entry: T;
}

const hasDistance = (distanceMeters: number | null | undefined): distanceMeters is number => distanceMeters !== null && distanceMeters !== undefined && Number.isFinite(distanceMeters);

const rankEntries = <T extends { IsAvailable: boolean; DistanceMeters?: number | null }>(entries: readonly T[], idOf: (entry: T) => string): Map<string, BoardRank<T>> => {
  const ranks = new Map<string, BoardRank<T>>();
  let nearest = 0;

  entries.forEach((entry, index) => {
    const nearestRank = entry.IsAvailable && hasDistance(entry.DistanceMeters) ? ++nearest : null;

    ranks.set(idOf(entry), { index, nearestRank, entry });
  });

  return ranks;
};

export const rankBoardUnits = (board: NearestUnitBoard | null | undefined): Map<string, BoardRank<NearestUnitResult>> => rankEntries(board?.Units ?? [], (unit) => String(unit.UnitId));

export const rankBoardPersonnel = (board: NearestUnitBoard | null | undefined): Map<string, BoardRank<NearestPersonnelResult>> => rankEntries(board?.Personnel ?? [], (person) => person.UserId);

export type RecipientSort = 'closest' | 'name';

/**
 * Rows in the order the dispatcher asked for. "closest" follows the board for the rows it lists, then the rest by name;
 * "name" is alphabetical (and the order whenever there is no board).
 */
export function orderByBoard<T>(items: readonly T[], idOf: (item: T) => string, nameOf: (item: T) => string, ranks: ReadonlyMap<string, BoardRank<unknown>>, sort: RecipientSort): T[] {
  const byName = (a: T, b: T): number => nameOf(a).localeCompare(nameOf(b), undefined, { sensitivity: 'base' });

  if (sort === 'name' || ranks.size === 0) return [...items].sort(byName);

  return [...items].sort((a, b) => {
    const rankA = ranks.get(idOf(a));
    const rankB = ranks.get(idOf(b));

    if (rankA && rankB) return rankA.index - rankB.index;

    if (rankA) return -1;

    if (rankB) return 1;

    return byName(a, b);
  });
}

/** Metres below 1 km, kilometres to one decimal above. Null when there is no distance. */
export const formatDistance = (meters: number | null | undefined): string | null => {
  if (!hasDistance(meters) || meters < 0) return null;

  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`;
};

/** m:ss ("4:05"), rounded to the second as Core ranks (UnitResponseOrigin.RankingSeconds). Null when there is no time. */
export const formatDuration = (seconds: number | null | undefined): string | null => {
  if (!hasDistance(seconds) || seconds < 0) return null;
  const total = Math.round(seconds);

  return `${Math.floor(total / 60)}:${(total % 60).toString().padStart(2, '0')}`;
};

/**
 * An ETA as m:ss with the minutes unit ("16:35 min"). Whole minutes hid why a unit showing "17 min" ranked behind another
 * "17 min"; to the second, the order on screen always matches the times shown. Null when no ETA was computed.
 */
export const formatEta = (seconds: number | null | undefined): string | null => {
  const duration = formatDuration(seconds);

  return duration ? `${duration} min` : null;
};

/** "2.3 km · 6:05 min", with "~" on an estimated (straight-line) ETA; null when the board had neither. */
export const formatDistanceEta = (distanceMeters: number | null | undefined, etaSeconds: number | null | undefined, etaSource?: EtaSource): string | null => {
  const distance = formatDistance(distanceMeters);
  const eta = formatEta(etaSeconds);
  const etaText = eta ? (etaSource === EtaSource.Estimated ? `~${eta}` : eta) : null;

  return [distance, etaText].filter(Boolean).join(' · ') || null;
};

/** The time a unit is ranked on: turnout plus travel (travel alone from servers that predate turnouts). */
export const unitResponseSeconds = (unit: Pick<NearestUnitResult, 'ResponseSeconds' | 'EtaSeconds'>): number | null | undefined => unit.ResponseSeconds ?? unit.EtaSeconds;

/** "4 min" / "2 h" / "3 d" since a server UTC timestamp; null when it is missing, unreadable or under a minute old. */
export const formatAge = (timestamp: string | null | undefined, now: number = Date.now()): string | null => {
  const parsed = parseUtcMs(timestamp);

  if (parsed === null) return null;
  const seconds = Math.max(0, (now - parsed) / 1000);

  if (seconds < AGE_MINUTE_SECONDS) return null;

  if (seconds < 3600) return `${Math.floor(seconds / 60)} min`;

  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h`;

  return `${Math.floor(seconds / 86400)} d`;
};

/** What a row should say about where its position came from, as an i18n key plus its values; null when nothing needs saying. */
export const positionNote = (
  entry: {
    LocationHidden: boolean;
    LocationIsStale?: boolean;
    PositionIsStale?: boolean;
    PositionSource?: UnitPositionSource;
    LocationTimestamp?: string | null;
    PositionTimestamp?: string | null;
    DistanceMeters?: number | null;
  },
  now: number = Date.now()
): { key: string; values?: Record<string, string> } | null => {
  if (entry.LocationHidden) return { key: 'calls.dispatch_board.location_hidden' };

  if (!hasDistance(entry.DistanceMeters)) return { key: 'calls.dispatch_board.no_location' };

  if (entry.PositionSource === UnitPositionSource.Station) return { key: 'calls.dispatch_board.at_station' };

  if (entry.LocationIsStale || entry.PositionIsStale) {
    const age = formatAge(entry.LocationTimestamp ?? entry.PositionTimestamp, now);

    return age ? { key: 'calls.dispatch_board.location_stale', values: { age } } : { key: 'calls.dispatch_board.location_stale_unknown' };
  }

  return null;
};

const usable = (lat: number | null | undefined, lng: number | null | undefined): boolean => hasDistance(lat) && hasDistance(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);

/** A call location to rank from; null without a usable one (no location yet, or 0,0). */
export const callLocationOf = (latitude: number | string | null | undefined, longitude: number | string | null | undefined): { latitude: number; longitude: number } | null => {
  const lat = Number.parseFloat(String(latitude ?? ''));
  const lng = Number.parseFloat(String(longitude ?? ''));

  return usable(lat, lng) ? { latitude: lat, longitude: lng } : null;
};

// ---------------------------------------------------------------------------------------------------------------------
// Map overlay
// ---------------------------------------------------------------------------------------------------------------------

export const UNIT_MARKER_COLOR = '#2563eb';
export const PERSON_MARKER_COLOR = '#7c3aed';
export const BOUNDARY_COLOR = '#0ea5e9';

const HEX_COLOR = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const hexOr = (color: string | null | undefined, fallback: string): string => (color && HEX_COLOR.test(color.trim()) ? color.trim() : fallback);

// A stored boundary point: `{lat,lng}` from the web editor, `{k,A}` from the old Google Maps one; numbers or strings.
const coordinateSchema = z.union([z.number(), z.string()]).optional();

const geofencePointSchema = z.object({
  lat: coordinateSchema,
  Lat: coordinateSchema,
  k: coordinateSchema,
  lng: coordinateSchema,
  lon: coordinateSchema,
  Lng: coordinateSchema,
  Lon: coordinateSchema,
  A: coordinateSchema,
  a: coordinateSchema,
});

type GeofencePoint = z.infer<typeof geofencePointSchema>;

/** The stored JSON as an array, or null when it is not JSON or not an array. */
const jsonArrayOf = (text: string): unknown[] | null => {
  try {
    const parsed = z.array(z.unknown()).safeParse(JSON.parse(text));

    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
};

const pointOf = (point: GeofencePoint): [number, number] | null => {
  const lat = Number(point.lat ?? point.Lat ?? point.k);
  const lng = Number(point.lng ?? point.lon ?? point.Lng ?? point.Lon ?? point.A ?? point.a);

  return usable(lat, lng) ? [lng, lat] : null;
};

/** A group's boundary (stored as JSON `[{lat,lng}]`) as a closed GeoJSON ring of [lng, lat]; null with fewer than three usable points. */
export const parseGeofenceRing = (geofence: string | null | undefined): [number, number][] | null => {
  const entries = geofence?.trim() ? jsonArrayOf(geofence) : null;

  if (!entries) return null;

  // Entries that are not points (a stray null or number) are skipped, as the web map skips them.
  const ring = entries
    .map((entry) => geofencePointSchema.safeParse(entry))
    .flatMap((point) => (point.success ? [pointOf(point.data)] : []))
    .filter((point): point is [number, number] => point !== null);

  if (ring.length < 3) return null;
  const [firstLng, firstLat] = ring[0] ?? [0, 0];
  const [lastLng, lastLat] = ring[ring.length - 1] ?? [0, 0];

  if (firstLng !== lastLng || firstLat !== lastLat) ring.push([firstLng, firstLat]);

  return ring;
};

export interface DispatchMapPointProperties {
  id: string;
  kind: 'unit' | 'person';
  name: string;
  color: string;
  /** Status, distance and ETA, for the popup. */
  detail: string;
}

export interface DispatchMapBoundaryProperties {
  id: string;
  name: string;
  color: string;
}

export interface DispatchMapOverlay {
  points: GeoJSON.FeatureCollection<GeoJSON.Point, DispatchMapPointProperties>;
  boundaries: GeoJSON.FeatureCollection<GeoJSON.Polygon, DispatchMapBoundaryProperties>;
  /** [lng, lat] of the closest few resources with a position, to frame the call with them. */
  nearest: [number, number][];
  unitCount: number;
  personCount: number;
}

const withinFrame = (distanceMeters: number | null | undefined): boolean => hasDistance(distanceMeters) && distanceMeters <= FRAME_MAX_DISTANCE_METERS;

/**
 * The available units and responders the board placed (hidden positions carry no coordinates and are left off), plus every
 * group boundary, as GeoJSON for the call location map. The map shows only who can be sent; the picker lists everyone with
 * their status, for reassignment. Null when there is nothing to draw.
 */
export function buildDispatchMapOverlay(
  board: NearestUnitBoard | null | undefined,
  groups: readonly { GroupId: string; Name: string; Geofence?: string | null; GeofenceColor?: string | null }[]
): DispatchMapOverlay | null {
  const points: GeoJSON.Feature<GeoJSON.Point, DispatchMapPointProperties>[] = [];
  const nearest: [number, number][] = [];
  let nearestPeople = 0;

  for (const unit of board?.Units ?? []) {
    if (!unit.IsAvailable || !usable(unit.Latitude, unit.Longitude)) continue;
    const coordinates: [number, number] = [Number(unit.Longitude), Number(unit.Latitude)];
    const detail = [unit.StatusText, formatDistanceEta(unit.DistanceMeters, unitResponseSeconds(unit), unit.EtaSource)].filter(Boolean).join(' · ');

    points.push({ type: 'Feature', geometry: { type: 'Point', coordinates }, properties: { id: `u${unit.UnitId}`, kind: 'unit', name: unit.Name, color: hexOr(unit.StatusColor, UNIT_MARKER_COLOR), detail } });

    if (withinFrame(unit.DistanceMeters) && nearest.length < NEAREST_BADGE_COUNT) nearest.push(coordinates);
  }

  for (const person of board?.Personnel ?? []) {
    if (!person.IsAvailable || !usable(person.Latitude, person.Longitude)) continue;
    const coordinates: [number, number] = [Number(person.Longitude), Number(person.Latitude)];
    const detail = [person.StatusText, formatDistanceEta(person.DistanceMeters, person.EtaSeconds, person.EtaSource)].filter(Boolean).join(' · ');

    points.push({ type: 'Feature', geometry: { type: 'Point', coordinates }, properties: { id: `p${person.UserId}`, kind: 'person', name: person.Name, color: hexOr(person.StatusColor, PERSON_MARKER_COLOR), detail } });

    if (withinFrame(person.DistanceMeters) && nearestPeople < NEAREST_BADGE_COUNT) {
      nearest.push(coordinates);
      nearestPeople++;
    }
  }

  const boundaries: GeoJSON.Feature<GeoJSON.Polygon, DispatchMapBoundaryProperties>[] = [];

  for (const group of groups) {
    const ring = parseGeofenceRing(group.Geofence);

    if (!ring) continue;
    boundaries.push({ type: 'Feature', geometry: { type: 'Polygon', coordinates: [ring] }, properties: { id: `g${group.GroupId}`, name: group.Name, color: hexOr(group.GeofenceColor, BOUNDARY_COLOR) } });
  }

  if (points.length === 0 && boundaries.length === 0) return null;

  return {
    points: { type: 'FeatureCollection', features: points },
    boundaries: { type: 'FeatureCollection', features: boundaries },
    nearest,
    unitCount: points.filter((point) => point.properties.kind === 'unit').length,
    personCount: points.filter((point) => point.properties.kind === 'person').length,
  };
}

/** South-west and north-east corners framing the call and the given points, or null when there is nothing beside the call. */
export const boundsAround = (center: { latitude: number; longitude: number }, points: readonly [number, number][]): { sw: [number, number]; ne: [number, number] } | null => {
  if (points.length === 0) return null;
  let minLng = center.longitude;
  let maxLng = center.longitude;
  let minLat = center.latitude;
  let maxLat = center.latitude;

  for (const [lng, lat] of points) {
    minLng = Math.min(minLng, lng);
    maxLng = Math.max(maxLng, lng);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
  }

  return { sw: [minLng, minLat], ne: [maxLng, maxLat] };
};
