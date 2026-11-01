import type { CustomMapLayerResultData, IndoorMapFloorResultData } from '@resgrid/models';

import type { ImageCoordinates } from '../rg/types';

/**
 * URL builders for department map data served by Core: custom map raster tiles, untiled custom map layer images and
 * indoor floor images. Native sources cannot send auth headers, so every URL passes through `signUrl` (D12 signed
 * URLs) before a source gets it. Ids go in the path (Mapping v4 routes take `/{id}`).
 */

const joinUrl = (base: string, path: string): string => `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;

export type SignUrl = (url: string) => string;

const identity: SignUrl = (url) => url;

/**
 * `{base}/Mapping/GetCustomMapTile/{layerId}/{z}/{x}/{y}` with the `{z}/{x}/{y}` placeholders left for MapLibre.
 * Signing runs on the template; a signer must keep the placeholders intact (query-string signatures do).
 */
export const buildCustomMapTileUrlTemplate = (apiBaseUrl: string, layerId: string, signUrl: SignUrl = identity): string | null => {
  const base = apiBaseUrl.trim();
  const id = layerId.trim();
  if (!base || !id) return null;
  return signUrl(joinUrl(base, `/Mapping/GetCustomMapTile/${encodeURIComponent(id)}/{z}/{x}/{y}`));
};

/** Image of an untiled custom map layer. */
export const buildCustomMapLayerImageUrl = (apiBaseUrl: string, layerId: string, signUrl: SignUrl = identity): string | null => {
  const base = apiBaseUrl.trim();
  const id = layerId.trim();
  if (!base || !id) return null;
  return signUrl(joinUrl(base, `/Mapping/GetCustomMapLayerImage/${encodeURIComponent(id)}`));
};

/** Indoor floor image. */
export const buildIndoorFloorImageUrl = (apiBaseUrl: string, floorId: string, signUrl: SignUrl = identity): string | null => {
  const base = apiBaseUrl.trim();
  const id = floorId.trim();
  if (!base || !id) return null;
  return signUrl(joinUrl(base, `/Mapping/GetIndoorMapFloorImage/${encodeURIComponent(id)}`));
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

export type CustomMapLayerRendering =
  | { kind: 'tiles'; tileUrlTemplate: string; minZoom?: number; maxZoom?: number; opacity: number }
  | { kind: 'image'; url: string; coordinates: ImageCoordinates; opacity: number }
  | { kind: 'none' };

/** How a custom map layer draws: raster tiles when tiled, else its image over its bounds. */
export const resolveCustomMapLayerRendering = (
  layer: Pick<CustomMapLayerResultData, keyof BoundsFields | 'IndoorMapFloorId' | 'IsTiled' | 'HasImage' | 'TileMinZoom' | 'TileMaxZoom' | 'Opacity'>,
  apiBaseUrl: string,
  signUrl: SignUrl = identity
): CustomMapLayerRendering => {
  const opacity = finite(layer.Opacity) ? Math.min(1, Math.max(0, layer.Opacity)) : 1;
  if (layer.IsTiled) {
    const tileUrlTemplate = buildCustomMapTileUrlTemplate(apiBaseUrl, layer.IndoorMapFloorId, signUrl);
    return tileUrlTemplate ? { kind: 'tiles', tileUrlTemplate, minZoom: layer.TileMinZoom ?? undefined, maxZoom: layer.TileMaxZoom ?? undefined, opacity } : { kind: 'none' };
  }
  const coordinates = boundsToImageCoordinates(layer);
  const url = layer.HasImage ? buildCustomMapLayerImageUrl(apiBaseUrl, layer.IndoorMapFloorId, signUrl) : null;
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
