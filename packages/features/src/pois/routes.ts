import { isNumericRouteId, routePathWithId } from '@resgrid/core/navigation/route-paths';

/**
 * POI routes. `/poi/[id]` is canonical for every variant (omni-plan §5.3.4); ids are positive integers, and anything
 * else builds no path (null, reported).
 */
export const POIS_ROUTE_PATTERNS = {
  list: '/pois',
  detail: '/poi/[id]',
} as const;

export const poisRoutes = {
  list: (): string => '/pois',
  detail: (poiId: number): string | null => routePathWithId('pois.detail', poiId, (id) => `/poi/${id}`, isNumericRouteId),
} as const;
