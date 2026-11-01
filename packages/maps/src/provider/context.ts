import type { Capabilities } from '@resgrid/config';
import { createContext, useContext } from 'react';

import type { MapColorScheme, MapStyle } from '../types';
import { FALLBACK_MAP_CENTER, type MapCenter } from './map-center';
import type { MapOverlaySlots } from './overlay-types';
import { createMapServices, type MapServices } from './services';
import { LIGHT_MAP_THEME, type MapThemeColors } from './theme';

export type MapsCapabilities = Capabilities['maps'];
export type MapPacksProfile = 'full' | 'light' | 'display';

/** Bundled map icons keyed by lower-case `ImagePath` (`call`, `engine_available`, `station`…), passed in by the app. */
export type MapIconSource = number | string | { uri: string };
export type MapIconRegistry = Readonly<Record<string, MapIconSource>>;

export type MapStyleKind = 'maplibre' | 'mapbox' | 'raster' | 'offline' | 'none';

export interface MapStyleState {
  /** `loading` while a Mapbox style is fetched; `none` when no style is configured; `error` when loading failed with no fallback. */
  status: 'loading' | 'ready' | 'none' | 'error';
  mapStyle: MapStyle | null;
  kind: MapStyleKind;
  attribution: string;
  scheme: MapColorScheme;
  isDark: boolean;
  /** False → hide maps (no style), the replacement for Responder's `isMapboxConfigured`. */
  isAvailable: boolean;
  isOffline: boolean;
  /** Changes whenever the base style changes (theme, server, online/offline) — never contains a token. */
  styleKey: string;
}

export interface MapProviderContextValue {
  hasProvider: boolean;
  style: MapStyleState;
  /** Retry a failed style load. */
  retry: () => void;
  scheme: MapColorScheme;
  theme: MapThemeColors;
  center: MapCenter;
  capabilities: MapsCapabilities;
  mapPacks: MapPacksProfile | null;
  icons: MapIconRegistry;
  overlays: MapOverlaySlots;
  services: MapServices;
  staticMapUrlTemplate: string | null;
  /** Epoch ms of the last offline pack refresh, for the offline badge. */
  offlineUpdatedAt: number | null;
}

export const NO_MAP_CAPABILITIES: MapsCapabilities = { layers: false, customIndoor: false, navigationInApp: false };

export const NO_STYLE: MapStyleState = {
  status: 'none',
  mapStyle: null,
  kind: 'none',
  attribution: '',
  scheme: 'light',
  isDark: false,
  isAvailable: false,
  isOffline: false,
  styleKey: 'none',
};

const DEFAULT_CONTEXT: MapProviderContextValue = {
  hasProvider: false,
  style: NO_STYLE,
  retry: () => undefined,
  scheme: 'light',
  theme: LIGHT_MAP_THEME,
  center: FALLBACK_MAP_CENTER,
  capabilities: NO_MAP_CAPABILITIES,
  mapPacks: null,
  icons: {},
  overlays: {},
  services: createMapServices(null),
  staticMapUrlTemplate: null,
  offlineUpdatedAt: null,
};

export const MapProviderContext = createContext<MapProviderContextValue>(DEFAULT_CONTEXT);

export const useMapProviderContext = (): MapProviderContextValue => useContext(MapProviderContext);

/** The resolved department map style for the current theme (`MapView` uses it when given no style). */
export const useMapStyle = (): MapStyleState => useContext(MapProviderContext).style;

export const useMapTheme = (): { colors: MapThemeColors; isDark: boolean; scheme: MapColorScheme } => {
  const { theme, scheme } = useContext(MapProviderContext);
  return { colors: theme, isDark: scheme === 'dark', scheme };
};

export const useMapCenter = (): MapCenter => useContext(MapProviderContext).center;

export const useMapServices = (): MapServices => useContext(MapProviderContext).services;

export const useMapIcons = (): MapIconRegistry => useContext(MapProviderContext).icons;

export const useMapCapabilities = (): MapsCapabilities => useContext(MapProviderContext).capabilities;
