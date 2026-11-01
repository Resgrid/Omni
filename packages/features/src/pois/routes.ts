/** POI routes. `/poi/[id]` is canonical for every variant (omni-plan §5.3.4); ids are positive integers. */
export const POIS_ROUTE_PATTERNS = {
  list: '/pois',
  detail: '/poi/[id]',
} as const;

export const poisRoutes = {
  list: (): string => '/pois',
  detail: (poiId: number): string => {
    if (!Number.isInteger(poiId) || poiId <= 0) throw new Error('Unsafe POI route id');
    return `/poi/${poiId}`;
  },
} as const;
