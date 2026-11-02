/**
 * Routing results and inputs — mirror Core `Models/v4/Routing/RoutingModels.cs` (MapLibre plan §6.3, §9.4). Every route a
 * client draws or navigates comes from the Resgrid server; the app never calls a routing provider.
 */

/** Core `RoutingProfile` (persisted, never renumber). */
export const RoutingProfile = { Driving: 0, DrivingTraffic: 1, Truck: 2, Walking: 3, Cycling: 4 } as const;
export type RoutingProfileValue = (typeof RoutingProfile)[keyof typeof RoutingProfile];

/** Core `RouteAvoidOptions` flags. */
export const RouteAvoidOptions = { None: 0, Tolls: 1, Highways: 2, Ferries: 4, Unpaved: 8 } as const;

/** Core `UnitNavigationStates` (persisted, never renumber). */
export const UnitNavigationState = { Started: 0, Progress: 1, Rerouted: 2, Arrived: 3, Ended: 4 } as const;
export type UnitNavigationStateValue = (typeof UnitNavigationState)[keyof typeof UnitNavigationState];

/** Which vehicle limits the install's provider enforces: all seven (Valhalla), height/width/weight (Mapbox) or none. */
export type VehicleLimitsEnforced = 'all' | 'size' | 'none';

/** A point in a route request. */
export interface RoutePointInput {
  Latitude: number;
  Longitude: number;
  /** Direction of travel in degrees at this point (first point when rerouting). */
  Heading?: number | null;
  /** False for a pass-through point. */
  IsStop?: boolean;
}

/** Body of `POST Routing/GetRoute`. */
export interface GetRouteInput {
  Points: RoutePointInput[];
  /** `RoutingProfile`. */
  Profile: number;
  /** `RouteAvoidOptions` flags. */
  Avoid?: number;
  /** Apply this unit's vehicle size and weight. */
  UnitId?: number | null;
  Steps?: boolean;
  /** Voice and banner instructions (ignored when the provider cannot navigate). */
  Navigation?: boolean;
  Language?: string | null;
  /** True for metric instructions; false for imperial. */
  Metric?: boolean;
}

export interface RouteLegData {
  DistanceMeters: number;
  DurationSeconds: number;
}

/** A traffic incident along a route (Mapbox driving-traffic only). */
export interface RouteIncidentData {
  /** accident, construction, road_closure, congestion, lane_restriction… */
  Type: string | null;
  Description: string | null;
  /** low, minor, major, critical or unknown. */
  Impact: string | null;
  Latitude: number | null;
  Longitude: number | null;
  Closed: boolean;
}

export interface RouteResultData {
  /** valhalla, mapbox, google, osrm or estimate. */
  Provider: string | null;
  Attribution: string | null;
  DistanceMeters: number;
  DurationSeconds: number;
  /** Duration without live traffic, when the provider reports it. */
  TypicalDurationSeconds: number | null;
  IsTrafficAware: boolean;
  /** The vehicle's size and weight limits were applied. */
  VehicleRestricted: boolean;
  VehicleLimitsEnforced: VehicleLimitsEnforced | string | null;
  /** A straight-line estimate, not a road route. */
  IsEstimate: boolean;
  /** GeoJSON LineString string. */
  Geometry: string | null;
  Legs: RouteLegData[];
  Incidents: RouteIncidentData[];
  /**
   * The full route in the OSRM v5 / Mapbox Directions shape (polyline6 geometry, legs with steps and maneuvers,
   * `voiceInstructions` / `bannerInstructions` when navigation was requested); null without steps.
   */
  Route: unknown;
  /** In-app navigation may use this route (Valhalla or Mapbox, navigation enabled). */
  NavigationAvailable: boolean;
  /** When to ask again (traffic-aware routes change). */
  ExpiresUtc: string | null;
}

export interface RoutingCapabilitiesData {
  Provider: string | null;
  Attribution: string | null;
  Steps: boolean;
  Traffic: boolean;
  Incidents: boolean;
  NavigationAvailable: boolean;
  VehicleLimitsEnforced: VehicleLimitsEnforced | string | null;
}

/** Body of `POST Routing/ReportNavigationProgress`: send `CallId` or `RouteInstanceId`, never both. */
export interface ReportNavigationProgressInput {
  UnitId: number;
  CallId?: number | null;
  RouteInstanceId?: string | null;
  RouteInstanceStopId?: string | null;
  /** `UnitNavigationState`. */
  State: number;
  /** ISO UTC; when omitted the server uses now + RemainingSeconds. */
  EtaUtc?: string | null;
  RemainingSeconds: number;
  RemainingMeters: number;
  IsTrafficAware: boolean;
  Provider?: string | null;
}

/** A navigating unit's live ETA (`GetActiveNavigations`, `ReportNavigationProgress`). */
export interface UnitNavigationData {
  UnitId: number;
  CallId: number | null;
  RouteInstanceId: string | null;
  RouteInstanceStopId: string | null;
  /** `UnitNavigationState`. */
  State: number;
  EtaUtc: string;
  RemainingSeconds: number;
  RemainingMeters: number;
  IsTrafficAware: boolean;
  Provider: string | null;
  ReportedOn: string;
  /** No report for more than 60 seconds. */
  IsStale: boolean;
}
