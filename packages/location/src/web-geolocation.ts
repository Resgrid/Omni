import type { LocationFix, LocationPermissionStatus, LocationWatch } from './types';

/**
 * Browser geolocation for web and Electron (Unit/IC web path): expo-location's task manager does not exist there, so a
 * plain `navigator.geolocation` watcher feeds the same pipeline. Foreground only — browsers throttle hidden pages.
 */
export interface GeolocationLike {
  watchPosition(success: (position: GeolocationPosition) => void, error?: ((error: GeolocationPositionError) => void) | null, options?: PositionOptions): number;
  clearWatch(watchId: number): void;
  getCurrentPosition(success: (position: GeolocationPosition) => void, error?: ((error: GeolocationPositionError) => void) | null, options?: PositionOptions): void;
}

/** Browser `PositionError.PERMISSION_DENIED`. */
export const BROWSER_PERMISSION_DENIED = 1;

/** Same pacing the legacy web watchers used. */
export const BROWSER_WATCH_OPTIONS: PositionOptions = { enableHighAccuracy: false, maximumAge: 15_000, timeout: 30_000 };

export const getBrowserGeolocation = (): GeolocationLike | null => {
  if (typeof navigator === 'undefined' || navigator === null) return null;
  const geolocation = (navigator as Navigator & { geolocation?: GeolocationLike }).geolocation;
  return geolocation && typeof geolocation.watchPosition === 'function' ? geolocation : null;
};

const finiteOrNull = (value: number | null | undefined): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);

export const fromBrowserPosition = (position: GeolocationPosition): LocationFix => ({
  coords: {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    altitude: finiteOrNull(position.coords.altitude),
    accuracy: finiteOrNull(position.coords.accuracy),
    altitudeAccuracy: finiteOrNull(position.coords.altitudeAccuracy),
    heading: finiteOrNull(position.coords.heading),
    speed: finiteOrNull(position.coords.speed),
  },
  timestamp: position.timestamp,
});

export interface BrowserGeolocationError {
  code: number;
  message: string;
}

export function watchBrowserPosition(geolocation: GeolocationLike, onFix: (fix: LocationFix) => void, onError: (error: BrowserGeolocationError) => void, options: PositionOptions = BROWSER_WATCH_OPTIONS): LocationWatch {
  const watchId = geolocation.watchPosition(
    (position) => onFix(fromBrowserPosition(position)),
    (error) => onError({ code: error.code, message: error.message }),
    options
  );
  return { remove: () => geolocation.clearWatch(watchId) };
}

/** One browser fix; rejects with `{ code, message }` (code 1 = permission denied). */
export const getBrowserPosition = (geolocation: GeolocationLike, options: PositionOptions): Promise<LocationFix> =>
  new Promise((resolve, reject) => {
    geolocation.getCurrentPosition(
      (position) => resolve(fromBrowserPosition(position)),
      (error) => reject({ code: error.code, message: error.message } satisfies BrowserGeolocationError),
      options
    );
  });

/** The browser's geolocation permission without prompting, or null where the Permissions API is missing (Safari, older Electron). */
export async function queryBrowserPermission(): Promise<LocationPermissionStatus | null> {
  if (typeof navigator === 'undefined' || navigator === null) return null;
  const permissions = (navigator as Navigator & { permissions?: Permissions }).permissions;
  if (!permissions || typeof permissions.query !== 'function') return null;
  try {
    const result = await permissions.query({ name: 'geolocation' });
    return result.state === 'granted' ? 'granted' : result.state === 'denied' ? 'denied' : 'undetermined';
  } catch {
    return null;
  }
}
