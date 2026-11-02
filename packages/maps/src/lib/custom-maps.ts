import type { CustomMapLayerResultData, IndoorMapFloorResultData } from '@resgrid/models';

import { isSafeMapUrl } from '../provider/url-safety';
import type { ImageCoordinates } from '../rg/types';

/**
 * URL builders for department map data served by Core: custom map raster tiles, untiled custom map layer images and
 * indoor floor images. The builders return the bare resource URLs; map sources get them only after signing
 * (`useSignedMapUrl`, D12 — native sources cannot send auth headers). Ids go in the path (Mapping v4 routes take `/{id}`).
 */

const joinUrl = (base: string, path: string): string => `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;

/**
 * `{base}/Mapping/GetCustomMapTile/{layerId}/{z}/{x}/{y}`. These legacy tiles are a pixel pyramid (z = image scale,
 * x/y = image tile index), not Web Mercator (D21): they cannot be drawn as an XYZ source on a geographic map and are kept
 * for pixel-space viewers only.
 */
export const buildCustomMapTileUrlTemplate = (apiBaseUrl: string, layerId: string): string | null => {
  const base = apiBaseUrl.trim();
  const id = layerId.trim();
  if (!base || !id) return null;
  return joinUrl(base, `/Mapping/GetCustomMapTile/${encodeURIComponent(id)}/{z}/{x}/{y}`);
};

/** Image of an untiled custom map layer. */
export const buildCustomMapLayerImageUrl = (apiBaseUrl: string, layerId: string): string | null => {
  const base = apiBaseUrl.trim();
  const id = layerId.trim();
  if (!base || !id) return null;
  return joinUrl(base, `/Mapping/GetCustomMapLayerImage/${encodeURIComponent(id)}`);
};

/** Indoor floor image. */
export const buildIndoorFloorImageUrl = (apiBaseUrl: string, floorId: string): string | null => {
  const base = apiBaseUrl.trim();
  const id = floorId.trim();
  if (!base || !id) return null;
  return joinUrl(base, `/Mapping/GetIndoorMapFloorImage/${encodeURIComponent(id)}`);
};

interface BoundsFields {
  BoundsNELat: number | null;
  BoundsNELon: number | null;
  BoundsSWLat: number | null;
  BoundsSWLon: number | null;
}

const finite = (value: number | null | undefined): value is number => typeof value === 'number' && Number.isFinite(value);

/**
 * Image corners (top-left, top-right, bottom-right, bottom-left) from a layer's or floor's NE/SW bounds, or null when the
 * bounds are missing or degenerate.
 */
export const boundsToImageCoordinates = (bounds: BoundsFields): ImageCoordinates | null => {
  const { BoundsNELat: north, BoundsNELon: east, BoundsSWLat: south, BoundsSWLon: west } = bounds;
  if (!finite(north) || !finite(east) || !finite(south) || !finite(west) || north <= south || east === west) {
    return null;
  }
  return [
    [west, north],
    [east, north],
    [east, south],
    [west, south],
  ];
};

const hasTilePlaceholders = (url: string): boolean => url.includes('{z}') && url.includes('{x}') && url.includes('{y}');

/**
 * How a custom map layer draws on a geographic map. `tiles` / `image` URLs still go through `useSignedMapUrl` before a
 * source gets them (a server-signed `MercatorTileUrl` is used as is while fresh and re-signed after).
 */
export type CustomMapLayerRendering = { kind: 'tiles'; tileUrlTemplate: string; opacity: number } | { kind: 'image'; url: string; coordinates: ImageCoordinates; opacity: number } | { kind: 'none' };

/**
 * D21: a georeferenced layer draws from Core's Web Mercator tiles (`MercatorTileUrl`, a signed `{z}/{x}/{y}` template).
 * Without one (an older server, or a pixel-only layer) an untiled layer falls back to its image over its bounds; a tiled
 * layer draws nothing — its `GetCustomMapTile` pixel pyramid cannot be placed on a map and it has no whole image.
 */
export const resolveCustomMapLayerRendering = (
  layer: Pick<CustomMapLayerResultData, keyof BoundsFields | 'IndoorMapFloorId' | 'IsTiled' | 'HasImage' | 'Opacity' | 'MercatorTileUrl'>,
  apiBaseUrl: string
): CustomMapLayerRendering => {
  const opacity = finite(layer.Opacity) ? Math.min(1, Math.max(0, layer.Opacity)) : 1;
  const mercator = typeof layer.MercatorTileUrl === 'string' ? layer.MercatorTileUrl.trim() : '';
  if (mercator && isSafeMapUrl(mercator) && hasTilePlaceholders(mercator)) {
    return { kind: 'tiles', tileUrlTemplate: mercator, opacity };
  }
  if (layer.IsTiled || !layer.HasImage) return { kind: 'none' };
  const coordinates = boundsToImageCoordinates(layer);
  const url = buildCustomMapLayerImageUrl(apiBaseUrl, layer.IndoorMapFloorId);
  return coordinates && url ? { kind: 'image', url, coordinates, opacity } : { kind: 'none' };
};

/** Zone outlines of an indoor floor as GeoJSON (zones without valid `GeoGeometry` are skipped). */
export const indoorZonesToFeatureCollection = (floor: Pick<IndoorMapFloorResultData, 'Zones'>): GeoJSON.FeatureCollection => {
  const features: GeoJSON.Feature[] = [];
  for (const zone of floor.Zones ?? []) {
    if (!zone.GeoGeometry) continue;
    try {
      const parsed: unknown = JSON.parse(zone.GeoGeometry);
      const geometry = (parsed as { type?: string; geometry?: GeoJSON.Geometry }).type === 'Feature' ? (parsed as GeoJSON.Feature).geometry : (parsed as GeoJSON.Geometry);
      if (!geometry || typeof geometry.type !== 'string') continue;
      features.push({ type: 'Feature', id: zone.IndoorMapZoneId, geometry, properties: { zoneId: zone.IndoorMapZoneId, name: zone.Name, color: zone.Color || '#3b82f6', zoneType: zone.ZoneType } });
    } catch {
      // Malformed zone geometry: skip the zone, keep the floor.
    }
  }
  return { type: 'FeatureCollection', features };
};
