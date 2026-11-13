import type { MapConfigInput } from './style-resolution';
import { cleanString, isSafeMapUrl } from './url-safety';

/**
 * Routing and traffic capabilities from `Config/GetConfig` (MapLibre plan §5.4), for UI that depends on what the install's
 * routing provider can do (traffic toggle, incident chips, voice, in-app navigation). Older servers send none of these
 * fields: everything reads as unavailable, so new controls stay hidden (§8.3).
 */

export interface MapRoutingCapabilities {
  /** `valhalla`, `mapbox`, `google`, `osrm`, `estimate` (lower-case), or null when the server does not say. */
  provider: string | null;
  supportsTraffic: boolean;
  supportsIncidents: boolean;
  supportsVoice: boolean;
  /**
   * In-app turn-by-turn may be offered: the server says so (Valhalla/Mapbox provider ∧ the department's `Navigation.InApp`
   * flag, D26) and the variant has `maps.navigationInApp`.
   */
  navigationAvailable: boolean;
}

/**
 * `vector`: Mapbox Traffic v1 (congestion lines drawn by the app). `raster`: a department's own traffic image tiles (e.g.
 * TomTom flow), drawn as they come.
 */
export type MapTrafficTileType = 'vector' | 'raster';

export interface MapTrafficConfig {
  /** The overlay can be shown: the server has traffic tiles and the map is online (not on an offline pack style). */
  available: boolean;
  /** Tile template (`{z}/{x}/{y}`, carries the provider's key); null when unavailable. */
  tileUrl: string | null;
  /** What `tileUrl` serves. */
  type: MapTrafficTileType;
  /** Seconds between tile reloads while the overlay is shown (at least 60). */
  refreshSeconds: number;
}

/** Reload interval when the server sends none (the provider refreshes congestion about every 8 minutes). */
export const DEFAULT_TRAFFIC_REFRESH_SECONDS = 300;
export const MIN_TRAFFIC_REFRESH_SECONDS = 60;

export const NO_MAP_ROUTING: MapRoutingCapabilities = { provider: null, supportsTraffic: false, supportsIncidents: false, supportsVoice: false, navigationAvailable: false };
export const NO_MAP_TRAFFIC: MapTrafficConfig = { available: false, tileUrl: null, type: 'vector', refreshSeconds: DEFAULT_TRAFFIC_REFRESH_SECONDS };

const hasTilePlaceholders = (url: string): boolean => url.includes('{z}') && url.includes('{x}') && url.includes('{y}');

export const resolveMapRouting = (config: MapConfigInput | null | undefined, navigationInApp: boolean): MapRoutingCapabilities => {
  const provider = cleanString(config?.RoutingProvider).toLowerCase();

  return {
    provider: provider || null,
    supportsTraffic: config?.RoutingSupportsTraffic === true,
    supportsIncidents: config?.RoutingSupportsIncidents === true,
    supportsVoice: config?.RoutingSupportsVoice === true,
    navigationAvailable: navigationInApp && config?.NavigationAvailable === true,
  };
};

const isTileTemplate = (url: string, allowLocalHttp?: boolean): boolean => isSafeMapUrl(url, allowLocalHttp) && hasTilePlaceholders(url);

/**
 * Traffic tiles only over https (http to localhost in development) and only as a `{z}/{x}/{y}` template. A department's own
 * image tiles (`TrafficRasterTileUrl`) win over the vector overlay; Core sends them in their own field (with
 * `TrafficAvailable` false) so builds without this code show no traffic rather than load images as vector tiles.
 */
export const resolveMapTraffic = (config: MapConfigInput | null | undefined, isOffline: boolean, allowLocalHttp?: boolean): MapTrafficConfig => {
  const seconds = typeof config?.TrafficRefreshSeconds === 'number' && Number.isFinite(config.TrafficRefreshSeconds) ? Math.round(config.TrafficRefreshSeconds) : DEFAULT_TRAFFIC_REFRESH_SECONDS;
  const refreshSeconds = Math.max(MIN_TRAFFIC_REFRESH_SECONDS, seconds);
  const raster = cleanString(config?.TrafficRasterTileUrl);

  if (isTileTemplate(raster, allowLocalHttp)) return { available: !isOffline, tileUrl: raster, type: 'raster', refreshSeconds };
  const url = cleanString(config?.TrafficTileUrl);
  const usable = config?.TrafficAvailable === true && isTileTemplate(url, allowLocalHttp);

  return { available: usable && !isOffline, tileUrl: usable ? url : null, type: 'vector', refreshSeconds };
};
