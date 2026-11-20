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
  /** Core M0322: the call this run was started for (`Routes/StartCallRoute`); null for other runs, undefined from older servers. */
  CallId?: number | null;
  /** Core M0322: when the unit reached the route start (ISO-8601 UTC); null until then, undefined from older servers. */
  StartReachedOn?: string | null;
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
  /** Core M0322: the call this run was started for (`Routes/StartCallRoute`); null for other runs, undefined from older servers. */
  CallId?: number | null;
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
