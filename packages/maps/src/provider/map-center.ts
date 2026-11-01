/**
 * The department's default map center (ported unchanged in behaviour from the identical legacy `lib/map-center.ts`).
 * Every map without anything better (no call location, no device fix) opens here. The server always fills these; the
 * guard covers the window before config loads and corrupt values.
 */

export interface MapCenter {
  latitude: number;
  longitude: number;
  zoomLevel: number;
}

/** Same value the server falls back to, so a map rendered during bootstrap does not jump a moment later. */
export const FALLBACK_MAP_CENTER: MapCenter = {
  latitude: 39.14086268299356,
  longitude: -119.7583809782715,
  zoomLevel: 9,
};

const isUsableCoordinate = (value: number | null | undefined, limit: number): value is number => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= limit;

export const resolveMapCenter = (latitude: number | null | undefined, longitude: number | null | undefined, zoomLevel: number | null | undefined): MapCenter => {
  if (!isUsableCoordinate(latitude, 90) || !isUsableCoordinate(longitude, 180)) {
    return FALLBACK_MAP_CENTER;
  }
  // 0,0 (Null Island) is the shape of an unset value; a lone zero is a real coordinate (Ghana, Ecuador, the UK).
  if (latitude === 0 && longitude === 0) {
    return FALLBACK_MAP_CENTER;
  }
  return {
    latitude,
    longitude,
    zoomLevel: typeof zoomLevel === 'number' && Number.isFinite(zoomLevel) && zoomLevel > 0 ? zoomLevel : FALLBACK_MAP_CENTER.zoomLevel,
  };
};
