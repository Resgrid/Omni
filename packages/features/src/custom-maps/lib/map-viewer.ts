import { hasGeoBounds, isSafeMapUrl, type PixelRegion } from '@resgrid/maps';
import {
  type CustomMapLayerResultData,
  type CustomMapRegionResultData,
  type CustomMapResultData,
  CustomMapType,
  type IndoorMapFloorResultData,
  type IndoorMapZoneResultData,
  type MapFeatureResultData,
} from '@resgrid/models';

import { customMapsRoutes } from '../routes';

/**
 * How a custom map layer or indoor floor can be shown (MapLibre plan D21):
 * - `geo`: on the department map — the layer's signed Web Mercator tiles, or its image over its geographic bounds;
 * - `pixel`: an image with no geographic bounds, shown in the pixel-space viewer with its regions or zones;
 * - `none`: nothing drawable (a tiled layer from a server without Mercator tiles and no image of its own).
 */
export type ViewMode = 'geo' | 'pixel' | 'none';

const hasMercatorTiles = (layer: Pick<CustomMapLayerResultData, 'MercatorTileUrl'>): boolean => {
  const url = layer.MercatorTileUrl?.trim() ?? '';
  return url !== '' && isSafeMapUrl(url) && url.includes('{z}') && url.includes('{x}') && url.includes('{y}');
};

export const layerViewMode = (layer: CustomMapLayerResultData): ViewMode => {
  if (hasMercatorTiles(layer)) return 'geo';
  if (!layer.HasImage) return 'none';
  return hasGeoBounds(layer) ? 'geo' : 'pixel';
};

export const floorViewMode = (floor: IndoorMapFloorResultData): ViewMode => {
  if (!floor.HasImage) return hasGeoBounds(floor) ? 'geo' : 'none';
  return hasGeoBounds(floor) ? 'geo' : 'pixel';
};

export const sortByOrder = <T extends { FloorOrder: number; Name: string }>(items: readonly T[]): T[] => [...items].sort((a, b) => a.FloorOrder - b.FloorOrder || a.Name.localeCompare(b.Name));

/** Custom maps for the list: everything but indoor maps (they are listed from `GetIndoorMaps`). */
export const listedCustomMaps = (maps: readonly CustomMapResultData[]): CustomMapResultData[] => maps.filter((map) => map.MapType !== CustomMapType.Indoor).sort((a, b) => a.Name.localeCompare(b.Name));

export const CUSTOM_MAP_TYPE_KEYS: Readonly<Record<number, string>> = {
  [CustomMapType.Outdoor]: 'maps.outdoor',
  [CustomMapType.Event]: 'maps.event',
  [CustomMapType.Custom]: 'maps.general',
};

/** Regions or zones in the pixel viewer's shape. */
export const toPixelRegions = (regions: readonly (CustomMapRegionResultData | IndoorMapZoneResultData)[]): PixelRegion[] =>
  regions.map((region) => ({ id: region.IndoorMapZoneId, name: region.Name, color: region.Color, description: region.Description, pixelGeometry: region.PixelGeometry }));

/** The camera bounds of a map with usable bounds, else null (the camera then centres on `CenterLatitude/Longitude`). */
export const mapBounds = (map: { BoundsNELat: number | null; BoundsNELon: number | null; BoundsSWLat: number | null; BoundsSWLon: number | null }): { ne: [number, number]; sw: [number, number] } | null =>
  hasGeoBounds(map) ? { ne: [map.BoundsNELon as number, map.BoundsNELat as number], sw: [map.BoundsSWLon as number, map.BoundsSWLat as number] } : null;

/** A usable centre (not the server's 0,0 "no data"). */
export const usableCenter = (latitude: number | null | undefined, longitude: number | null | undefined): [number, number] | null =>
  typeof latitude === 'number' && typeof longitude === 'number' && Number.isFinite(latitude) && Number.isFinite(longitude) && !(latitude === 0 && longitude === 0) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180
    ? [longitude, latitude]
    : null;

/** Where a search result opens: the indoor map at its floor, or the custom map at its layer, with the feature selected. */
export const searchResultRoute = (item: MapFeatureResultData): string | null => {
  if (!item.MapId) return null;
  return item.FeatureType === 'indoor_zone'
    ? customMapsRoutes.indoor(item.MapId, { floorId: item.FloorOrLayerId || null, featureId: item.Id || null })
    : customMapsRoutes.custom(item.MapId, { layerId: item.FloorOrLayerId || null, featureId: item.Id || null });
};
