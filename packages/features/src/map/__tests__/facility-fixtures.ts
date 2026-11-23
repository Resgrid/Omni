import type { CustomMapLayerResultData, CustomMapResultData, GetCustomMapResultData, GetIndoorMapResultData, IndoorMapFloorResultData, IndoorMapResultData, IndoorMapZoneResultData } from '@resgrid/models';

/**
 * A facility map set like the Mesa Flats demo campus: a site emergency plan (a custom map with a base layer and an
 * evacuation layer, regions on the base) and Building A (an indoor map with two floors, rooms on the ground floor).
 */

const BOUNDS = { BoundsNELat: 35.01, BoundsNELon: -106.49, BoundsSWLat: 35.0, BoundsSWLon: -106.5 };

const zone = (IndoorMapZoneId: string, IndoorMapFloorId: string, Name: string, CenterLatitude: number, CenterLongitude: number): IndoorMapZoneResultData => ({
  IndoorMapZoneId,
  IndoorMapFloorId,
  Name,
  Description: null,
  ZoneType: 0,
  PixelGeometry: null,
  GeoGeometry: null,
  CenterPixelX: 0,
  CenterPixelY: 0,
  CenterLatitude,
  CenterLongitude,
  Color: '#22c55e',
  Metadata: null,
  IsSearchable: true,
});

const layer = (IndoorMapFloorId: string, Name: string, FloorOrder: number, Regions: CustomMapLayerResultData['Regions'] = []): CustomMapLayerResultData => ({
  IndoorMapFloorId,
  IndoorMapId: 'site',
  Name,
  FloorOrder,
  LayerType: 0,
  HasImage: true,
  IsTiled: false,
  TileMinZoom: null,
  TileMaxZoom: null,
  ...BOUNDS,
  Opacity: 0.8,
  MercatorTileUrl: null,
  Regions,
});

const floor = (IndoorMapFloorId: string, Name: string, FloorOrder: number, Zones: IndoorMapZoneResultData[] = []): IndoorMapFloorResultData => ({
  IndoorMapFloorId,
  IndoorMapId: 'bldg-a',
  Name,
  FloorOrder,
  HasImage: true,
  ...BOUNDS,
  Opacity: 1,
  Zones,
});

export const TANK_YARD = { ...zone('yard', 'site-base', 'Tank yard', 35.004, -106.496), IsDispatchable: true };
export const CONTROL_ROOM = zone('control', 'floor-1', 'Control room', 35.006, -106.494);

export const SITE_PLAN: CustomMapResultData = {
  IndoorMapId: 'site',
  Name: 'Site emergency plan',
  Description: null,
  MapType: 1,
  CenterLatitude: 35.005,
  CenterLongitude: -106.495,
  ...BOUNDS,
  BoundsGeoJson: null,
  DefaultFloorId: null,
};

export const SITE_PLAN_DETAIL: GetCustomMapResultData = { Map: SITE_PLAN, Layers: [layer('site-evac', 'Evacuation routes', 2), layer('site-base', 'Site plan', 1, [TANK_YARD])] };

export const BUILDING_A: IndoorMapResultData = { IndoorMapId: 'bldg-a', Name: 'Building A', Description: null, CenterLatitude: 35.006, CenterLongitude: -106.494, ...BOUNDS, DefaultFloorId: 'floor-1' };

export const GROUND_FLOOR = floor('floor-1', 'Ground floor', 1, [CONTROL_ROOM]);
export const UPPER_FLOOR = floor('floor-2', 'Upper floor', 2);

/** The map's floor list carries no zones; the floor's own read does. */
export const BUILDING_A_DETAIL: GetIndoorMapResultData = { Map: BUILDING_A, Floors: [{ ...GROUND_FLOOR, Zones: [] }, UPPER_FLOOR] };

/** The custom maps store as a device that has read both maps (lists, details and the ground floor). */
export const facilityMapsState = () => ({
  customMaps: [SITE_PLAN],
  indoorMaps: [BUILDING_A],
  customMapById: { site: SITE_PLAN_DETAIL },
  indoorMapById: { 'bldg-a': BUILDING_A_DETAIL },
  floorById: { 'floor-1': GROUND_FLOOR },
  customMapLayerById: {},
});
