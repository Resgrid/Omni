import type { CustomMapLayerResultData, IndoorMapFloorResultData, IndoorMapZoneResultData } from '@resgrid/models';
import { z } from 'zod';

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

const legacyRingSchema = z.array(z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)])).min(3);

function legacyGeographicOutline(zone: IndoorMapZoneResultData): GeoJSON.Polygon | null {
  const { CenterLatitude: latitude, CenterLongitude: longitude, PixelGeometry: outline } = zone;

  if (!outline || !Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180 || (latitude === 0 && longitude === 0)) {
    return null;
  }

  const parsed: unknown = JSON.parse(outline);
  const ring = legacyRingSchema.safeParse(parsed);

  // Older imports put geographic rings in the pixel field. Require every vertex to be near the saved geographic center.
  if (!ring.success || ring.data.some(([x, y]) => Math.abs(x - longitude) > 0.02 || Math.abs(y - latitude) > 0.02)) return null;

  const coordinates = ring.data;
  const first = coordinates[0];
  const second = coordinates.find(([x, y]) => x !== first[0] || y !== first[1]);

  if (!second) return null;
  const hasArea = coordinates.some(([x, y]) => Math.abs((second[0] - first[0]) * (y - first[1]) - (second[1] - first[1]) * (x - first[0])) > 1e-14);

  if (!hasArea) return null;

  const last = coordinates[coordinates.length - 1];

  return { type: 'Polygon', coordinates: [first[0] === last[0] && first[1] === last[1] ? coordinates : [...coordinates, first]] };
}

/** Zone outlines on a geographic map, including older imports whose saved geographic rings predate GeoGeometry. */
export const indoorZonesToFeatureCollection = (floor: Pick<IndoorMapFloorResultData, 'Zones'>): GeoJSON.FeatureCollection => {
  const features: GeoJSON.Feature[] = [];

  for (const zone of floor.Zones ?? []) {
    try {
      if (!zone.GeoGeometry) {
        const geometry = legacyGeographicOutline(zone);

        if (geometry) features.push(indoorZoneFeature(zone, geometry));
        continue;
      }

      const parsed: unknown = JSON.parse(zone.GeoGeometry);
      const geometry = (parsed as { type?: string; geometry?: GeoJSON.Geometry }).type === 'Feature' ? (parsed as GeoJSON.Feature).geometry : (parsed as GeoJSON.Geometry);

      if (!geometry || typeof geometry.type !== 'string') continue;
      features.push(indoorZoneFeature(zone, geometry));
    } catch {
      // Malformed zone geometry: skip the zone, keep the floor.
    }
  }

  return { type: 'FeatureCollection', features };
};

const indoorZoneFeature = (zone: IndoorMapZoneResultData, geometry: GeoJSON.Geometry): GeoJSON.Feature => ({
  type: 'Feature',
  id: zone.IndoorMapZoneId,
  geometry,
  properties: { zoneId: zone.IndoorMapZoneId, name: zone.Name, color: zone.Color || '#3b82f6', zoneType: zone.ZoneType },
});
