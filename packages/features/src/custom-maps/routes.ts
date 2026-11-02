import { isSafeRouteId } from '@resgrid/core/utils/route-ids';

/**
 * The custom and indoor maps browser (Unit/IC `app/maps`, `maps.customIndoor`): the list, the search, a custom map with
 * its layers and an indoor map with its floors. `?layerId=` / `?floorId=` open a layer or floor, `?featureId=` selects a
 * region or zone (search results). Ids pass `isSafeRouteId` before they build a path.
 */
export const CUSTOM_MAPS_ROUTE_PATTERNS = {
  home: '/maps',
  search: '/maps/search',
  custom: '/maps/custom/[id]',
  indoor: '/maps/indoor/[id]',
} as const;

const encodeId = (id: string): string => {
  if (!isSafeRouteId(id)) throw new Error('Unsafe map route id');
  return encodeURIComponent(id);
};

const withQuery = (path: string, query: Record<string, string | null | undefined>): string => {
  const parts = Object.entries(query)
    .filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].length > 0)
    .map(([key, value]) => `${key}=${encodeId(value)}`);
  return parts.length > 0 ? `${path}?${parts.join('&')}` : path;
};

export const customMapsRoutes = {
  home: (): string => '/maps',
  search: (): string => '/maps/search',
  custom: (mapId: string, options: { layerId?: string | null; featureId?: string | null } = {}): string => withQuery(`/maps/custom/${encodeId(mapId)}`, { layerId: options.layerId, featureId: options.featureId }),
  indoor: (mapId: string, options: { floorId?: string | null; featureId?: string | null } = {}): string => withQuery(`/maps/indoor/${encodeId(mapId)}`, { floorId: options.floorId, featureId: options.featureId }),
};

/** A route param as a safe id; null for missing, leftovers or unsafe ids. */
export const readMapParam = (value: string | string[] | null | undefined): string | null => {
  const raw = (Array.isArray(value) ? value[0] : value)?.trim() ?? '';
  if (raw === '' || raw === 'undefined' || raw === 'null') return null;
  return isSafeRouteId(raw) ? raw : null;
};
