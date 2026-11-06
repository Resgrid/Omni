import { isNumericRouteId, routePathWithId, routePathWithQuery } from '@resgrid/core/navigation/route-paths';
import { isSafeRouteId } from '@resgrid/core/utils/route-ids';

/**
 * Unit's routes stack (plan Appendix A, kept from the Unit app): list, plan view/start, active route, directions, POI,
 * stop, stop contact, plan history and a past instance. Ids pass `isSafeRouteId` before they build a path, so a value
 * from a push payload or deep link can never leave the routes tree; a refused id builds no path (null, reported).
 */
export const UNIT_ROUTES_ROUTE_PATTERNS = {
  list: '/routes',
  start: '/routes/start',
  active: '/routes/active',
  directions: '/routes/directions',
  poi: '/routes/poi/[id]',
  stop: '/routes/stop/[id]',
  stopContact: '/routes/stop/contact',
  history: '/routes/history/[planId]',
  instance: '/routes/history/instance/[id]',
} as const;

export const unitRoutesRoutes = {
  list: (): string => '/routes',
  /** Plan view with the Start button. */
  start: (planId: string): string | null => routePathWithId('unit_routes.start', planId, (id) => `/routes/start?planId=${id}`),
  /** The active route; the instance id is optional (the screen falls back to the unit's active instance). */
  active: (planId?: string | null, instanceId?: string | null): string | null => routePathWithQuery('unit_routes.active', '/routes/active', { planId, instanceId }),
  directions: (instanceId: string): string | null => routePathWithId('unit_routes.directions', instanceId, (id) => `/routes/directions?instanceId=${id}`),
  poi: (poiId: number): string | null => routePathWithId('unit_routes.poi', poiId, (id) => `/routes/poi/${id}`, isNumericRouteId),
  /** A stop of the active route, by its instance stop id. */
  stop: (routeInstanceStopId: string): string | null => routePathWithId('unit_routes.stop', routeInstanceStopId, (id) => `/routes/stop/${id}`),
  /** A stop's contact, by the PLAN stop id (`GetStopContact/{routeStopId}`; Unit passed the instance stop id from the stop screen). */
  stopContact: (routeStopId: string): string | null => routePathWithId('unit_routes.stop_contact', routeStopId, (id) => `/routes/stop/contact?stopId=${id}`),
  history: (planId: string): string | null => routePathWithId('unit_routes.history', planId, (id) => `/routes/history/${id}`),
  instance: (instanceId: string): string | null => routePathWithId('unit_routes.instance', instanceId, (id) => `/routes/history/instance/${id}`),
} as const;

/** A route param as a safe id: the first value, trimmed; null for missing, "undefined"/"null" leftovers or unsafe ids. */
export const readRouteParam = (value: string | string[] | null | undefined): string | null => {
  const raw = (Array.isArray(value) ? value[0] : value)?.trim() ?? '';
  if (raw === '' || raw === 'undefined' || raw === 'null') return null;
  return isSafeRouteId(raw) ? raw : null;
};
