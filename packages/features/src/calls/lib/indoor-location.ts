import type { CustomMapLayerResultData, CustomMapResultData, GetCustomMapResultData, GetIndoorMapResultData, IndoorMapFloorResultData, IndoorMapResultData, MapFeatureResultData } from '@resgrid/models';

import type { PickedIndoorLocation } from './call-form';
import { isUsablePoint } from './call-location';

/** What the device has read of the department's facility maps (`useCustomMapsStore`). */
export interface IndoorMapsSnapshot {
  floorById: Readonly<Record<string, IndoorMapFloorResultData>>;
  indoorMapById: Readonly<Record<string, GetIndoorMapResultData>>;
  customMapById: Readonly<Record<string, GetCustomMapResultData>>;
  customMapLayerById: Readonly<Record<string, CustomMapLayerResultData>>;
  indoorMaps: readonly IndoorMapResultData[];
  customMaps: readonly CustomMapResultData[];
}

/** A stored indoor location's room and map names, when the device knows them. */
export interface IndoorLocationNames {
  zone: string;
  map: string;
}

const mapName = (snapshot: IndoorMapsSnapshot, mapId: string | null | undefined): string => {
  if (!mapId) return '';

  return (
    snapshot.indoorMapById[mapId]?.Map?.Name ??
    snapshot.customMapById[mapId]?.Map?.Name ??
    snapshot.indoorMaps.find((map) => map.IndoorMapId === mapId)?.Name ??
    snapshot.customMaps.find((map) => map.IndoorMapId === mapId)?.Name ??
    ''
  );
};

/** The floors and layers the device has read, with the map each is on (a floor's own read first: it carries the zones). */
function* knownLevels(snapshot: IndoorMapsSnapshot): Generator<{ levelId: string; mapId: string; zones: readonly { IndoorMapZoneId: string; Name: string }[] }> {
  for (const floor of Object.values(snapshot.floorById)) yield { levelId: floor.IndoorMapFloorId, mapId: floor.IndoorMapId, zones: floor.Zones ?? [] };

  for (const layer of Object.values(snapshot.customMapLayerById)) yield { levelId: layer.IndoorMapFloorId, mapId: layer.IndoorMapId, zones: layer.Regions ?? [] };

  for (const [mapId, map] of Object.entries(snapshot.indoorMapById)) for (const floor of map.Floors ?? []) yield { levelId: floor.IndoorMapFloorId, mapId, zones: floor.Zones ?? [] };

  for (const [mapId, map] of Object.entries(snapshot.customMapById)) for (const layer of map.Layers ?? []) yield { levelId: layer.IndoorMapFloorId, mapId, zones: layer.Regions ?? [] };
}

/** The room and map names of a stored indoor location (its floor's zones when the floor is known, else any read level's). */
export function indoorLocationNames(snapshot: IndoorMapsSnapshot, zoneId: string, floorId: string | null): IndoorLocationNames | null {
  for (const level of knownLevels(snapshot)) {
    if (floorId && level.levelId !== floorId) continue;
    const zone = level.zones.find((candidate) => candidate.IndoorMapZoneId === zoneId);

    if (zone) return { zone: zone.Name?.trim() ?? '', map: mapName(snapshot, level.mapId) };
  }

  return null;
}

/** A search result as the form's indoor location ("Room, Map" from `format`), going to the room's centre when known. */
export const searchResultToIndoorLocation = (item: MapFeatureResultData, format: (names: IndoorLocationNames) => string): PickedIndoorLocation => ({
  zoneId: item.Id,
  floorId: item.FloorOrLayerId,
  name: format({ zone: item.Name?.trim() ?? '', map: item.MapName?.trim() ?? '' }),
  point: isUsablePoint(item.CenterLatitude, item.CenterLongitude) ? { latitude: item.CenterLatitude, longitude: item.CenterLongitude } : null,
});
