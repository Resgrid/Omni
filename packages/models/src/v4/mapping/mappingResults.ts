import { type FeatureCollection } from 'geojson';

import { BaseV4Request } from '../baseV4Request';
import { type CustomMapLayerResultData, type CustomMapRegionResultData, type CustomMapResultData } from './customMapResultData';
import { type IndoorMapFloorResultData, type IndoorMapResultData, type IndoorMapZoneResultData } from './indoorMapResultData';

export class GetIndoorMapsResult extends BaseV4Request {
  public Data: IndoorMapResultData[] = [];
}

/** Mirrors Core `GetIndoorMapResultData`: the map plus its floors. */
export interface GetIndoorMapResultData {
  Map: IndoorMapResultData;
  Floors: IndoorMapFloorResultData[];
}

export class GetIndoorMapResult extends BaseV4Request {
  public Data: GetIndoorMapResultData | null = null;
}

export class GetIndoorMapFloorResult extends BaseV4Request {
  public Data: IndoorMapFloorResultData | null = null;
}

export class GetCustomMapsResult extends BaseV4Request {
  public Data: CustomMapResultData[] = [];
}

/** Mirrors Core `GetCustomMapResultData`: the map plus its layers. */
export interface GetCustomMapResultData {
  Map: CustomMapResultData;
  Layers: CustomMapLayerResultData[];
}

export class GetCustomMapResult extends BaseV4Request {
  public Data: GetCustomMapResultData | null = null;
}

export class GetCustomMapLayerResult extends BaseV4Request {
  public Data: CustomMapLayerResultData | null = null;
}

/** GeoJSON endpoints (GetMapLayerGeoJSON/{layerId}, GetIndoorMapZonesGeoJSON/{floorId}, GetCustomMapRegionsGeoJSON/{layerId}). */
export class GetGeoJSONResult extends BaseV4Request {
  public Data: FeatureCollection = { type: 'FeatureCollection', features: [] };
}

/** Mirrors Core `MapFeatureResultData` (Mapping/SearchAllMapFeatures). */
export interface MapFeatureResultData {
  /** "indoor_zone" or "custom_region". */
  FeatureType: 'indoor_zone' | 'custom_region' | string;
  Id: string;
  Name: string;
  Description: string | null;
  MapId: string;
  MapName: string | null;
  FloorOrLayerId: string;
  FloorOrLayerName: string | null;
  CenterLatitude: number;
  CenterLongitude: number;
  IsDispatchable: boolean;
}

export class SearchAllMapFeaturesResult extends BaseV4Request {
  public Data: MapFeatureResultData[] = [];
}

export class SearchIndoorLocationsResult extends BaseV4Request {
  public Data: IndoorMapZoneResultData[] = [];
}

export class SearchCustomMapRegionsResult extends BaseV4Request {
  public Data: CustomMapRegionResultData[] = [];
}
