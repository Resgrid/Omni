/** Route request bodies — mirror Core `Models/v4/Routes/RouteInputModels.cs`. Unit ids are Core ints. */

export interface StartRouteInput {
  RoutePlanId: string;
  UnitId: number;
}

export interface EndRouteInput {
  RouteInstanceId: string;
}

export interface PauseRouteInput {
  RouteInstanceId: string;
}

export interface ResumeRouteInput {
  RouteInstanceId: string;
}

export interface CancelRouteInput {
  RouteInstanceId: string;
  Reason?: string | null;
}

export interface CheckInInput {
  RouteInstanceStopId: string;
  Latitude: number;
  Longitude: number;
}

export interface CheckOutInput {
  RouteInstanceStopId: string;
  Latitude: number;
  Longitude: number;
}

export interface SkipStopInput {
  RouteInstanceStopId: string;
  Reason?: string | null;
}

export interface GeofenceCheckInInput {
  UnitId: number;
  Latitude: number;
  Longitude: number;
}

export interface UpdateStopNotesInput {
  RouteInstanceStopId: string;
  Notes?: string | null;
}

export interface NewRouteStopInput {
  Name: string;
  Description?: string | null;
  StopType: number;
  CallId?: number | null;
  Latitude: number;
  Longitude: number;
  Address?: string | null;
  GeofenceRadiusMeters?: number | null;
  Priority: number;
  PlannedArrivalTime?: string | null;
  PlannedDepartureTime?: string | null;
  EstimatedDwellMinutes?: number | null;
  ContactName?: string | null;
  ContactNumber?: string | null;
  Notes?: string | null;
}

export interface RouteScheduleInput {
  RecurrenceType: number;
  RecurrenceCron?: string | null;
  DaysOfWeek?: string | null;
  DayOfMonth?: number | null;
  ScheduledStartTime?: string | null;
  EffectiveFrom: string;
  EffectiveTo?: string | null;
}

export interface NewRoutePlanInput {
  Name: string;
  Description?: string | null;
  UnitId?: number | null;
  RouteStatus: number;
  RouteColor?: string | null;
  StartLatitude?: number | null;
  StartLongitude?: number | null;
  EndLatitude?: number | null;
  EndLongitude?: number | null;
  UseStationAsStart: boolean;
  UseStationAsEnd: boolean;
  OptimizeStopOrder: boolean;
  MapboxRouteProfile?: string | null;
  GeofenceRadiusMeters: number;
  Stops: NewRouteStopInput[];
  Schedules: RouteScheduleInput[];
}

export interface UpdateRoutePlanInput extends NewRoutePlanInput {
  RoutePlanId: string;
}
