/**
 * Destination capabilities and availability (Core M0315, `PoiAvailabilityRules`): what a destination offers, whether it can
 * take a patient now, and how destinations rank from a point (a unit's position or a call's location). Shared by the status
 * destination list, the call form's destination picker and the POI screens.
 */
import { parseUtcMs } from '@resgrid/core/utils/dates';
import { type NearestDestinationResultData, PoiAvailabilityStatuses, type PoiResultData } from '@resgrid/models';

/** A capability as a filter option: its id (or name on servers that send names only) and its name. */
export interface PoiCapabilityOption {
  id: string;
  name: string;
}

const sameId = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase();

/** True when the list holds the capability id (ids compare without case or surrounding spaces). */
export const hasCapabilityId = (ids: readonly string[], id: string): boolean => ids.some((value) => sameId(value, id));

/** The list with the capability id removed when it holds it (in any case), else added. */
export const toggleCapabilityId = (ids: readonly string[], id: string): string[] => (hasCapabilityId(ids, id) ? ids.filter((value) => !sameId(value, id)) : [...ids, id]);

/** The destination's current availability: Open when it has none, an unknown value, or a report that has lapsed. */
export const poiAvailabilityStatus = (poi: Pick<PoiResultData, 'AvailabilityStatus' | 'AvailabilityExpiresOnUtc'> | null | undefined, now: number = Date.now()): PoiAvailabilityStatuses => {
  const status = Number(poi?.AvailabilityStatus ?? PoiAvailabilityStatuses.Open);

  if (status !== PoiAvailabilityStatuses.Limited && status !== PoiAvailabilityStatuses.Diversion && status !== PoiAvailabilityStatuses.Closed) return PoiAvailabilityStatuses.Open;

  // `*Utc` fields can arrive without a zone designator: the shared parser reads them as UTC, not device-local time.
  const expires = parseUtcMs(poi?.AvailabilityExpiresOnUtc) ?? NaN;

  return Number.isFinite(expires) && expires <= now ? PoiAvailabilityStatuses.Open : status;
};

/** When the destination's current report lapses (epoch ms): null when it is open, has no end, or has already lapsed. */
export const availabilityExpiresAt = (poi: Pick<PoiResultData, 'AvailabilityStatus' | 'AvailabilityExpiresOnUtc'> | null | undefined, now: number = Date.now()): number | null => {
  if (poiAvailabilityStatus(poi, now) === PoiAvailabilityStatuses.Open) return null;
  const expires = parseUtcMs(poi?.AvailabilityExpiresOnUtc);

  return expires !== null && expires > now ? expires : null;
};

/** Whole minutes left until `expiresAt` (at least 1), to send a report again without changing when it lapses. */
export const minutesUntil = (expiresAt: number, now: number = Date.now()): number => Math.max(1, Math.ceil((expiresAt - now) / 60000));

/** True when the destination reports this capability unavailable right now. */
export const isPoiCapabilityUnavailable = (poi: PoiResultData | null | undefined, capabilityId: string | null | undefined, now: number = Date.now()): boolean => {
  if (!poi || !capabilityId || poiAvailabilityStatus(poi, now) === PoiAvailabilityStatuses.Open) return false;

  return hasCapabilityId(poi.UnavailableCapabilityIds ?? [], capabilityId);
};

/** True when it can take a patient (needing the capability, when one is given) now: not closed, the capability not down. */
export const canPoiProvide = (poi: PoiResultData | null | undefined, capabilityId?: string | null, now: number = Date.now()): boolean => {
  if (!poi) return false;

  if (poiAvailabilityStatus(poi, now) === PoiAvailabilityStatuses.Closed) return false;

  return !isPoiCapabilityUnavailable(poi, capabilityId, now);
};

/** The POI's capabilities as id/name pairs; servers that send names only use the name as the id. */
export const poiCapabilityOptions = (poi: Pick<PoiResultData, 'CapabilityIds' | 'Capabilities'>): PoiCapabilityOption[] => {
  const names = poi.Capabilities ?? [];
  const ids = poi.CapabilityIds ?? [];

  return names.map((name, index) => ({ id: ids[index] ?? name, name }));
};

/** True when the POI offers the capability (by id, or by name on servers that send names only). */
export const poiOffersCapability = (poi: PoiResultData, capabilityId: string): boolean => poiCapabilityOptions(poi).some((option) => sameId(option.id, capabilityId));

/** Every capability the POIs offer, once, by name. */
export const collectCapabilityOptions = (pois: readonly PoiResultData[]): PoiCapabilityOption[] => {
  const seen = new Map<string, PoiCapabilityOption>();

  for (const poi of pois) {
    for (const option of poiCapabilityOptions(poi)) {
      const key = option.id.trim().toLowerCase();

      if (!seen.has(key)) seen.set(key, option);
    }
  }

  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
};

/** The i18n key of an availability status. */
export const availabilityLabelKey = (status: PoiAvailabilityStatuses): string => {
  switch (status) {
    case PoiAvailabilityStatuses.Limited:
      return 'pois.availability.limited';
    case PoiAvailabilityStatuses.Diversion:
      return 'pois.availability.diversion';
    case PoiAvailabilityStatuses.Closed:
      return 'pois.availability.closed';
    default:
      return 'pois.availability.open';
  }
};

/**
 * The i18n keys of what a destination's availability badge says, in order: its status (none for an open destination unless
 * `showOpen`), then "Unavailable now" when the chosen capability is down. A row that names itself for screen readers adds
 * these, so the badge's warning is heard too.
 */
