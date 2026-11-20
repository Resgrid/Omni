import { isMappable, parseRouteGeometry, type RouteGeometry } from '@resgrid/features/unit-routes/lib/route-geo';
import type { StatusLook } from '@resgrid/features/unit-routes/lib/route-status';
import type { RouteMapStop } from '@resgrid/features/unit-routes/map-slot';
import { type RouteDirectionsResultData, type RouteEndpointData, type RoutePlanDetailResultData, RoutePlanStatus, type RouteStopResultData, RoutingProfile } from '@resgrid/models';

/** Marker colours of a route's start and end in a preview. */
export const ROUTE_START_COLOR = '#16a34a';
export const ROUTE_END_COLOR = '#dc2626';

/** Two positions this close (about a metre) are the same place: the start is the first stop, the end the last. */
const SAME_PLACE_DEGREES = 0.00001;

const DRAFT_LOOK: StatusLook = { labelKey: 'route_plans.status.draft', color: '#6b7280' };

/** Core `RouteStatus`: how a plan's status shows (only Active plans run or go on a call). */
const ROUTE_PLAN_STATUS_LOOK = new Map<number, StatusLook>([
  [RoutePlanStatus.Draft, DRAFT_LOOK],
  [RoutePlanStatus.Active, { labelKey: 'route_plans.status.active', color: '#16a34a' }],
  [RoutePlanStatus.Paused, { labelKey: 'route_plans.status.paused', color: '#eab308' }],
  [RoutePlanStatus.Archived, { labelKey: 'route_plans.status.archived', color: '#9ca3af' }],
]);

/** A plan status's label key and colour; an unknown status shows as a draft. */
export const routePlanStatusLook = (status: number | null | undefined): StatusLook => ROUTE_PLAN_STATUS_LOOK.get(status ?? RoutePlanStatus.Draft) ?? DRAFT_LOOK;

/** Core `RoutingProfile` → its label key. */
const ROUTING_PROFILE_KEYS = new Map<number, string>([
  [RoutingProfile.Driving, 'route_plans.profile.driving'],
  [RoutingProfile.DrivingTraffic, 'route_plans.profile.driving_traffic'],
  [RoutingProfile.Truck, 'route_plans.profile.truck'],
  [RoutingProfile.Walking, 'route_plans.profile.walking'],
  [RoutingProfile.Cycling, 'route_plans.profile.cycling'],
]);

/** The label key of a plan's travel mode; null when the server sends none (older servers). */
export const routingProfileKey = (profile: number | null | undefined): string | null => (profile === null || profile === undefined ? null : (ROUTING_PROFILE_KEYS.get(profile) ?? null));

/** The plan's stored route line, else the line of its stored directions; null when neither has one. */
export const planPreviewLine = (plan: Pick<RoutePlanDetailResultData, 'MapboxRouteGeometry'>, directions: Pick<RouteDirectionsResultData, 'Geometry'> | null): RouteGeometry | null =>
  parseRouteGeometry(plan.MapboxRouteGeometry) ?? parseRouteGeometry(directions?.Geometry);

const samePlace = (a: Pick<RouteEndpointData, 'Latitude' | 'Longitude'>, b: Pick<RouteStopResultData, 'Latitude' | 'Longitude'> | undefined): boolean =>
  !!b && Math.abs(a.Latitude - b.Latitude) < SAME_PLACE_DEGREES && Math.abs(a.Longitude - b.Longitude) < SAME_PLACE_DEGREES;

/** A resolved route start or end the preview marks on its own: a station or an explicit point, not a stop. */
export interface RouteEndpointPreview {
  kind: 'start' | 'end';
  endpoint: RouteEndpointData;
  /** It is the first (start) or last (end) stop: no marker of its own. */
  isStop: boolean;
}

/**
 * The route's start and end (resolved by Core: the station, else the explicit point, else the first / last stop), each
 * flagged when it is the first or last stop. Empty when the server sent no directions for the plan.
 */
export const routeEndpointsOf = (directions: Pick<RouteDirectionsResultData, 'Start' | 'End'> | null, sortedStops: readonly RouteStopResultData[]): RouteEndpointPreview[] => {
  const endpoints: RouteEndpointPreview[] = [];
  const start = directions?.Start;
  const end = directions?.End;

  if (start && isMappable(start.Latitude, start.Longitude)) endpoints.push({ kind: 'start', endpoint: start, isStop: samePlace(start, sortedStops[0]) });

  if (end && isMappable(end.Latitude, end.Longitude)) endpoints.push({ kind: 'end', endpoint: end, isStop: samePlace(end, sortedStops[sortedStops.length - 1]) });

  return endpoints;
};

/** Start and end markers for the route map (labelled, in their own colours); a start or end that is a stop gets none. */
export const routeEndpointMarkers = (endpoints: readonly RouteEndpointPreview[], labels: { start: string; end: string }): RouteMapStop[] =>
  endpoints.flatMap(({ kind, endpoint, isStop }) =>
    isStop
      ? []
      : [
          {
            id: `route-${kind}`,
            order: kind === 'start' ? 0 : Number.MAX_SAFE_INTEGER,
            name: endpoint.Name ?? '',
            latitude: endpoint.Latitude,
            longitude: endpoint.Longitude,
            status: 0,
            isCurrent: false,
            color: kind === 'start' ? ROUTE_START_COLOR : ROUTE_END_COLOR,
            label: kind === 'start' ? labels.start : labels.end,
          },
        ]
  );

/** A resolved start or end as text: its name, else its coordinates. */
export const endpointText = (endpoint: Pick<RouteEndpointData, 'Name' | 'Latitude' | 'Longitude'>): string => {
  const name = endpoint.Name?.trim() ?? '';

  return name || `${Math.round(endpoint.Latitude * 1e5) / 1e5}, ${Math.round(endpoint.Longitude * 1e5) / 1e5}`;
};
