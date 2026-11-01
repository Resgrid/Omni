import type { MapColorScheme, StyleSpecification } from '../types';
import { isPublicMapboxToken, mapboxStyleFetchUrl, parseMapboxStyleUrl } from './mapbox-compat';
import { cleanString, isSafeMapUrl } from './url-safety';

/**
 * Map style resolution (MapLibre plan §5.4, §8.3). Pure: config + theme in, a description of what to load out.
 *
 * Order:
 * 1. `MapLibreStyleUrlDay` / `MapLibreStyleUrlNight` — signed `Mapping/GetStyle` URLs from servers with MapLibre support.
 *    The other theme's URL stands in when one is missing.
 * 2. Mapbox fallback for older servers: the day/night `mapbox://styles/…` URL (else `MapStyleUrl`, else Mapbox's
 *    Streets / Dark defaults) plus a public token (`AppMapboxAccessToken`, else `MapAccessToken`). The provider fetches
 *    the style JSON and rewrites `mapbox://` URLs client-side (`transformMapboxStyle`).
 * 3. Raster fallback: an XYZ tile URL (`MapRasterTileUrl`, else `MapUrl`) wrapped in a one-layer style — self-hosted
 *    (Leaflet) installs, and the safety net when the Mapbox style cannot be fetched.
 * 4. Nothing usable → `none`: maps are hidden (this replaces Responder's "Mapbox is not configured" checks).
 */

/** Config fields the resolver reads: today's `GetConfigResultData` map fields plus the additive §5.4 fields. */
export interface MapConfigInput {
  MapUrl?: string | null;
  MapAttribution?: string | null;
  MapDayStyleUrl?: string | null;
  MapNightStyleUrl?: string | null;
  AppMapboxAccessToken?: string | null;
  IsDepartmentMapOverride?: boolean | null;
  MapProvider?: string | null;
  MapStyleUrl?: string | null;
  MapAccessToken?: string | null;
  MapCenterLatitude?: number | null;
  MapCenterLongitude?: number | null;
  MapCenterZoomLevel?: number | null;
  /** §5.4: `"maplibre"` on servers that ship MapLibre styles; absent on older servers. */
  MapRenderer?: string | null;
  MapLibreStyleUrlDay?: string | null;
  MapLibreStyleUrlNight?: string | null;
  MapRasterTileUrl?: string | null;
  /** §6.6 signed static map template (see `fillStaticMapTemplate`). */
  StaticMapUrlTemplate?: string | null;
}

export const FALLBACK_MAPBOX_DAY_STYLE = 'mapbox://styles/mapbox/streets-v12';
export const FALLBACK_MAPBOX_NIGHT_STYLE = 'mapbox://styles/mapbox/dark-v11';
export const DEFAULT_MAPBOX_ATTRIBUTION = '© Mapbox © OpenStreetMap';
export const DEFAULT_RASTER_ATTRIBUTION = '© OpenStreetMap contributors';

export interface RasterStyleSource {
  kind: 'raster';
  tileUrl: string;
  tileSize: number;
  attribution: string;
}

export type MapStyleSource =
  | { kind: 'maplibre'; url: string; attribution: string }
  | { kind: 'mapbox'; styleUrl: string; fetchUrl: string; token: string; attribution: string; rasterFallback: RasterStyleSource | null }
  | RasterStyleSource
  | { kind: 'none'; attribution: '' };

const hasTilePlaceholders = (url: string): boolean => url.includes('{z}') && url.includes('{x}') && (url.includes('{y}') || url.includes('{-y}'));

/** The raster fallback, when the config carries a usable XYZ tile URL. */
export const resolveRasterSource = (config: MapConfigInput | null | undefined, allowLocalHttp?: boolean): RasterStyleSource | null => {
  const candidates = [cleanString(config?.MapRasterTileUrl), cleanString(config?.MapUrl)];
  const tileUrl = candidates.find((url) => isSafeMapUrl(url, allowLocalHttp) && hasTilePlaceholders(url));
  if (!tileUrl) {
    return null;
  }
  return { kind: 'raster', tileUrl, tileSize: 256, attribution: cleanString(config?.MapAttribution) || DEFAULT_RASTER_ATTRIBUTION };
};

const pickByScheme = (scheme: MapColorScheme, day: string, night: string): string => (scheme === 'dark' ? night || day : day || night);

export const resolveMapStyleSource = (config: MapConfigInput | null | undefined, scheme: MapColorScheme, allowLocalHttp?: boolean): MapStyleSource => {
  const attribution = cleanString(config?.MapAttribution);

  // 1. MapLibre styles from the server (D6 / D12).
  const day = cleanString(config?.MapLibreStyleUrlDay);
  const night = cleanString(config?.MapLibreStyleUrlNight);
  const maplibreUrl = pickByScheme(scheme, isSafeMapUrl(day, allowLocalHttp) ? day : '', isSafeMapUrl(night, allowLocalHttp) ? night : '');
  if (maplibreUrl) {
    return { kind: 'maplibre', url: maplibreUrl, attribution };
  }

  const raster = resolveRasterSource(config, allowLocalHttp);

  // 2. Mapbox style + public token, transformed client-side (§8.3).
  const tokenCandidates = [cleanString(config?.AppMapboxAccessToken), cleanString(config?.MapAccessToken)];
  const token = tokenCandidates.find((candidate) => isPublicMapboxToken(candidate));
  if (token) {
    const dayStyle = cleanString(config?.MapDayStyleUrl);
    const nightStyle = cleanString(config?.MapNightStyleUrl);
    const chosen = pickByScheme(scheme, parseMapboxStyleUrl(dayStyle) ? dayStyle : '', parseMapboxStyleUrl(nightStyle) ? nightStyle : '');
    const generic = cleanString(config?.MapStyleUrl);
    const styleUrl = chosen || (parseMapboxStyleUrl(generic) ? generic : '') || (scheme === 'dark' ? FALLBACK_MAPBOX_NIGHT_STYLE : FALLBACK_MAPBOX_DAY_STYLE);
    const fetchUrl = mapboxStyleFetchUrl(styleUrl, token);
    if (fetchUrl) {
      return { kind: 'mapbox', styleUrl, fetchUrl, token, attribution: attribution || DEFAULT_MAPBOX_ATTRIBUTION, rasterFallback: raster };
    }
  }

  // 3. Raster tiles.
  if (raster) {
    return raster;
  }

  // 4. Nothing to draw.
  return { kind: 'none', attribution: '' };
};

/** One raster layer over the tile URL; attribution lives on the source so both renderers show it. */
export const buildRasterStyle = (source: RasterStyleSource): StyleSpecification =>
  ({
    version: 8,
    sources: {
      'resgrid-raster': { type: 'raster', tiles: [source.tileUrl], tileSize: source.tileSize, attribution: source.attribution },
    },
    layers: [{ id: 'resgrid-raster', type: 'raster', source: 'resgrid-raster' }],
  }) as StyleSpecification;

/** Identity of a source for caching / restyle detection (never contains the token). */
export const styleSourceKey = (source: MapStyleSource): string => {
  switch (source.kind) {
    case 'maplibre':
      return `maplibre:${source.url}`;
    case 'mapbox':
      return `mapbox:${source.styleUrl}`;
    case 'raster':
      return `raster:${source.tileUrl}`;
    default:
      return 'none';
  }
};
