import type { ApiContext } from '@resgrid/api';
import { getActiveVariant, getCapability } from '@resgrid/config';
import { logger } from '@resgrid/core';
import React, { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';

import { type MapOfflineOptions, OFFLINE_MAP_ATTRIBUTION } from '../offline/types';
import { configureMapRenderer } from '../rg/renderer-setup';
import type { MapColorScheme, StyleSpecification } from '../types';
import { type MapIconRegistry, type MapPacksProfile, MapProviderContext, type MapProviderContextValue, type MapsCapabilities, type MapStyleState, NO_MAP_CAPABILITIES } from './context';
import { resolveMapCenter } from './map-center';
import type { MapOverlaySlots } from './overlay-types';
import { createMapServices, type MapServices } from './services';
import { defaultMapFetch, loadMapboxStyle, type MapFetch } from './style-loader';
import { buildRasterStyle, type MapConfigInput, type MapStyleSource, resolveMapStyleSource, styleSourceKey } from './style-resolution';
import { type MapThemeColors, resolveMapTheme } from './theme';
import { cleanString, isSafeMapUrl } from './url-safety';

export interface MapProviderProps {
  /** `Config/GetConfig` data (or the subset `MapConfigInput` lists); null before config loads. */
  config: MapConfigInput | null | undefined;
  /** Resolved app theme; selects the day or night style. */
  colorScheme: MapColorScheme;
  /** API context for default services (reverse geocode, legend) and tile URL builders. */
  apiContext?: ApiContext | null;
  /** Variant capabilities; read from the active variant manifest when omitted. */
  capabilities?: MapsCapabilities;
  /** Bundled map icons (`apps/omni/assets/mapping`) keyed by lower-case name. */
  icons?: MapIconRegistry;
  /** The app's NativeModal / CustomBottomSheet (see `MapOverlaySlots`). */
  overlays?: MapOverlaySlots;
  /** Colours from `useThemeColors()`; defaults match the gluestack neutrals. */
  theme?: Partial<MapThemeColors>;
  services?: Partial<MapServices>;
  /** §19.5 seam: the offline style switch (D16). Omit to stay online. */
  offline?: MapOfflineOptions | null;
  /** Web/Electron: served URL of `maplibre-gl-worker.mjs`. */
  webWorkerUrl?: string | null;
  /** Injectable fetch for the Mapbox style fallback (tests). */
  fetchImpl?: MapFetch;
  children?: ReactNode;
}

interface LoadedStyle {
  key: string;
  style: StyleSpecification | null;
}

const readVariantCapabilities = (): MapsCapabilities => {
  try {
    return getCapability('maps');
  } catch {
    return NO_MAP_CAPABILITIES;
  }
};

const readVariantMapPacks = (): MapPacksProfile | null => {
  try {
    return getActiveVariant().offline.mapPacks;
  } catch {
    return null;
  }
};

/** Only the config fields the maps read, so an unrelated config change does not re-resolve styles. */
const pickMapConfig = (config: MapConfigInput | null | undefined): MapConfigInput => ({
  MapUrl: config?.MapUrl,
  MapAttribution: config?.MapAttribution,
  MapDayStyleUrl: config?.MapDayStyleUrl,
  MapNightStyleUrl: config?.MapNightStyleUrl,
  AppMapboxAccessToken: config?.AppMapboxAccessToken,
  MapProvider: config?.MapProvider,
  MapStyleUrl: config?.MapStyleUrl,
  MapAccessToken: config?.MapAccessToken,
  MapCenterLatitude: config?.MapCenterLatitude,
  MapCenterLongitude: config?.MapCenterLongitude,
  MapCenterZoomLevel: config?.MapCenterZoomLevel,
  MapRenderer: config?.MapRenderer,
  MapLibreStyleUrlDay: config?.MapLibreStyleUrlDay,
  MapLibreStyleUrlNight: config?.MapLibreStyleUrlNight,
  MapRasterTileUrl: config?.MapRasterTileUrl,
  StaticMapUrlTemplate: config?.StaticMapUrlTemplate,
});

const joinAttribution = (...parts: string[]): string => parts.filter((part) => part.length > 0).join(' · ');

/**
 * Computes the style state for a resolved source and the loaded Mapbox style (if any). Exported for tests.
 */
export const deriveMapStyleState = (source: MapStyleSource, scheme: MapColorScheme, loaded: LoadedStyle | null, offline: MapOfflineOptions | null | undefined): MapStyleState => {
  const base = { scheme, isDark: scheme === 'dark', isOffline: false };

  if (offline && offline.mode !== 'online') {
    const offlineStyle = offline.getStyle(scheme);
    if (offlineStyle) {
      return {
        ...base,
        status: 'ready',
        mapStyle: offlineStyle,
        kind: 'offline',
        attribution: joinAttribution(offline.attribution ?? OFFLINE_MAP_ATTRIBUTION),
        isAvailable: true,
        isOffline: true,
        styleKey: `offline:${scheme}`,
      };
    }
  }

  const key = styleSourceKey(source);
  switch (source.kind) {
    case 'maplibre':
      return { ...base, status: 'ready', mapStyle: source.url, kind: 'maplibre', attribution: source.attribution, isAvailable: true, styleKey: key };
    case 'raster':
      return { ...base, status: 'ready', mapStyle: buildRasterStyle(source), kind: 'raster', attribution: source.attribution, isAvailable: true, styleKey: key };
    case 'mapbox': {
      if (!loaded || loaded.key !== key) {
        return { ...base, status: 'loading', mapStyle: null, kind: 'mapbox', attribution: source.attribution, isAvailable: true, styleKey: key };
      }
      if (loaded.style) {
        return { ...base, status: 'ready', mapStyle: loaded.style, kind: 'mapbox', attribution: source.attribution, isAvailable: true, styleKey: key };
      }
      if (source.rasterFallback) {
        return {
          ...base,
          status: 'ready',
          mapStyle: buildRasterStyle(source.rasterFallback),
          kind: 'raster',
          attribution: source.rasterFallback.attribution,
          isAvailable: true,
          styleKey: styleSourceKey(source.rasterFallback),
        };
      }
      return { ...base, status: 'error', mapStyle: null, kind: 'mapbox', attribution: source.attribution, isAvailable: false, styleKey: key };
    }
    default:
      return { ...base, status: 'none', mapStyle: null, kind: 'none', attribution: '', isAvailable: false, styleKey: 'none' };
  }
};

/**
 * Map provider (MapLibre plan §8.1 `map-provider`): resolves the department style for the current theme, attribution,
 * capabilities, centre, icons, overlay slots and services once for every map below it. Mount it in the app shell
 * inside the theme and config providers.
 */
export function MapProvider({ config, colorScheme, apiContext, capabilities, icons, overlays, theme, services, offline, webWorkerUrl, fetchImpl = defaultMapFetch, children }: MapProviderProps) {
  const mapConfig = pickMapConfig(config);
  const configKey = JSON.stringify(mapConfig);
  // configKey captures every field the resolver reads.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const source = useMemo(() => resolveMapStyleSource(mapConfig, colorScheme), [configKey, colorScheme]);
  const sourceKey = styleSourceKey(source);
  const [loaded, setLoaded] = useState<LoadedStyle | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    configureMapRenderer({ workerUrl: webWorkerUrl });
  }, [webWorkerUrl]);

  useEffect(() => {
    if (source.kind !== 'mapbox') {
      return undefined;
    }
    let active = true;
    loadMapboxStyle({ styleUrl: source.styleUrl, fetchUrl: source.fetchUrl, token: source.token, attribution: source.attribution }, fetchImpl)
      .then((style) => {
        if (active) setLoaded({ key: sourceKey, style });
      })
      .catch((error: unknown) => {
        // The fetch URL carries the token: log the mapbox:// style id only.
        logger.warn({ message: 'Could not load the Mapbox style for MapLibre', context: { styleUrl: source.styleUrl, reason: error instanceof Error ? error.message : 'unknown' } });
        if (active) setLoaded({ key: sourceKey, style: null });
      });
    return () => {
      active = false;
    };
    // sourceKey identifies the source; attempt forces a retry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceKey, attempt, fetchImpl]);

  const retry = useCallback(() => {
    setLoaded(null);
    setAttempt((value) => value + 1);
  }, []);

  const style = useMemo(() => deriveMapStyleState(source, colorScheme, loaded, offline), [source, colorScheme, loaded, offline]);
  const themeKey = JSON.stringify(theme ?? {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const resolvedTheme = useMemo(() => resolveMapTheme(colorScheme, theme), [colorScheme, themeKey]);
  const resolvedServices = useMemo(() => createMapServices(apiContext, services), [apiContext, services]);
  const resolvedCapabilities = useMemo(() => capabilities ?? readVariantCapabilities(), [capabilities]);
  const template = cleanString(mapConfig.StaticMapUrlTemplate);

  const value = useMemo<MapProviderContextValue>(
    () => ({
      hasProvider: true,
      style,
      retry,
      scheme: colorScheme,
      theme: resolvedTheme,
      center: resolveMapCenter(mapConfig.MapCenterLatitude, mapConfig.MapCenterLongitude, mapConfig.MapCenterZoomLevel),
      capabilities: resolvedCapabilities,
      mapPacks: readVariantMapPacks(),
      icons: icons ?? {},
      overlays: overlays ?? {},
      services: resolvedServices,
      staticMapUrlTemplate: isSafeMapUrl(template) ? template : null,
      offlineUpdatedAt: offline?.updatedAt ?? null,
    }),
    // configKey covers the centre and template fields.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [style, retry, colorScheme, resolvedTheme, configKey, resolvedCapabilities, icons, overlays, resolvedServices, offline?.updatedAt]
  );

  return <MapProviderContext.Provider value={value}>{children}</MapProviderContext.Provider>;
}
