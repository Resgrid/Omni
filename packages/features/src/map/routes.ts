import { isSafeRouteId } from '@resgrid/core/utils/route-ids';

/**
 * The department map (`/map`, canonical for every variant that ships it; omni-plan §5.3.4). Focus is a query parameter
 * so one route serves every entry point: `/map?callId=12` frames call 12, `?unitId=`, `?userId=` and `?poiId=` frame a
 * unit, a member or a POI. Ids pass `isSafeRouteId` (POI ids: positive integers) before they build a link.
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

const encodeId = (id: string | number): string => {
  const value = String(id);
  if (!isSafeRouteId(value)) throw new Error('Unsafe map focus id');
  return encodeURIComponent(value);
};

export const mapRoutes = {
  map: (): string => '/map',
  focusCall: (callId: string | number): string => `/map?${MAP_FOCUS_PARAMS.call}=${encodeId(callId)}`,
  focusUnit: (unitId: string | number): string => `/map?${MAP_FOCUS_PARAMS.unit}=${encodeId(unitId)}`,
  focusPersonnel: (userId: string): string => `/map?${MAP_FOCUS_PARAMS.personnel}=${encodeId(userId)}`,
  focusPoi: (poiId: number): string => {
    if (!Number.isInteger(poiId) || poiId <= 0) throw new Error('Unsafe map focus id');
    return `/map?${MAP_FOCUS_PARAMS.poi}=${poiId}`;
  },
} as const;
