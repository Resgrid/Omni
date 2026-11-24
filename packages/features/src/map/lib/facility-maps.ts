import { CUSTOM_MAP_TYPE_KEYS, floorViewMode, layerViewMode, listedCustomMaps, listedIndoorMaps, mapBounds, sortByOrder, usableCenter } from '@resgrid/features/custom-maps/lib/map-viewer';
import { hasGeoBounds } from '@resgrid/maps';
import type {
  CustomMapLayerResultData,
  CustomMapRegionResultData,
  CustomMapResultData,
  GetCustomMapResultData,
  GetIndoorMapResultData,
  IndoorMapFloorResultData,
  IndoorMapResultData,
  IndoorMapZoneResultData,
} from '@resgrid/models';
import { z } from 'zod';

/**
 * The department's facility maps — its custom maps (outdoor, event and general site plans, drawn from their signed
 * Mercator tiles or their image over its bounds, with regions) and its indoor maps (building floor plans, one floor at a
 * time, with zones) — as every map surface shows them: the Map screen, the Dispatch console, the IC maps, the BigBoard
 * map widget and the call location picker. Pixel-only layers and floors (no geographic bounds, MapLibre plan D21) cannot
 * sit on a geographic map and are left to the custom maps browser.
 */

export type FacilityMapKind = 'custom' | 'indoor';

/** A custom map and an indoor map can share an id (one table in Core), so a map is known by its kind and id. */
export interface FacilityMapRef {
  kind: FacilityMapKind;
  mapId: string;
}

/** `custom:<id>` / `indoor:<id>`. */
export const facilityMapKey = (kind: FacilityMapKind, mapId: string): string => `${kind}:${mapId}`;

export const parseFacilityMapKey = (key: string): FacilityMapRef | null => {
  const separator = key.indexOf(':');
  const kind = key.slice(0, separator);
  const mapId = key.slice(separator + 1).trim();

  if (separator <= 0 || !mapId || (kind !== 'custom' && kind !== 'indoor')) return null;

  return { kind, mapId };
};

/** Map bounds as the camera takes them (`[lon, lat]` corners). */
export interface FacilityBounds {
  ne: [number, number];
  sw: [number, number];
}

/** A facility map in a list (the Layers sheet, the location picker, the BigBoard widget settings). */
export interface FacilityMapListing extends FacilityMapRef {
  key: string;
  name: string;
  /** Translation key of its kind (`maps.indoor`, `maps.outdoor`, `maps.event`, `maps.general`), or null. */
  typeKey: string | null;
  /** Its bounds when usable (the camera frames it before its layers are read). */
  bounds: FacilityBounds | null;
}

/** Custom maps first (indoor ones are listed from `GetIndoorMaps`, as in the browser), then indoor maps, each by name. */
export function facilityMapListings(customMaps: readonly CustomMapResultData[], indoorMaps: readonly IndoorMapResultData[]): FacilityMapListing[] {
  const custom = listedCustomMaps(customMaps).map<FacilityMapListing>((map) => ({
    key: facilityMapKey('custom', map.IndoorMapId),
    kind: 'custom',
    mapId: map.IndoorMapId,
    name: map.Name,
    typeKey: CUSTOM_MAP_TYPE_KEYS[map.MapType] ?? null,
    bounds: mapBounds(map),
  }));

  const indoor = listedIndoorMaps(indoorMaps, customMaps).map<FacilityMapListing>((map) => ({
    key: facilityMapKey('indoor', map.IndoorMapId),
    kind: 'indoor',
    mapId: map.IndoorMapId,
    name: map.Name,
    typeKey: 'maps.indoor',
    bounds: mapBounds(map),
  }));

  return [...custom, ...indoor].filter((listing) => !!listing.mapId);
}

/** A map as read (`GetCustomMap/{id}` with its layers, `GetIndoorMap/{id}` with its floors). */
export type FacilityMapDetail = { kind: 'custom'; data: GetCustomMapResultData } | { kind: 'indoor'; data: GetIndoorMapResultData };

/** A floor of an indoor map or a layer of a custom map. */
export interface FacilityLevel {
  id: string;
  name: string;
}

type BoundsFields = Pick<IndoorMapFloorResultData, 'BoundsNELat' | 'BoundsNELon' | 'BoundsSWLat' | 'BoundsSWLon'>;

/**
 * A layer or floor with no bounds of its own spans its map's bounds — where Core's Mercator tile renderer places it, and
 * how maps made on the web are usually saved (bounds on the map, none on its layers).
 */
export const placedOnMap = <T extends BoundsFields>(level: T, map: BoundsFields | null | undefined): T =>
  hasGeoBounds(level) || !map || !hasGeoBounds(map) ? level : { ...level, BoundsNELat: map.BoundsNELat, BoundsNELon: map.BoundsNELon, BoundsSWLat: map.BoundsSWLat, BoundsSWLon: map.BoundsSWLon };

