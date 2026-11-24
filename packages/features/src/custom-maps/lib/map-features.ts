import { type CustomMapResultData, CustomMapType, type MapFeatureResultData } from '@resgrid/models';

// Kept apart from map-viewer (which reaches the maps package and its native modules) so the call form can use it.

/**
 * Search results with each room or region once. Core keeps indoor zones and custom map regions in one table, so
 * `SearchAllMapFeatures` returns a room twice (as an indoor zone and as a region). The copy kept is the one its map is
 * listed as: a region on an outdoor, event or general map; a zone on an indoor map or a map the device does not know.
 */
export const uniqueMapFeatures = (results: readonly MapFeatureResultData[], customMaps: readonly CustomMapResultData[]): MapFeatureResultData[] => {
  const listedAsCustom = new Set(customMaps.flatMap((map) => (map.MapType === CustomMapType.Indoor ? [] : [map.IndoorMapId])));
  const isListedKind = (item: MapFeatureResultData): boolean => (item.FeatureType === 'custom_region') === listedAsCustom.has(item.MapId);
  const byId = new Map<string, MapFeatureResultData>();

  for (const item of results) {
    const kept = byId.get(item.Id);

    if (!kept || (!isListedKind(kept) && isListedKind(item))) byId.set(item.Id, item);
  }

  return [...byId.values()];
};
