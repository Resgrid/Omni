import { isSafeRouteId } from '@resgrid/core/utils/route-ids';

/** Work order routes (Responder). Ids are GUID strings; they pass `isSafeRouteId` before they build a path. */
export const WORK_ORDER_ROUTE_PATTERNS = {
  list: '/work-orders',
  report: '/work-orders/new',
  detail: '/work-orders/[id]',
} as const;

const encodeId = (id: string): string => {
  if (!isSafeRouteId(id)) throw new Error('Unsafe work order route id');
  return encodeURIComponent(id);
};

export const workOrderRoutes = {
  list: (): string => '/work-orders',
  report: (): string => '/work-orders/new',
  detail: (workOrderId: string): string => `/work-orders/${encodeId(workOrderId)}`,
} as const;
