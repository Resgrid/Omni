import { BaseV4Request } from '../baseV4Request';
import { type RouteDirectionsResultData } from './directionsResultData';
import { type RouteDeviationResultData } from './routeDeviationResultData';
import { type ActiveRouteInstanceResultData, type RouteInstanceResultData, type RouteProgressResultData } from './routeInstanceResultData';
import { type RouteStopWithDetailsResultData } from './routeInstanceStopResultData';
import { type RoutePlanDetailResultData, type RoutePlanResultData, type RouteStopContactResultData, type ScheduledRouteResultData } from './routePlanResultData';

export class GetRoutePlansResult extends BaseV4Request {
  public Data: RoutePlanResultData[] = [];
}

export class GetRoutePlanResult extends BaseV4Request {
  public Data: RoutePlanDetailResultData | null = null;
}

export class GetRouteInstanceResult extends BaseV4Request {
  public Data: RouteInstanceResultData | null = null;
}

export class GetRouteInstancesResult extends BaseV4Request {
  public Data: RouteInstanceResultData[] = [];
}

/** `GetRouteProgress/{instanceId}` and `GetActiveRouteForUnit/{unitId}`. */
export class GetRouteProgressResult extends BaseV4Request {
  public Data: RouteProgressResultData | null = null;
}

export class GetRouteStopsWithDetailsResult extends BaseV4Request {
  public Data: RouteStopWithDetailsResultData[] = [];
}

export class GetRouteDirectionsResult extends BaseV4Request {
  public Data: RouteDirectionsResultData | null = null;
}

export class GetRouteDeviationsResult extends BaseV4Request {
  public Data: RouteDeviationResultData[] = [];
}

export class GetStopContactResult extends BaseV4Request {
  public Data: RouteStopContactResultData | null = null;
}

export class GetRouteContactsResult extends BaseV4Request {
  public Data: RouteStopContactResultData[] = [];
}

/** CreateRoutePlan / UpdateRoutePlan: the plan id in `Id`. */
export class SaveRoutePlanResult extends BaseV4Request {
  public Id: string = '';
}

export class GetActiveRouteInstancesResult extends BaseV4Request {
  public Data: ActiveRouteInstanceResultData[] = [];
}

export class GetScheduledRoutesResult extends BaseV4Request {
  public Data: ScheduledRouteResultData[] = [];
}