const geoLayers = (data: GetCustomMapResultData): CustomMapLayerResultData[] =>
  sortByOrder(data.Layers ?? [])
    .map((layer) => placedOnMap(layer, data.Map))
    .filter((layer) => layerViewMode(layer) === 'geo');

const geoFloors = (data: GetIndoorMapResultData): IndoorMapFloorResultData[] =>
  sortByOrder(data.Floors ?? [])
    .map((floor) => placedOnMap(floor, data.Map))
    .filter((floor) => floorViewMode(floor) === 'geo');

/** The floors or layers a geographic map can draw, in their order. */
export const facilityLevels = (detail: FacilityMapDetail): FacilityLevel[] =>
  (detail.kind === 'custom' ? geoLayers(detail.data) : geoFloors(detail.data)).map((level) => ({ id: level.IndoorMapFloorId, name: level.Name }));

/**
 * The level a map shows for a choice: a custom map shows the chosen layer, or every layer with none chosen (null); an indoor
 * map one floor, the chosen one, else its default floor, else its first. A choice the map no longer has falls back.
 */
export function resolvedLevelId(detail: FacilityMapDetail, levelId: string | null): string | null {
  const levels = facilityLevels(detail);
  const chosen = levelId && levels.some((level) => level.id === levelId) ? levelId : null;

  if (detail.kind === 'custom') return chosen;
  const defaultFloorId = detail.data.Map?.DefaultFloorId ?? null;

  return chosen ?? (defaultFloorId && levels.some((level) => level.id === defaultFloorId) ? defaultFloorId : (levels[0]?.id ?? null));
}

/** What a facility map draws on a geographic map: a custom map layer (with its regions) or an indoor floor (with its zones). */
export type FacilityOverlayLayer =
  { kind: 'custom'; key: string; mapId: string; mapName: string; layer: CustomMapLayerResultData } | { kind: 'indoor'; key: string; mapId: string; mapName: string; floor: IndoorMapFloorResultData };

/**
 * The layers to draw for a map and a level choice. An indoor floor comes from its own read when there is one (it carries
 * the zones; the map's floor list does not), and a custom map layer takes its regions from its own read
 * (`GetCustomMapLayer/{id}`; `GetCustomMap/{id}` lists the layers without them).
 */
export function resolveFacilityLayers(
  key: string,
  detail: FacilityMapDetail,
  levelId: string | null,
  floorById: Readonly<Record<string, IndoorMapFloorResultData>> = {},
  layerById: Readonly<Record<string, CustomMapLayerResultData>> = {}
): FacilityOverlayLayer[] {
  const level = resolvedLevelId(detail, levelId);
  const mapName = detail.data.Map?.Name ?? '';
  const mapId = detail.data.Map?.IndoorMapId ?? '';

  if (detail.kind === 'custom') {
    return geoLayers(detail.data)
      .filter((layer) => level === null || layer.IndoorMapFloorId === level)
      .map((layer) => {
        const regions = layerById[layer.IndoorMapFloorId]?.Regions;

        return { kind: 'custom', key, mapId, mapName, layer: regions && !layer.Regions?.length ? { ...layer, Regions: regions } : layer };
      });
  }

  const listed = geoFloors(detail.data).find((floor) => floor.IndoorMapFloorId === level);

  if (!listed) return [];
  const read = floorById[listed.IndoorMapFloorId] ? placedOnMap(floorById[listed.IndoorMapFloorId], detail.data.Map) : null;

  return [{ kind: 'indoor', key, mapId, mapName, floor: read && floorViewMode(read) === 'geo' ? read : listed }];
}

/** The bounds around every layer drawn (each layer's own, else the map's), or null when none are usable. */
export function facilityBounds(layers: readonly FacilityOverlayLayer[], mapFallback: FacilityBounds | null = null): FacilityBounds | null {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;

  for (const entry of layers) {
    const bounds = mapBounds(entry.kind === 'custom' ? entry.layer : entry.floor);

    if (!bounds) continue;
    west = Math.min(west, bounds.sw[0]);
    south = Math.min(south, bounds.sw[1]);
    east = Math.max(east, bounds.ne[0]);
    north = Math.max(north, bounds.ne[1]);
  }

  return [west, south, east, north].every(Number.isFinite) ? { ne: [east, north], sw: [west, south] } : mapFallback;
}

/** A tapped (or searched) room or region: which map, floor or layer it is on, its name and its centre. */
export interface FacilityFeature extends FacilityMapRef {
  mapName: string;
  /** The floor or layer id (Core `IndoorMapFloorId`: a call's indoor location sends it with the zone). */
  levelId: string;
  levelName: string;
  /** The zone or region id (Core `IndoorMapZoneId`). */
  featureId: string;
  name: string;
  description: string;
  /** Its centre, `[lon, lat]`; null when neither the saved centre nor its outline give one. */
  center: [number, number] | null;
}

