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
