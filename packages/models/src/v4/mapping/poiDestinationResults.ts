import type { PoiResultData } from './poiResultData';

/**
 * A destination's availability (Core `PoiAvailabilityStatuses`, M0315): open destinations have no report, and an expired
 * report reads as open.
 */
export enum PoiAvailabilityStatuses {
  Open = 0,
  /** Taking patients, but some capabilities or capacity are reduced. */
  Limited = 1,
  /** Asking crews to go elsewhere unless there is no alternative. */
  Diversion = 2,
  /** Not taking anyone. */
  Closed = 3,
}

/** A capability the department's POIs can offer (`GET /Mapping/GetPoiCapabilities`). */
export class PoiCapabilityResultData {
  public PoiCapabilityId: string = '';
  public Name: string = '';
  public Sort: number = 0;
}

export interface PoiCapabilitiesResult {
  Data: PoiCapabilityResultData[];
  PageSize?: number;
  Status?: string;
}

/** One destination of `GET /Mapping/GetNearestDestinations`, best first. */
export class NearestDestinationResultData {
  public Poi: PoiResultData | null = null;
  /** Straight-line distance from the origin. */
  public DistanceMeters: number = 0;
  /** Travel seconds from the origin; -1 when not looked up (beyond the shortlist, or the lookup failed). */
  public TravelSeconds: number = -1;
  /** True when it can take the patient now (not closed; the asked capability not reported unavailable). */
  public CanProvide: boolean = true;
}

export interface NearestDestinationsResult {
  Data: NearestDestinationResultData[];
  PageSize?: number;
  Status?: string;
}

/** `POST /Mapping/SetPoiAvailability` body. */
export interface SetPoiAvailabilityInput {
  PoiId: number;
  /** PoiAvailabilityStatuses; Open clears the report. */
  Status: PoiAvailabilityStatuses;
  UnavailableCapabilityIds: string[];
  Note: string;
  /** Minutes until the report lapses (at most a week); null lasts until changed. */
  ExpiresInMinutes: number | null;
}

export interface SetPoiAvailabilityResult {
  /** The destination after the change. */
  Data: PoiResultData | null;
  PageSize?: number;
  Status?: string;
}
