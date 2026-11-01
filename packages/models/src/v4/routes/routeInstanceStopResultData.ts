/** Mirror Core `RouteInstanceStopResultData` and `RouteStopWithDetailsResultData`. */

export interface RouteInstanceStopResultData {
  RouteInstanceStopId: string;
  RouteStopId: string;
  StopOrder: number;
  Status: number;
  CheckInOn: string | null;
  CheckInType: number | null;
  CheckInLatitude: number | null;
  CheckInLongitude: number | null;
  CheckOutOn: string | null;
  CheckOutLatitude: number | null;
  CheckOutLongitude: number | null;
  DwellSeconds: number | null;
  SkipReason: string | null;
  Notes: string | null;
  EstimatedArrivalOn: string | null;
  ActualArrivalDeviation: number | null;
}

/** `GetStopsForInstance/{instanceId}`: plan stop joined with its instance progress. */
export interface RouteStopWithDetailsResultData {
  RouteStopId: string;
  RoutePlanId: string;
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
  PlanNotes: string | null;
  RouteInstanceStopId: string | null;
  RouteInstanceId: string | null;
  Status: number;
  CheckInOn: string | null;
  CheckInType: number | null;
  CheckInLatitude: number | null;
  CheckInLongitude: number | null;
  CheckOutOn: string | null;
  CheckOutLatitude: number | null;
  CheckOutLongitude: number | null;
  DwellSeconds: number | null;
  SkipReason: string | null;
  InstanceNotes: string | null;
  EstimatedArrivalOn: string | null;
  ActualArrivalDeviation: number | null;
}
