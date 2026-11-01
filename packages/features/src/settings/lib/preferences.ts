import { getActiveVariant } from '@resgrid/config';
import { KEEP_ALIVE_STORAGE_KEY } from '@resgrid/core';
import { devicePreferencesKv } from '@resgrid/features/auth-ui';
import { CONTRACT_KEYS, readLegacyString } from '@resgrid/offline';
import type { ModeType } from '@resgrid/ui';
import { useSyncExternalStore } from 'react';

// Device preferences under their frozen legacy keys (findings-core §0), so an upgraded install keeps its choices. Theme,
// navigation app and keep-awake survive logout (DEVICE_PREFERENCE_KEYS); the two location switches follow the session
// wipe as they did in Responder and Unit.

export const REALTIME_GEOLOCATION_KEY = 'REALTIME_GEOLOCATION_ENABLED';
export const BACKGROUND_GEOLOCATION_KEY = 'BACKGROUND_GEOLOCATION_ENABLED';
export const THEME_KEY = CONTRACT_KEYS.selectedTheme;

let version = 0;
const listeners = new Set<() => void>();

/** Re-renders every preference reader (and tells location to re-read its settings). */
export const notifyPreferencesChanged = (): void => {
  version += 1;
  listeners.forEach((listener) => listener());
};

export const subscribePreferences = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const getVersion = (): number => version;

/** Subscribes a component to preference changes; returns a value that changes with them. */
export const usePreferencesVersion = (): number => useSyncExternalStore(subscribePreferences, getVersion, getVersion);

const readBoolean = (key: string): boolean | undefined => {
  try {
    return devicePreferencesKv()?.getBoolean(key);
  } catch {
    return undefined;
  }
};

const writeValue = (key: string, value: string | boolean): void => {
  devicePreferencesKv()?.set(key, value);
  notifyPreferencesChanged();
};

// ---- Theme ------------------------------------------------------------------------------------------------------------

const THEMES: readonly ModeType[] = ['light', 'dark', 'system'];

/** The saved colour scheme (`SELECTED_THEME`, raw string as `useMMKVString` wrote it); `system` when none was chosen. */
export const getThemeMode = (): ModeType => {
  const kv = devicePreferencesKv();
  const stored = kv ? readLegacyString(kv, THEME_KEY) : null;
  return THEMES.find((theme) => theme === stored) ?? 'system';
};

/** Saves the colour scheme; the shell passes `getThemeMode()` to GluestackUIProvider and re-renders on `subscribePreferences`. */
export const setThemeMode = (mode: ModeType): void => writeValue(THEME_KEY, mode);

// ---- Location ---------------------------------------------------------------------------------------------------------

export interface LocationPreferences {
  realtimeGeolocation: boolean;
  backgroundGeolocation: boolean;
}

/**
 * Realtime Geolocation defaults to `capabilities.location.geoHubDefault` (Unit on — taking every installed unit off the
 * dispatch map on upgrade would be a safety regression; Responder off); Background Geolocation is off until the member
 * turns it on and grants "always". Shape matches @resgrid/location `LocationSettings`, so the shell passes
 * `getSettings: getLocationPreferences, subscribeSettings: subscribePreferences` to `configureLocation`.
 */
export const getLocationPreferences = (): LocationPreferences => {
  let geoHubDefault = false;
  try {
    geoHubDefault = getActiveVariant().capabilities.location.geoHubDefault;
  } catch {
    // No variant yet: the conservative default.
  }
  return {
    realtimeGeolocation: readBoolean(REALTIME_GEOLOCATION_KEY) ?? geoHubDefault,
    backgroundGeolocation: readBoolean(BACKGROUND_GEOLOCATION_KEY) ?? false,
  };
};

export const setRealtimeGeolocationPreference = (enabled: boolean): void => writeValue(REALTIME_GEOLOCATION_KEY, enabled);

export const setBackgroundGeolocationPreference = (enabled: boolean): void => writeValue(BACKGROUND_GEOLOCATION_KEY, enabled);

// ---- Keep the screen awake ----------------------------------------------------------------------------------------------

export const getKeepAlivePreference = (): boolean => readBoolean(KEEP_ALIVE_STORAGE_KEY) ?? false;

export const setKeepAlivePreference = (enabled: boolean): void => writeValue(KEEP_ALIVE_STORAGE_KEY, enabled);
