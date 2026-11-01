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
}

export interface RouteDirectionsResultData {
  RoutePlanId: string | null;
  RouteInstanceId: string | null;
  /** Route geometry as returned by the server's routing provider. */
  Geometry: string | null;
  EstimatedDistanceMeters: number | null;
  EstimatedDurationSeconds: number | null;
  RouteProfile: string | null;
  OriginLatitude: number | null;
  OriginLongitude: number | null;
  Waypoints: RouteDirectionWaypointData[];
}
