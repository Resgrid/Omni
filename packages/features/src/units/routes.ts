import { isSafeRouteId } from '@resgrid/core/utils/route-ids';

/** Unit routes (Dispatch detail pages; Responder/BigBoard lists). Ids pass `isSafeRouteId` before they build a path. */
export const UNITS_ROUTE_PATTERNS = {
  list: '/units',
  detail: '/units/[id]',
} as const;

const encodeId = (id: string): string => {
  if (!isSafeRouteId(id)) throw new Error('Unsafe unit route id');
  return encodeURIComponent(id);
};

export const unitsRoutes = {
  list: (): string => '/units',
  detail: (unitId: string): string => `/units/${encodeId(unitId)}`,
} as const;
