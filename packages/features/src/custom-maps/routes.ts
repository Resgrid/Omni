import { routePathWithId, routePathWithQuery } from '@resgrid/core/navigation/route-paths';
import { isSafeRouteId } from '@resgrid/core/utils/route-ids';

/**
 * The custom and indoor maps browser (Unit/IC `app/maps`, `maps.customIndoor`): the list, the search, a custom map with
 * its layers and an indoor map with its floors. `?layerId=` / `?floorId=` open a layer or floor, `?featureId=` selects a
 * region or zone (search results). Ids pass `isSafeRouteId` before they build a path; a refused one builds none (null,
 * reported).
 */
export const CUSTOM_MAPS_ROUTE_PATTERNS = {
  home: '/maps',
  search: '/maps/search',
  custom: '/maps/custom/[id]',
  indoor: '/maps/indoor/[id]',
} as const;

export const customMapsRoutes = {
  home: (): string => '/maps',
  search: (): string => '/maps/search',
  custom: (mapId: string, options: { layerId?: string | null; featureId?: string | null } = {}): string | null =>
    routePathWithQuery(
      'custom_maps.custom',
      routePathWithId('custom_maps.custom', mapId, (id) => `/maps/custom/${id}`),
      { layerId: options.layerId, featureId: options.featureId }
    ),
  indoor: (mapId: string, options: { floorId?: string | null; featureId?: string | null } = {}): string | null =>
    routePathWithQuery(
      'custom_maps.indoor',
      routePathWithId('custom_maps.indoor', mapId, (id) => `/maps/indoor/${id}`),
      { floorId: options.floorId, featureId: options.featureId }
    ),
};

/** A route param as a safe id; null for missing, leftovers or unsafe ids. */
export const readMapParam = (value: string | string[] | null | undefined): string | null => {
  const raw = (Array.isArray(value) ? value[0] : value)?.trim() ?? '';
  if (raw === '' || raw === 'undefined' || raw === 'null') return null;
  return isSafeRouteId(raw) ? raw : null;
};
