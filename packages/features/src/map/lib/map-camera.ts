import type { MapMakerInfoData } from '@resgrid/models';

/** Where the department map frames itself: a focused pin, the device's own position (field apps) or the department. */

export type CameraCoordinate = [longitude: number, latitude: number];

export interface CameraTarget {
  centerCoordinate: CameraCoordinate;
  zoomLevel: number;
}

/** A focused pin (call, unit, member, POI). */
export const FOCUS_ZOOM = 15;
/** The device's own position when the map follows it without speed-adaptive zoom (Responder). */
export const OWN_LOCATION_ZOOM = 14;
/** The department view when the server sends no zoom. */
export const DEFAULT_ZOOM = 11;

const isUsable = (latitude: number | null | undefined, longitude: number | null | undefined): boolean =>
  typeof latitude === 'number' &&
  typeof longitude === 'number' &&
  Number.isFinite(latitude) &&
  Number.isFinite(longitude) &&
  Math.abs(latitude) <= 90 &&
  Math.abs(longitude) <= 180 &&
  !(latitude === 0 && longitude === 0);

export const pointTarget = (latitude: number | null | undefined, longitude: number | null | undefined, zoomLevel: number): CameraTarget | null =>
  isUsable(latitude, longitude) ? { centerCoordinate: [longitude as number, latitude as number], zoomLevel } : null;

export const pinTarget = (pin: Pick<MapMakerInfoData, 'Latitude' | 'Longitude'>): CameraTarget | null => pointTarget(pin.Latitude, pin.Longitude, FOCUS_ZOOM);

export interface DepartmentCenter {
  centerLatitude: number | null;
  centerLongitude: number | null;
  zoomLevel: number | null;
}

export interface FallbackCenter {
  latitude: number;
  longitude: number;
  zoomLevel: number;
}

/** The department's map centre from the map data (`CenterLat`/`CenterLon`/`ZoomLevel`), else the provider's centre. */
export const departmentTarget = ({ centerLatitude, centerLongitude, zoomLevel }: DepartmentCenter, fallback: FallbackCenter): CameraTarget => {
  const zoom = typeof zoomLevel === 'number' && zoomLevel > 0 ? zoomLevel : DEFAULT_ZOOM;
  return pointTarget(centerLatitude, centerLongitude, zoom) ?? { centerCoordinate: [fallback.longitude, fallback.latitude], zoomLevel: fallback.zoomLevel > 0 ? fallback.zoomLevel : DEFAULT_ZOOM };
};

export type HomeTargetReason = 'focus' | 'own-location' | 'department';

export interface HomeTargetInput {
  focusPin: Pick<MapMakerInfoData, 'Latitude' | 'Longitude'> | null;
  ownLocation: { latitude: number; longitude: number } | null;
  /** Field apps (the device transmits its position) open on themselves; consoles and boards on the department. */
  preferOwnLocation: boolean;
  department: CameraTarget;
}

/** The default frame, which is also where "recenter" returns: focus → own position (field apps) → department. */
export const resolveHomeTarget = ({ focusPin, ownLocation, preferOwnLocation, department }: HomeTargetInput): { target: CameraTarget; reason: HomeTargetReason } => {
  const focus = focusPin ? pinTarget(focusPin) : null;
  if (focus) return { target: focus, reason: 'focus' };
  const own = preferOwnLocation && ownLocation ? pointTarget(ownLocation.latitude, ownLocation.longitude, OWN_LOCATION_ZOOM) : null;
  if (own) return { target: own, reason: 'own-location' };
  return { target: department, reason: 'department' };
};
