import { devicePreferencesKv } from '@resgrid/features/auth-ui';
import { readLegacyString } from '@resgrid/offline';
import { Platform } from 'react-native';

import { notifyPreferencesChanged } from './preferences';

/**
 * The per-device "Navigation app" preference (Responder/Unit/IC `lib/storage/navigation-app.ts`): which app opens for
 * directions to a call, destination, POI, map pin, route stop or contact. It describes the apps installed on this device,
 * not the signed-in user, so logout keeps it (DEVICE_PREFERENCE_KEYS). Key frozen: `NAVIGATION_APP`.
 */
export const NAVIGATION_APP_STORAGE_KEY = 'NAVIGATION_APP';

/**
 * - `default`: the device decides (Android `geo:` intent / chooser; iOS Apple Maps; web and desktop Google Maps).
 * - `google_maps` / `apple_maps` / `waze`: always that app (Apple Maps exists on iOS only).
 * - `gaia_gps` / `here_wego` / `mapquest` / `onx_offroad` / `organic_maps` / `osmand`: iOS and Android only; some only show
 *   the destination rather than starting a route (see navigation-handoff.ts).
 */
export type NavigationApp = 'default' | 'google_maps' | 'apple_maps' | 'waze' | 'gaia_gps' | 'here_wego' | 'mapquest' | 'onx_offroad' | 'organic_maps' | 'osmand';

export const ALL_NAVIGATION_APPS: readonly NavigationApp[] = ['default', 'google_maps', 'apple_maps', 'waze', 'gaia_gps', 'here_wego', 'mapquest', 'onx_offroad', 'organic_maps', 'osmand'];

/** Apps that only exist on phones and tablets, so web and desktop have nothing of theirs to open. */
const MOBILE_ONLY_NAVIGATION_APPS: readonly NavigationApp[] = ['gaia_gps', 'here_wego', 'mapquest', 'onx_offroad', 'organic_maps', 'osmand'];

export const NAVIGATION_APP_LABEL_KEYS: Readonly<Record<NavigationApp, string>> = {
  default: 'settings.navigation_app.default',
  google_maps: 'settings.navigation_app.google_maps',
  apple_maps: 'settings.navigation_app.apple_maps',
  waze: 'settings.navigation_app.waze',
  gaia_gps: 'settings.navigation_app.gaia_gps',
  here_wego: 'settings.navigation_app.here_wego',
  mapquest: 'settings.navigation_app.mapquest',
  onx_offroad: 'settings.navigation_app.onx_offroad',
  organic_maps: 'settings.navigation_app.organic_maps',
  osmand: 'settings.navigation_app.osmand',
};

const isOfferedOn = (app: NavigationApp, platform: string): boolean => {
  if (app === 'apple_maps') {
    return platform === 'ios';
  }
  return !MOBILE_ONLY_NAVIGATION_APPS.includes(app) || platform === 'ios' || platform === 'android';
};

/** The choices that make sense on a platform, in display order. */
export const getNavigationAppOptions = (platform: string = Platform.OS): NavigationApp[] => ALL_NAVIGATION_APPS.filter((app) => isOfferedOn(app, platform));

/** A stored value as a valid choice for the platform; anything unknown or unavailable is `default`. */
export const normalizeNavigationApp = (value: string | null | undefined, platform: string = Platform.OS): NavigationApp => getNavigationAppOptions(platform).find((app) => app === value) ?? 'default';

/** The saved navigation app for this device, `default` when none was chosen. */
export const getNavigationApp = (): NavigationApp => {
  try {
    const kv = devicePreferencesKv();
    return normalizeNavigationApp(kv ? readLegacyString(kv, NAVIGATION_APP_STORAGE_KEY) : null);
  } catch {
    return 'default';
  }
};

/** Saves the navigation app for this device (raw string, as the legacy `storage.set` wrote it). */
export const setNavigationApp = (app: NavigationApp): void => {
  devicePreferencesKv()?.set(NAVIGATION_APP_STORAGE_KEY, app);
  notifyPreferencesChanged();
};
