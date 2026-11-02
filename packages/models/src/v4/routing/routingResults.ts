import { BaseV4Request } from '../baseV4Request';
import { type RouteResultData, type RoutingCapabilitiesData, type UnitNavigationData } from './routingData';

/** `Routing/GetRoute` and `Routing/GetCallRoute`. `Data` is empty (no `Provider`) when no route was found. */
export class GetRouteResult extends BaseV4Request {
  public Data: RouteResultData | null = null;
}

export class RoutingCapabilitiesResult extends BaseV4Request {
  public Data: RoutingCapabilitiesData | null = null;
}

export class ReportNavigationProgressResult extends BaseV4Request {
  public Data: UnitNavigationData | null = null;
}

export class GetActiveNavigationsResult extends BaseV4Request {
  public Data: UnitNavigationData[] = [];
}
