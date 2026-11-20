import { routePathWithId } from '@resgrid/core/navigation/route-paths';

/**
 * The department's routes (`capabilities.routes.preview`, Dispatch's routes area): plans with their status and the running
 * routes with their progress, and one running route read only. Plan previews use `@resgrid/features/route-plans` routes.
 */
export const ROUTES_OVERVIEW_ROUTE_PATTERNS = {
  list: '/route-plans',
  instance: '/route-instances/[id]',
} as const;

export const routesOverviewRoutes = {
  list: (): string => '/route-plans',
  /** A route run, read only (`GetRouteProgress` + `GetStopsForInstance`). */
  instance: (instanceId: string | null | undefined): string | null => routePathWithId('routes_overview.instance', instanceId, (id) => `/route-instances/${id}`),
} as const;