/** GeoJSON coordinates: a position (numbers) or nested lists of them (lines, rings, polygons). */
type Coordinates = number | Coordinates[];

const coordinatesSchema: z.ZodType<Coordinates> = z.lazy(() => z.union([z.number(), z.array(coordinatesSchema)]));

/** A saved outline: a GeoJSON geometry, or a feature wrapping one. */
const outlineSchema = z.union([z.object({ type: z.literal('Feature'), geometry: z.object({ coordinates: coordinatesSchema }) }), z.object({ type: z.string(), coordinates: coordinatesSchema })]);

/** Every position of a geometry's coordinates (a point, a line, a polygon's rings, a multi-polygon), longitude first. */
const collectPositions = (coordinates: Coordinates, into: [number, number][]): void => {
  if (!Array.isArray(coordinates)) return;
  const [longitude, latitude] = coordinates;

  if (longitude !== undefined && latitude !== undefined && !Array.isArray(longitude) && !Array.isArray(latitude)) {
    into.push([longitude, latitude]);

    return;
  }

  for (const item of coordinates) collectPositions(item, into);
};

/** The middle of an outline's bounding box (a saved GeoJSON geometry or feature), or null. */
export function geometryCenter(geoGeometry: string | null | undefined): [number, number] | null {
  if (!geoGeometry) return null;
  let outline: ReturnType<typeof outlineSchema.safeParse>;

  try {
    outline = outlineSchema.safeParse(JSON.parse(geoGeometry));
  } catch {
    return null;
  }

  if (!outline.success) return null;
  const positions: [number, number][] = [];

  collectPositions('geometry' in outline.data ? outline.data.geometry.coordinates : outline.data.coordinates, positions);

  if (positions.length === 0) return null;
  const lons = positions.map(([longitude]) => longitude);
  const lats = positions.map(([, latitude]) => latitude);

  return usableCenter((Math.min(...lats) + Math.max(...lats)) / 2, (Math.min(...lons) + Math.max(...lons)) / 2);
}

const featureCenter = (zone: Pick<IndoorMapZoneResultData, 'CenterLatitude' | 'CenterLongitude' | 'GeoGeometry'>): [number, number] | null =>
  usableCenter(zone.CenterLatitude, zone.CenterLongitude) ?? geometryCenter(zone.GeoGeometry);

const toFeature = (entry: FacilityOverlayLayer, zone: CustomMapRegionResultData | IndoorMapZoneResultData): FacilityFeature => {
  const level = entry.kind === 'custom' ? entry.layer : entry.floor;

  return {
    kind: entry.kind,
    mapId: entry.mapId,
    mapName: entry.mapName,
    levelId: level.IndoorMapFloorId,
    levelName: level.Name,
    featureId: zone.IndoorMapZoneId,
    name: zone.Name?.trim() ?? '',
    description: zone.Description?.trim() ?? '',
    center: featureCenter(zone),
  };
};

/** The room or region with this id among the layers drawn, or null. */
export function facilityFeatureOf(layers: readonly FacilityOverlayLayer[], featureId: string): FacilityFeature | null {
  for (const entry of layers) {
    const zones: readonly (CustomMapRegionResultData | IndoorMapZoneResultData)[] = entry.kind === 'custom' ? (entry.layer.Regions ?? []) : (entry.floor.Zones ?? []);
    const zone = zones.find((candidate) => candidate.IndoorMapZoneId === featureId);

    if (zone) return toFeature(entry, zone);
  }

  return null;
}

/** About how many degrees of longitude a 1024-pixel-wide view spans at this zoom. */
const viewSpanDegrees = (zoom: number): number => (360 / 2 ** Math.max(0, Math.min(22, zoom))) * 4;

/**
 * Bounds a locked view keeps the camera in: the framed bounds with a margin of half their size, or — for a fixed centre —
 * about two screens around it at its zoom.
 */
export function lockedViewBounds(view: { bounds: FacilityBounds } | { center: [number, number]; zoom: number }): FacilityBounds {
  if ('bounds' in view) {
    const { ne, sw } = view.bounds;
    const lonMargin = Math.max((ne[0] - sw[0]) / 2, 0.0005);
    const latMargin = Math.max((ne[1] - sw[1]) / 2, 0.0005);

    return { ne: [Math.min(180, ne[0] + lonMargin), Math.min(85, ne[1] + latMargin)], sw: [Math.max(-180, sw[0] - lonMargin), Math.max(-85, sw[1] - latMargin)] };
  }

  const [longitude, latitude] = view.center;
  const lonSpan = viewSpanDegrees(view.zoom);
  const latSpan = lonSpan * Math.max(0.1, Math.cos((latitude * Math.PI) / 180));

  return {
    ne: [Math.min(180, longitude + lonSpan), Math.min(85, latitude + latSpan)],
    sw: [Math.max(-180, longitude - lonSpan), Math.max(-85, latitude - latSpan)],
  };
}