export const availabilityBadgeKeys = (poi: PoiResultData, options: { capabilityId?: string | null; showOpen?: boolean; now?: number } = {}): string[] => {
  const now = options.now ?? Date.now();
  const status = poiAvailabilityStatus(poi, now);

  if (status === PoiAvailabilityStatuses.Open && !options.showOpen) return [];

  return [availabilityLabelKey(status), ...(isPoiCapabilityUnavailable(poi, options.capabilityId, now) ? ['pois.availability.capability_unavailable'] : [])];
};

const EARTH_RADIUS_M = 6371000;
const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

/** A usable point: finite, on the globe, and not the 0,0 an unlocated record carries. */
export const isUsablePoint = (latitude: number | null | undefined, longitude: number | null | undefined): boolean => {
  if (latitude === null || latitude === undefined || longitude === null || longitude === undefined) return false;

  return Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180 && !(latitude === 0 && longitude === 0);
};

/** Straight-line metres between two points (haversine). */
export const straightLineMeters = (fromLatitude: number, fromLongitude: number, toLatitude: number, toLongitude: number): number => {
  const dLat = toRadians(toLatitude - fromLatitude);
  const dLon = toRadians(toLongitude - fromLongitude);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(fromLatitude)) * Math.cos(toRadians(toLatitude)) * Math.sin(dLon / 2) ** 2;

  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
};

/** A point destinations are ranked from. */
export interface DestinationOrigin {
  latitude: number;
  longitude: number;
}

/** An origin from a position the API sends as text or numbers (a unit's last position); null when unusable. */
export const toDestinationOrigin = (latitude: string | number | null | undefined, longitude: string | number | null | undefined): DestinationOrigin | null => {
  const lat = latitude === null || latitude === undefined || latitude === '' ? NaN : Number(latitude);
  const lon = longitude === null || longitude === undefined || longitude === '' ? NaN : Number(longitude);

  return isUsablePoint(lat, lon) ? { latitude: lat, longitude: lon } : null;
};

/** A destination in a ranked list, with what the row shows. */
export interface RankedDestination {
  poi: PoiResultData;
  /** Straight-line metres from the origin; null without one. */
  distanceMeters: number | null;
  /** Routed travel seconds from the server's ranking; null when not looked up. */
  travelSeconds: number | null;
  canProvide: boolean;
  /** The first destination that can take the patient, when ranked from an origin. */
  isNearest: boolean;
}

/** Can provide (not on diversion) first, then diversion, then cannot provide. */
const groupOf = (poi: PoiResultData, capabilityId: string | null, now: number): number => {
  if (!canPoiProvide(poi, capabilityId, now)) return 2;

  return poiAvailabilityStatus(poi, now) === PoiAvailabilityStatuses.Diversion ? 1 : 0;
};

/**
 * Orders destinations for a list. With the server's ranking (GetNearestDestinations) its order wins and the rest follow by
 * distance; with an origin only, by availability group then straight-line distance; with neither, as given. Destinations
 * not offering the capability (when one is chosen) are left out.
 */
export const rankDestinations = (
  pois: readonly PoiResultData[],
  options: { origin?: DestinationOrigin | null; capabilityId?: string | null; ranking?: readonly NearestDestinationResultData[] | null; now?: number }
): RankedDestination[] => {
  const now = options.now ?? Date.now();
  const capabilityId = options.capabilityId?.trim() ? options.capabilityId : null;
  const origin = options.origin && isUsablePoint(options.origin.latitude, options.origin.longitude) ? options.origin : null;
  const offered = capabilityId ? pois.filter((poi) => poiOffersCapability(poi, capabilityId)) : [...pois];

  const rows: RankedDestination[] = offered.map((poi) => ({
    poi,
    distanceMeters: origin && isUsablePoint(poi.Latitude, poi.Longitude) ? straightLineMeters(origin.latitude, origin.longitude, poi.Latitude, poi.Longitude) : null,
    travelSeconds: null,
    canProvide: canPoiProvide(poi, capabilityId, now),
    isNearest: false,
  }));

  if (!origin) return rows;

  const rankIndex = new Map<number, number>();

  (options.ranking ?? []).forEach((entry, index) => {
    if (!entry.Poi) return;
    rankIndex.set(entry.Poi.PoiId, index);
    const row = rows.find((candidate) => candidate.poi.PoiId === entry.Poi?.PoiId);

    if (!row) return;

    if (entry.TravelSeconds >= 0) row.travelSeconds = entry.TravelSeconds;
    // The server ordered the ranking by what it could provide when it answered: Nearest follows the same answer.
    row.canProvide = entry.CanProvide;
  });

  const ordered = [...rows].sort((a, b) => {
    const ra = rankIndex.get(a.poi.PoiId);
    const rb = rankIndex.get(b.poi.PoiId);

    if (ra !== undefined || rb !== undefined) {
      if (ra === undefined) return 1;

      if (rb === undefined) return -1;

      return ra - rb;
    }

    const group = groupOf(a.poi, capabilityId, now) - groupOf(b.poi, capabilityId, now);

    if (group !== 0) return group;

    return (a.distanceMeters ?? Number.MAX_VALUE) - (b.distanceMeters ?? Number.MAX_VALUE);
  });

  const nearest = ordered.find((row) => row.canProvide && (row.distanceMeters !== null || row.travelSeconds !== null));

  if (nearest) nearest.isNearest = true;

  return ordered;
};
