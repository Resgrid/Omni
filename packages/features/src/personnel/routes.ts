import { isSafeRouteId } from '@resgrid/core/utils/route-ids';

/** Personnel routes (Dispatch detail pages; Responder/BigBoard lists). Ids pass `isSafeRouteId` before they build a path. */
export const PERSONNEL_ROUTE_PATTERNS = {
  list: '/personnel',
  detail: '/personnel/[id]',
} as const;

const encodeId = (id: string): string => {
  if (!isSafeRouteId(id)) throw new Error('Unsafe personnel route id');
  return encodeURIComponent(id);
};

export const personnelRoutes = {
  list: (): string => '/personnel',
  detail: (userId: string): string => `/personnel/${encodeId(userId)}`,
} as const;
