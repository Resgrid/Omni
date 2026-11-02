import { isSafeRouteId } from '@resgrid/core/utils/route-ids';

/**
 * The in-app navigation screen (`/navigate`, MapLibre plan §9): `?callId=` routes to a call, `?instanceId=` through a
 * running route's remaining stops. A point destination (POI, map pin, contact) is handed over in memory
 * (`requestPointNavigation`) so coordinates never sit in a URL or the browser history.
 */
export const NAVIGATION_ROUTE_PATTERNS = { navigate: '/navigate' } as const;

export interface PointNavigationRequest {
  latitude: number;
  longitude: number;
  name: string | null;
}

let pendingPoint: PointNavigationRequest | null = null;

/** Hands a point destination to the next `/navigate` screen (read once). */
export const requestPointNavigation = (point: PointNavigationRequest): void => {
  pendingPoint = point;
};

/** The point handed over by `requestPointNavigation`, once. */
export const takePointNavigationRequest = (): PointNavigationRequest | null => {
  const point = pendingPoint;
  pendingPoint = null;
  return point;
};

export const navigationRoutes = {
  /** Turn-by-turn to a call (the server resolves its location and checks the caller may see it). */
  toCall: (callId: number | string): string => {
    const id = Number(callId);
    if (!Number.isInteger(id) || id <= 0) throw new Error('Unsafe call id');
    return `/navigate?callId=${id}`;
  },
  /** Turn-by-turn through a running route's remaining stops. */
  toRouteStops: (routeInstanceId: string): string => {
    if (!isSafeRouteId(routeInstanceId)) throw new Error('Unsafe route instance id');
    return `/navigate?instanceId=${encodeURIComponent(routeInstanceId)}`;
  },
  /** Turn-by-turn to the point passed to `requestPointNavigation` first. */
  toPoint: (): string => '/navigate',
};

const first = (value: string | string[] | null | undefined): string => ((Array.isArray(value) ? value[0] : value) ?? '').trim();

export type NavigationRequest = { kind: 'call'; callId: number } | { kind: 'route'; routeInstanceId: string } | { kind: 'point'; point: PointNavigationRequest } | null;

/** What a `/navigate` URL asks for (call or route instance); null when it carries neither (then a pending point applies). */
export const readNavigationParams = (params: { callId?: string | string[]; instanceId?: string | string[] }): NavigationRequest => {
  const callId = Number(first(params.callId));
  if (Number.isInteger(callId) && callId > 0) return { kind: 'call', callId };
  const instanceId = first(params.instanceId);
  if (instanceId && isSafeRouteId(instanceId)) return { kind: 'route', routeInstanceId: instanceId };
  return null;
};
