import { isSafeRouteId } from '@resgrid/core/utils/route-ids';

/**
 * Unit's routes stack (plan Appendix A, kept from the Unit app): list, plan view/start, active route, directions, POI,
 * stop, stop contact, plan history and a past instance. Ids pass `isSafeRouteId` before they build a path, so a value
 * from a push payload or deep link can never leave the routes tree.
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

const encodeId = (id: string): string => {
  if (!isSafeRouteId(id)) throw new Error('Unsafe route id');
  return encodeURIComponent(id);
};

export const unitRoutesRoutes = {
  list: (): string => '/routes',
  /** Plan view with the Start button. */
  start: (planId: string): string => `/routes/start?planId=${encodeId(planId)}`,
  /** The active route; the instance id is optional (the screen falls back to the unit's active instance). */
  active: (planId?: string | null, instanceId?: string | null): string => {
    const query = [planId ? `planId=${encodeId(planId)}` : null, instanceId ? `instanceId=${encodeId(instanceId)}` : null].filter((part): part is string => part !== null);
    return query.length > 0 ? `/routes/active?${query.join('&')}` : '/routes/active';
  },
  directions: (instanceId: string): string => `/routes/directions?instanceId=${encodeId(instanceId)}`,
  poi: (poiId: number): string => {
    if (!Number.isInteger(poiId) || poiId <= 0) throw new Error('Unsafe POI route id');
    return `/routes/poi/${poiId}`;
  },
  /** A stop of the active route, by its instance stop id. */
  stop: (routeInstanceStopId: string): string => `/routes/stop/${encodeId(routeInstanceStopId)}`,
  /** A stop's contact, by the PLAN stop id (`GetStopContact/{routeStopId}`; Unit passed the instance stop id from the stop screen). */
  stopContact: (routeStopId: string): string => `/routes/stop/contact?stopId=${encodeId(routeStopId)}`,
  history: (planId: string): string => `/routes/history/${encodeId(planId)}`,
  instance: (instanceId: string): string => `/routes/history/instance/${encodeId(instanceId)}`,
} as const;

/** A route param as a safe id: the first value, trimmed; null for missing, "undefined"/"null" leftovers or unsafe ids. */
export const readRouteParam = (value: string | string[] | null | undefined): string | null => {
  const raw = (Array.isArray(value) ? value[0] : value)?.trim() ?? '';
  if (raw === '' || raw === 'undefined' || raw === 'null') return null;
  return isSafeRouteId(raw) ? raw : null;
};
