/** Route plan results — mirror Core `Models/v4/Routes/RouteResultModels.cs`. */

export interface RoutePlanResultData {
  RoutePlanId: string;
  Name: string;
  Description: string | null;
  UnitId: number | null;
  RouteStatus: number;
  RouteColor: string | null;
  StopsCount: number;
  EstimatedDistanceMeters: number | null;
  EstimatedDurationSeconds: number | null;
  MapboxRouteProfile: string | null;
  AddedOn: string;
  // MapLibre plan §10.5 (additive; absent on older servers).
  /** `RoutingProfile`. */
  RoutingProfile?: number;
  /** `RouteAvoidOptions` flags. */
  AvoidOptions?: number;
  RouteProvider?: string | null;
  RouteComputedOn?: string | null;
  /** Stops or options changed since the stored route was generated. */
  RouteIsStale?: boolean;
}

export interface RouteStopResultData {
  RouteStopId: string;
  StopOrder: number;
  Name: string;
  Description: string | null;
  StopType: number;
  CallId: number | null;
  Latitude: number;
  Longitude: number;
  Address: string | null;
  GeofenceRadiusMeters: number | null;
  Priority: number;
  PlannedArrivalTime: string | null;
  PlannedDepartureTime: string | null;
  EstimatedDwellMinutes: number | null;
  ContactId: string | null;
  ContactName: string | null;
  ContactNumber: string | null;
  Notes: string | null;
  // MapLibre plan §10.5 (additive).
  /** Distance of the leg arriving at this stop. */
  LegDistanceMeters?: number | null;
  /** Travel time of the leg arriving at this stop. */
  LegDurationSeconds?: number | null;
  /** Seconds from the route start to arrival here, including earlier stops' dwell. */
  PlannedOffsetSeconds?: number | null;
}

export interface RouteScheduleResultData {
  RouteScheduleId: string;
  RecurrenceType: number;
  RecurrenceCron: string | null;
  DaysOfWeek: string | null;
  DayOfMonth: number | null;
  ScheduledStartTime: string | null;
  EffectiveFrom: string;
  EffectiveTo: string | null;
  IsActive: boolean;
}

export interface RoutePlanDetailResultData {
  RoutePlanId: string;
  Name: string;
  Description: string | null;
  DepartmentId: number;
  UnitId: number | null;
  RouteStatus: number;
  RouteColor: string | null;
  StartLatitude: number | null;
  StartLongitude: number | null;
  EndLatitude: number | null;
  EndLongitude: number | null;
  UseStationAsStart: boolean;
  UseStationAsEnd: boolean;
  OptimizeStopOrder: boolean;
  MapboxRouteProfile: string | null;
  MapboxRouteGeometry: string | null;
  EstimatedDistanceMeters: number | null;
  EstimatedDurationSeconds: number | null;
  GeofenceRadiusMeters: number;
  AddedOn: string;
  Stops: RouteStopResultData[];
  Schedules: RouteScheduleResultData[];
  // MapLibre plan §10.5 (additive; absent on older servers).
  RoutingProfile?: number;
  AvoidOptions?: number;
  StartDepartmentGroupId?: number | null;
  EndDepartmentGroupId?: number | null;
  RouteProvider?: string | null;
  RouteComputedOn?: string | null;
  RouteIsStale?: boolean;
  /** Travel time plus every stop's estimated dwell. */
  EstimatedDurationWithDwellSeconds?: number | null;
}

export interface ScheduledRouteResultData {
  RouteScheduleId: string;
  RoutePlanId: string;
  RoutePlanName: string | null;
  UnitId: number | null;
  RecurrenceType: number;
  RecurrenceCron: string | null;
  DaysOfWeek: string | null;
  DayOfMonth: number | null;
  ScheduledStartTime: string | null;
  EffectiveFrom: string;
  EffectiveTo: string | null;
  IsActive: boolean;
}

export interface RouteStopContactResultData {
  ContactId: string;
  RouteStopId: string;
  StopName: string | null;
  ContactType: number;
  FirstName: string | null;
  LastName: string | null;
  CompanyName: string | null;
  Email: string | null;
  HomePhoneNumber: string | null;
  CellPhoneNumber: string | null;
  OfficePhoneNumber: string | null;
  Website: string | null;
  LocationGpsCoordinates: string | null;
  EntranceGpsCoordinates: string | null;
  ExitGpsCoordinates: string | null;
  LocationGeofence: string | null;
  Description: string | null;
}
