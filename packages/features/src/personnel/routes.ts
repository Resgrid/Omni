import { routePathWithId } from '@resgrid/core/navigation/route-paths';

/**
 * Personnel routes (Dispatch detail pages; Responder/BigBoard lists). Ids pass `isSafeRouteId` before they build a
 * path; a refused id builds none (null, reported).
 */
export const PERSONNEL_ROUTE_PATTERNS = {
  list: '/personnel',
  detail: '/personnel/[id]',
} as const;

export const personnelRoutes = {
  list: (): string => '/personnel',
  detail: (userId: string): string | null => routePathWithId('personnel.detail', userId, (id) => `/personnel/${id}`),
} as const;
