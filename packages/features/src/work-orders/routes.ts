import { routePathWithId } from '@resgrid/core/navigation/route-paths';

/**
 * Work order routes (Responder). Ids are GUID strings; they pass `isSafeRouteId` before they build a path, and a
 * refused id builds none (null, reported).
 */
export const WORK_ORDER_ROUTE_PATTERNS = {
  list: '/work-orders',
  report: '/work-orders/new',
  detail: '/work-orders/[id]',
} as const;

export const workOrderRoutes = {
  list: (): string => '/work-orders',
  report: (): string => '/work-orders/new',
  detail: (workOrderId: string): string | null => routePathWithId('work_orders.detail', workOrderId, (id) => `/work-orders/${id}`),
} as const;
