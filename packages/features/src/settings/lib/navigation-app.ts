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
 * - `resgrid`: in-app turn-by-turn (MapLibre plan §9.1) — offered, and the default, only where the app can navigate
 *   (`maps.navigationInApp`, a navigation-capable server and the `Navigation.InApp` flag); elsewhere it reads as `default`.
 * - `default`: the device decides (Android `geo:` intent / chooser; iOS Apple Maps; web and desktop Google Maps).
 * - `google_maps` / `apple_maps` / `waze`: always that app (Apple Maps exists on iOS only).
 * - `gaia_gps` / `here_wego` / `mapquest` / `onx_offroad` / `organic_maps` / `osmand`: iOS and Android only; some only show
 *   the destination rather than starting a route (see navigation-handoff.ts).
 */
export type NavigationApp = 'resgrid' | 'default' | 'google_maps' | 'apple_maps' | 'waze' | 'gaia_gps' | 'here_wego' | 'mapquest' | 'onx_offroad' | 'organic_maps' | 'osmand';

/** An external app the hand-off can open (everything but in-app navigation). */
export type ExternalNavigationApp = Exclude<NavigationApp, 'resgrid'>;

export const ALL_NAVIGATION_APPS: readonly NavigationApp[] = ['resgrid', 'default', 'google_maps', 'apple_maps', 'waze', 'gaia_gps', 'here_wego', 'mapquest', 'onx_offroad', 'organic_maps', 'osmand'];

/** Whether in-app navigation can be chosen (the caller knows: capability, server and flag). */
export interface NavigationAppAvailability {
  inApp?: boolean;
}

/** Apps that only exist on phones and tablets, so web and desktop have nothing of theirs to open. */
const MOBILE_ONLY_NAVIGATION_APPS: readonly NavigationApp[] = ['gaia_gps', 'here_wego', 'mapquest', 'onx_offroad', 'organic_maps', 'osmand'];

export const NAVIGATION_APP_LABEL_KEYS: Readonly<Record<NavigationApp, string>> = {
  resgrid: 'settings.navigation_app.resgrid',
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

const isOfferedOn = (app: NavigationApp, platform: string, availability: NavigationAppAvailability): boolean => {
  if (app === 'resgrid') {
    return availability.inApp === true;
  }
  if (app === 'apple_maps') {
    return platform === 'ios';
  }
  return !MOBILE_ONLY_NAVIGATION_APPS.includes(app) || platform === 'ios' || platform === 'android';
};

/** The choices that make sense on a platform, in display order (in-app navigation first where it is available). */
export const getNavigationAppOptions = (platform: string = Platform.OS, availability: NavigationAppAvailability = {}): NavigationApp[] => ALL_NAVIGATION_APPS.filter((app) => isOfferedOn(app, platform, availability));

/** A stored value as a valid choice for the platform; anything unknown or unavailable is `default`. */
export const normalizeNavigationApp = (value: string | null | undefined, platform: string = Platform.OS, availability: NavigationAppAvailability = {}): NavigationApp =>
  getNavigationAppOptions(platform, availability).find((app) => app === value) ?? 'default';

/**
 * The saved navigation app for this device. Nothing saved: in-app navigation where it is available, else `default`.
 * Without `inApp` the answer is always an external app (what the hand-off opens).
 */
export const getNavigationApp = (availability: NavigationAppAvailability = {}): NavigationApp => {
  try {
    const kv = devicePreferencesKv();
    const stored = kv ? readLegacyString(kv, NAVIGATION_APP_STORAGE_KEY) : null;
    if (stored === null && availability.inApp === true) return 'resgrid';
    return normalizeNavigationApp(stored, Platform.OS, availability);
  } catch {
    return availability.inApp === true ? 'resgrid' : 'default';
  }
};

/** The external app the hand-off opens (`resgrid` or nothing saved reads as `default`). */
export const getExternalNavigationApp = (): ExternalNavigationApp => {
  const app = getNavigationApp();
  return app === 'resgrid' ? 'default' : app;
};

/** Saves the navigation app for this device (raw string, as the legacy `storage.set` wrote it). */
export const setNavigationApp = (app: NavigationApp): void => {
  devicePreferencesKv()?.set(NAVIGATION_APP_STORAGE_KEY, app);
  notifyPreferencesChanged();
};
