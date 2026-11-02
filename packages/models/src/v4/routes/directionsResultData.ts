import { type RouteIncidentData } from '../routing/routingData';

/** Mirror Core `RouteDirectionsResultData` / `RouteDirectionWaypointData` (routing is server-side; the app never calls a provider). */
export interface RouteDirectionWaypointData {
  RouteStopId: string | null;
  RouteInstanceStopId: string | null;
  StopOrder: number;
  Name: string | null;
  Latitude: number;
  Longitude: number;
  Address: string | null;
  Status: number;
  // MapLibre plan §10.5 (additive; absent on older servers).
  EstimatedDwellMinutes?: number | null;
  PlannedOffsetSeconds?: number | null;
  /** Live ETA (instance directions from a position) or a running instance's planned arrival. */
  EtaUtc?: string | null;
}

/** The resolved route start or end (a station or an explicit point). */
export interface RouteEndpointData {
  Latitude: number;
  Longitude: number;
  DepartmentGroupId: number | null;
  Name: string | null;
}

/** One leg per stop arrival (and one to the route end). */
export interface RouteDirectionLegData {
  /** The stop this leg arrives at; null for the leg to the route end. */
  RouteStopId: string | null;
  RouteInstanceStopId: string | null;
  Name: string | null;
  DistanceMeters: number;
  DurationSeconds: number;
  /** Seconds from the route start (or from now, for live directions) to arrival, including dwell before it. */
  OffsetSeconds: number;
  EtaUtc: string | null;
}

export interface RouteDirectionsResultData {
  RoutePlanId: string | null;
  RouteInstanceId: string | null;
  /** Route geometry as a GeoJSON LineString string. */
  Geometry: string | null;
  EstimatedDistanceMeters: number | null;
  EstimatedDurationSeconds: number | null;
  RouteProfile: string | null;
  OriginLatitude: number | null;
  OriginLongitude: number | null;
  Waypoints: RouteDirectionWaypointData[];
  // MapLibre plan §10.5 (additive; absent on older servers).
  Provider?: string | null;
  Attribution?: string | null;
  IsEstimate?: boolean;
  IsTrafficAware?: boolean;
  VehicleRestricted?: boolean;
  /** Computed from the caller's position (live instance directions). */
  IsLive?: boolean;
  EstimatedDurationWithDwellSeconds?: number | null;
  ComputedOn?: string | null;
  Start?: RouteEndpointData | null;
  End?: RouteEndpointData | null;
  Legs?: RouteDirectionLegData[];
  /** The full route in the OSRM v5 / Mapbox Directions shape (polyline6, legs with steps); null when unavailable. */
  Route?: unknown;
  Incidents?: RouteIncidentData[];
}
