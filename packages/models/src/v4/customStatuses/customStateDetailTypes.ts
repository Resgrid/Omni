/** Core `CustomStateDetailTypes`: which destination kinds a custom status offers. */
export enum CustomStateDetailTypes {
  None = 0,
  Stations = 1,
  Calls = 2,
  CallsAndStations = 3,
  Pois = 4,
  CallsAndPois = 5,
  StationsAndPois = 6,
  CallsStationsAndPois = 7,
}

export interface StatusDetailOptions {
  /**
   * Treat older call-only / call-and-station Detail values as also allowing stations and POIs (Unit's behaviour).
   * Core's SaveUnitStatus validates the destination entity, never the status Detail flag, and GetSetUnitStatusData
   * serves stations/POIs as the department's destination universe regardless of Detail. Default: strict (IC/Responder).
   */
  lenient?: boolean;
}

export const statusDetailAllowsCalls = (detail: number): boolean => {
  return detail === CustomStateDetailTypes.Calls || detail === CustomStateDetailTypes.CallsAndStations || detail === CustomStateDetailTypes.CallsAndPois || detail === CustomStateDetailTypes.CallsStationsAndPois;
};

export const statusDetailAllowsStations = (detail: number, options?: StatusDetailOptions): boolean => {
  if (detail === CustomStateDetailTypes.Stations || detail === CustomStateDetailTypes.CallsAndStations || detail === CustomStateDetailTypes.StationsAndPois || detail === CustomStateDetailTypes.CallsStationsAndPois) {
    return true;
  }
  return options?.lenient ? statusDetailAllowsCalls(detail) : false;
};

export const statusDetailAllowsPois = (detail: number, options?: StatusDetailOptions): boolean => {
  if (detail === CustomStateDetailTypes.Pois || detail === CustomStateDetailTypes.CallsAndPois || detail === CustomStateDetailTypes.StationsAndPois || detail === CustomStateDetailTypes.CallsStationsAndPois) {
    return true;
  }
  return options?.lenient ? statusDetailAllowsCalls(detail) || statusDetailAllowsStations(detail, options) : false;
};
