import { type RouteInstanceStopResultData } from './routeInstanceStopResultData';

/** Route instance results — mirror Core `Models/v4/Routes/RouteResultModels.cs`. */

export interface RouteInstanceResultData {
  RouteInstanceId: string;
  RoutePlanId: string;
  RoutePlanName: string | null;
  UnitId: number;
  Status: number;
  ActualStartOn: string | null;
  ActualEndOn: string | null;
  StopsCompleted: number;
  StopsTotal: number;
  TotalDistanceMeters: number | null;
  TotalDurationSeconds: number | null;
  Notes: string | null;
  AddedOn: string;
}

export interface ActiveRouteInstanceResultData {
  RouteInstanceId: string;
  RoutePlanId: string;
  RoutePlanName: string | null;
  UnitId: number;
  Status: number;
  ActualStartOn: string | null;
  StopsCompleted: number;
  StopsTotal: number;
  ProgressPercent: number;
  CurrentStopIndex: number;
  CurrentStopName: string | null;
}

/** `GetRouteProgress/{instanceId}` and `GetActiveRouteForUnit/{unitId}` (the latter answers HTTP 404 when the unit has no running or paused route). */
export interface RouteProgressResultData {
  Instance: RouteInstanceResultData;
  TotalStops: number;
  CompletedStops: number;
  SkippedStops: number;
  PendingStops: number;
  Stops: RouteInstanceStopResultData[];
}
