import { routePathWithId } from '@resgrid/core/navigation/route-paths';

/**
 * Unit routes (Dispatch detail pages; Responder/BigBoard lists). Ids pass `isSafeRouteId` before they build a path; a
 * refused id builds none (null, reported).
 */
export const UNITS_ROUTE_PATTERNS = {
  list: '/units',
  detail: '/units/[id]',
} as const;

export const unitsRoutes = {
  list: (): string => '/units',
  detail: (unitId: string): string | null => routePathWithId('units.detail', unitId, (id) => `/units/${id}`),
} as const;
