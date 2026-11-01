import { isSafeRouteId } from '@resgrid/core/utils/route-ids';

/** Unit inventory routes (kept from the Unit app): the unit's inventory and one count. */
export const INVENTORY_ROUTE_PATTERNS = {
  list: '/inventory',
  count: '/inventory/count/[id]',
} as const;

export const inventoryRoutes = {
  list: (): string => '/inventory',
  count: (countId: string): string => {
    if (!isSafeRouteId(countId)) throw new Error('Unsafe inventory count route id');
    return `/inventory/count/${encodeURIComponent(countId)}`;
  },
} as const;

/** A route param as a safe id (first value, trimmed); null when missing or unsafe. */
export const readInventoryParam = (value: string | string[] | null | undefined): string | null => {
  const raw = (Array.isArray(value) ? value[0] : value)?.trim() ?? '';
  if (raw === '' || raw === 'undefined' || raw === 'null') return null;
  return isSafeRouteId(raw) ? raw : null;
};
