/** Mirrors Core `CustomMapResultData` (Mapping/GetCustomMaps, GetCustomMap/{mapId}). Custom maps share the indoor map tables, hence `IndoorMapId`. */
export interface CustomMapResultData {
  IndoorMapId: string;
  Name: string;
  Description: string | null;
  /** CustomMapType. */
  MapType: number;
  CenterLatitude: number;
  CenterLongitude: number;
  BoundsNELat: number;
  BoundsNELon: number;
  BoundsSWLat: number;
  BoundsSWLon: number;
  BoundsGeoJson: string | null;
  DefaultFloorId: string | null;
}

/** Mirrors Core `CustomMapLayerResultData` (Mapping/GetCustomMapLayer/{layerId}). */
export interface CustomMapLayerResultData {
  IndoorMapFloorId: string;
  IndoorMapId: string;
  Name: string;
  FloorOrder: number;
  LayerType: number;
  HasImage: boolean;
  IsTiled: boolean;
  TileMinZoom: number | null;
  TileMaxZoom: number | null;
  BoundsNELat: number | null;
  BoundsNELon: number | null;
  BoundsSWLat: number | null;
  BoundsSWLon: number | null;
  Opacity: number;
  /**
   * Signed Web Mercator tile template (`{z}/{x}/{y}`) for georeferenced layers (MapLibre plan §6.7); null for pixel-only
   * layers. Absent on older servers, whose `GetCustomMapTile` tiles are a pixel pyramid that cannot be placed on a map.
   */
  MercatorTileUrl?: string | null;
  Regions: CustomMapRegionResultData[];
}

/** Mirrors Core `CustomMapRegionResultData`. */
export interface CustomMapRegionResultData {
  IndoorMapZoneId: string;
  IndoorMapFloorId: string;
  Name: string;
  Description: string | null;
  ZoneType: number;
  PixelGeometry: string | null;
  GeoGeometry: string | null;
  CenterPixelX: number;
  CenterPixelY: number;
  CenterLatitude: number;
  CenterLongitude: number;
  Color: string | null;
  Metadata: string | null;
  IsSearchable: boolean;
  IsDispatchable: boolean;
}

export enum CustomMapType {
  Outdoor = 0,
  Event = 1,
  General = 2,
}
