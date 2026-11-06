import { isNumericRouteId, routePathWithId } from '@resgrid/core/navigation/route-paths';

/**
 * The department map (`/map`, canonical for every variant that ships it; omni-plan §5.3.4). Focus is a query parameter
 * so one route serves every entry point: `/map?callId=12` frames call 12, `?unitId=`, `?userId=` and `?poiId=` frame a
 * unit, a member or a POI. Ids pass `isSafeRouteId` (POI ids: positive integers) before they build a link; a refused id
 * builds none (null, reported).
 */
export const MAP_ROUTE_PATTERNS = {
  map: '/map',
} as const;

/** Query parameter per focus kind (read back by `parseMapFocus`). */
export const MAP_FOCUS_PARAMS = {
  call: 'callId',
  unit: 'unitId',
  personnel: 'userId',
  poi: 'poiId',
} as const;

export const mapRoutes = {
  map: (): string => '/map',
  focusCall: (callId: string | number): string | null => routePathWithId('map.focus_call', callId, (id) => `/map?${MAP_FOCUS_PARAMS.call}=${id}`),
  focusUnit: (unitId: string | number): string | null => routePathWithId('map.focus_unit', unitId, (id) => `/map?${MAP_FOCUS_PARAMS.unit}=${id}`),
  focusPersonnel: (userId: string): string | null => routePathWithId('map.focus_personnel', userId, (id) => `/map?${MAP_FOCUS_PARAMS.personnel}=${id}`),
  focusPoi: (poiId: number): string | null => routePathWithId('map.focus_poi', poiId, (id) => `/map?${MAP_FOCUS_PARAMS.poi}=${id}`, isNumericRouteId),
} as const;
