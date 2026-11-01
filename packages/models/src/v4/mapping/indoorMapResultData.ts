/** Mirrors Core `IndoorMapResultData` (Mapping/GetIndoorMaps, GetIndoorMap/{mapId}). */
export interface IndoorMapResultData {
  IndoorMapId: string;
  Name: string;
  Description: string | null;
  CenterLatitude: number;
  CenterLongitude: number;
  BoundsNELat: number;
  BoundsNELon: number;
  BoundsSWLat: number;
  BoundsSWLon: number;
  DefaultFloorId: string | null;
}

/** Mirrors Core `IndoorMapFloorResultData` (Mapping/GetIndoorMapFloor/{floorId}). */
export interface IndoorMapFloorResultData {
  IndoorMapFloorId: string;
  IndoorMapId: string;
  Name: string;
  FloorOrder: number;
  HasImage: boolean;
  BoundsNELat: number | null;
  BoundsNELon: number | null;
  BoundsSWLat: number | null;
  BoundsSWLon: number | null;
  Opacity: number;
  Zones: IndoorMapZoneResultData[];
}

/** Mirrors Core `IndoorMapZoneResultData`. */
export interface IndoorMapZoneResultData {
  IndoorMapZoneId: string;
  IndoorMapFloorId: string;
  Name: string;
  Description: string | null;
  ZoneType: number;
  /** Zone outline in floor-image pixel space (JSON). */
  PixelGeometry: string | null;
  /** Zone outline as GeoJSON in WGS84. */
  GeoGeometry: string | null;
  CenterPixelX: number;
  CenterPixelY: number;
  CenterLatitude: number;
  CenterLongitude: number;
  Color: string | null;
  Metadata: string | null;
  IsSearchable: boolean;
}
