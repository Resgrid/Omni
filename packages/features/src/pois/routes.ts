import { isNumericRouteId, routePathWithId } from '@resgrid/core/navigation/route-paths';

/**
 * POI routes. `/poi/[id]` is canonical for every variant (omni-plan §5.3.4); ids are positive integers, and anything
 * else builds no path (null, reported).
 */
export const POIS_ROUTE_PATTERNS = {
  list: '/pois',
  detail: '/poi/[id]',
  destinations: '/destinations',
} as const;

export const poisRoutes = {
  list: (): string => '/pois',
  destinations: (): string => '/destinations',
  detail: (poiId: number): string | null => routePathWithId('pois.detail', poiId, (id) => `/poi/${id}`, isNumericRouteId),
} as const;
