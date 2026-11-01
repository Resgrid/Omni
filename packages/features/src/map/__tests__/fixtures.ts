// Map test fixtures (not a test file).
import type { MapMakerInfoData } from '@resgrid/models';

/** A department map pin (`Mapping/GetMapDataAndMarkers`); `Type` 0 call, 1 unit, 2 station, 3 member, 4 POI, 5 hydrant. */
export const pin = (Id: string, Type: number, overrides: Partial<MapMakerInfoData> = {}): MapMakerInfoData =>
  ({ Id, Type, Title: `Pin ${Id}`, Latitude: 39.5, Longitude: -119.8, ImagePath: '', PoiImage: '', Color: '', InfoWindowContent: '', zIndex: 0, ...overrides }) as MapMakerInfoData;
