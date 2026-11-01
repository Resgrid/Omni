import type {
  CancelRouteInput,
  CheckInInput,
  CheckOutInput,
  EndRouteInput,
  GeofenceCheckInInput,
  GetActiveRouteInstancesResult,
  GetRouteContactsResult,
  GetRouteDeviationsResult,
  GetRouteDirectionsResult,
  GetRouteInstanceResult,
  GetRouteInstancesResult,
  GetRoutePlanResult,
  GetRoutePlansResult,
  GetRouteProgressResult,
  GetRouteStopsWithDetailsResult,
  GetScheduledRoutesResult,
  GetStopContactResult,
  PauseRouteInput,
  ResumeRouteInput,
  SaveRoutePlanResult,
  SkipStopInput,
  StartRouteInput,
  UpdateStopNotesInput,
} from '@resgrid/models';

import { type ApiContext, cachedRequest, type CachedRequestOptions, defineEndpoints, request, type RequestOptions } from '../../core';

/** Core v4 endpoints for routes (Routes). The contract test checks every entry against Swagger. */
export const routesEndpoints = defineEndpoints('routes', {
  acknowledgeDeviation: { method: 'POST', path: '/Routes/AcknowledgeDeviation/{id}' },
  cancelRoute: { method: 'POST', path: '/Routes/CancelRoute', body: 'json' },
  checkInAtStop: { method: 'POST', path: '/Routes/CheckInAtStop', body: 'json' },
  checkOutFromStop: { method: 'POST', path: '/Routes/CheckOutFromStop', body: 'json' },
  endRoute: { method: 'POST', path: '/Routes/EndRoute', body: 'json' },
  geofenceCheckIn: { method: 'POST', path: '/Routes/GeofenceCheckIn', body: 'json' },
  getActiveRouteForUnit: { method: 'GET', path: '/Routes/GetActiveRouteForUnit/{unitId}' },
  getActiveRouteInstances: { method: 'GET', path: '/Routes/GetActiveRouteInstances' },
  getActiveRoutes: { method: 'GET', path: '/Routes/GetActiveRoutes' },
  getDirections: { method: 'GET', path: '/Routes/GetDirections/{routePlanId}' },
  getInstanceDirections: { method: 'GET', path: '/Routes/GetInstanceDirections/{instanceId}', query: ['latitude', 'longitude'] },
  getRouteContacts: { method: 'GET', path: '/Routes/GetRouteContacts/{routePlanId}' },
  getRouteHistory: { method: 'GET', path: '/Routes/GetRouteHistory/{routePlanId}' },
  getRoutePlan: { method: 'GET', path: '/Routes/GetRoutePlan/{id}' },
  getRoutePlans: { method: 'GET', path: '/Routes/GetRoutePlans', cacheTtlMs: 60 * 1000 },
  getRoutePlansForUnit: { method: 'GET', path: '/Routes/GetRoutePlansForUnit/{unitId}' },
  getRouteProgress: { method: 'GET', path: '/Routes/GetRouteProgress/{instanceId}' },
  getScheduledRoutes: { method: 'GET', path: '/Routes/GetScheduledRoutes' },
  getStopContact: { method: 'GET', path: '/Routes/GetStopContact/{routeStopId}' },
  getStopsForInstance: { method: 'GET', path: '/Routes/GetStopsForInstance/{instanceId}' },
  getUnacknowledgedDeviations: { method: 'GET', path: '/Routes/GetUnacknowledgedDeviations' },
  pauseRoute: { method: 'POST', path: '/Routes/PauseRoute', body: 'json' },
  resumeRoute: { method: 'POST', path: '/Routes/ResumeRoute', body: 'json' },
  skipStop: { method: 'POST', path: '/Routes/SkipStop', body: 'json' },
  startRoute: { method: 'POST', path: '/Routes/StartRoute', body: 'json' },
  updateStopNotes: { method: 'POST', path: '/Routes/UpdateStopNotes', body: 'json' },
});

const E = routesEndpoints;

/** Acknowledge a deviation. `POST /Routes/AcknowledgeDeviation/{id}` — legacy: U. */
export const acknowledgeDeviation = (ctx: ApiContext, params: { id: string }, options?: RequestOptions): Promise<SaveRoutePlanResult> => request<SaveRoutePlanResult>(ctx, E.acknowledgeDeviation, { params }, options);

/** Cancels a route instance. `POST /Routes/CancelRoute` — legacy: U. */
export const cancelRoute = (ctx: ApiContext, body: CancelRouteInput, options?: RequestOptions): Promise<GetRouteInstanceResult> => request<GetRouteInstanceResult>(ctx, E.cancelRoute, { body }, options);

/** Check in at a stop. `POST /Routes/CheckInAtStop` — legacy: U. */
export const checkInAtStop = (ctx: ApiContext, body: CheckInInput, options?: RequestOptions): Promise<SaveRoutePlanResult> => request<SaveRoutePlanResult>(ctx, E.checkInAtStop, { body }, options);

/** Check out from a stop. `POST /Routes/CheckOutFromStop` — legacy: U. */
export const checkOutFromStop = (ctx: ApiContext, body: CheckOutInput, options?: RequestOptions): Promise<SaveRoutePlanResult> => request<SaveRoutePlanResult>(ctx, E.checkOutFromStop, { body }, options);

/** Ends a route instance. `POST /Routes/EndRoute` — legacy: U. */
export const endRoute = (ctx: ApiContext, body: EndRouteInput, options?: RequestOptions): Promise<GetRouteInstanceResult> => request<GetRouteInstanceResult>(ctx, E.endRoute, { body }, options);

/** Auto check-in from geofence proximity. `POST /Routes/GeofenceCheckIn` — legacy: U. */
export const geofenceCheckIn = (ctx: ApiContext, body: GeofenceCheckInInput, options?: RequestOptions): Promise<SaveRoutePlanResult> => request<SaveRoutePlanResult>(ctx, E.geofenceCheckIn, { body }, options);

/** Gets the active route instance for a unit. `GET /Routes/GetActiveRouteForUnit/{unitId}` — legacy: U. */
export const getActiveRouteForUnit = (ctx: ApiContext, params: { unitId: number | string }, options?: RequestOptions): Promise<GetRouteProgressResult> =>
  request<GetRouteProgressResult>(ctx, E.getActiveRouteForUnit, { params }, options);

/** Gets all active route instances across the department with progress details. `GET /Routes/GetActiveRouteInstances` — legacy: U. */
export const getActiveRouteInstances = (ctx: ApiContext, options?: RequestOptions): Promise<GetActiveRouteInstancesResult> => request<GetActiveRouteInstancesResult>(ctx, E.getActiveRouteInstances, {}, options);

/** Gets all active route instances for the department. `GET /Routes/GetActiveRoutes` — legacy: U. */
export const getActiveRoutes = (ctx: ApiContext, options?: RequestOptions): Promise<GetRouteInstancesResult> => request<GetRouteInstancesResult>(ctx, E.getActiveRoutes, {}, options);

/** Gets the stored route geometry and waypoints for a route plan. `GET /Routes/GetDirections/{routePlanId}` — legacy: U. */
export const getDirections = (ctx: ApiContext, params: { routePlanId: string }, options?: RequestOptions): Promise<GetRouteDirectionsResult> =>
  request<GetRouteDirectionsResult>(ctx, E.getDirections, { params }, options);

/** Gets the route geometry and remaining waypoints for an active route instance. Pass the unit's current latitude and longitude as query parameters to route from the current position rather than the first remaining stop. `GET /Routes/GetInstanceDirections/{instanceId}` — legacy: U. */
export const getInstanceDirections = (ctx: ApiContext, params: { instanceId: string; latitude?: number | string; longitude?: number | string }, options?: RequestOptions): Promise<GetRouteDirectionsResult> =>
  request<GetRouteDirectionsResult>(ctx, E.getInstanceDirections, { params }, options);

/** Gets all unique contacts attached to stops on a route plan. `GET /Routes/GetRouteContacts/{routePlanId}` — legacy: U. */
export const getRouteContacts = (ctx: ApiContext, params: { routePlanId: string }, options?: RequestOptions): Promise<GetRouteContactsResult> =>
  request<GetRouteContactsResult>(ctx, E.getRouteContacts, { params }, options);

/** Gets route instance history for a plan. `GET /Routes/GetRouteHistory/{routePlanId}` — legacy: U. */
export const getRouteHistory = (ctx: ApiContext, params: { routePlanId: string }, options?: RequestOptions): Promise<GetRouteInstancesResult> =>
  request<GetRouteInstancesResult>(ctx, E.getRouteHistory, { params }, options);

/** Gets a single route plan with stops and schedules. `GET /Routes/GetRoutePlan/{id}` — legacy: U. */
export const getRoutePlan = (ctx: ApiContext, params: { id: string }, options?: RequestOptions): Promise<GetRoutePlanResult> => request<GetRoutePlanResult>(ctx, E.getRoutePlan, { params }, options);

/** Gets all route plans for the department. `GET /Routes/GetRoutePlans` (cached) — legacy: U. */
export const getRoutePlans = (ctx: ApiContext, options?: CachedRequestOptions): Promise<GetRoutePlansResult> => cachedRequest<GetRoutePlansResult>(ctx, E.getRoutePlans, {}, options);

/** Gets route plans for a specific unit. `GET /Routes/GetRoutePlansForUnit/{unitId}` — legacy: U. */
export const getRoutePlansForUnit = (ctx: ApiContext, params: { unitId: number | string }, options?: RequestOptions): Promise<GetRoutePlansResult> =>
  request<GetRoutePlansResult>(ctx, E.getRoutePlansForUnit, { params }, options);

/** Gets progress for a route instance. `GET /Routes/GetRouteProgress/{instanceId}` — legacy: U. */
export const getRouteProgress = (ctx: ApiContext, params: { instanceId: string }, options?: RequestOptions): Promise<GetRouteProgressResult> =>
  request<GetRouteProgressResult>(ctx, E.getRouteProgress, { params }, options);

/** Gets all active schedules for the department's route plans. `GET /Routes/GetScheduledRoutes` — legacy: U. */
export const getScheduledRoutes = (ctx: ApiContext, options?: RequestOptions): Promise<GetScheduledRoutesResult> => request<GetScheduledRoutesResult>(ctx, E.getScheduledRoutes, {}, options);

/** Gets the full contact record for a route stop's assigned contact. `GET /Routes/GetStopContact/{routeStopId}` — legacy: U. */
export const getStopContact = (ctx: ApiContext, params: { routeStopId: string }, options?: RequestOptions): Promise<GetStopContactResult> => request<GetStopContactResult>(ctx, E.getStopContact, { params }, options);

/** Gets all stops for an active route instance, merging plan data with execution state. `GET /Routes/GetStopsForInstance/{instanceId}` — legacy: U. */
export const getStopsForInstance = (ctx: ApiContext, params: { instanceId: string }, options?: RequestOptions): Promise<GetRouteStopsWithDetailsResult> =>
  request<GetRouteStopsWithDetailsResult>(ctx, E.getStopsForInstance, { params }, options);

/** Gets unacknowledged deviations for the department. `GET /Routes/GetUnacknowledgedDeviations` — legacy: U. */
export const getUnacknowledgedDeviations = (ctx: ApiContext, options?: RequestOptions): Promise<GetRouteDeviationsResult> => request<GetRouteDeviationsResult>(ctx, E.getUnacknowledgedDeviations, {}, options);

/** Pauses a route instance. `POST /Routes/PauseRoute` — legacy: U. */
export const pauseRoute = (ctx: ApiContext, body: PauseRouteInput, options?: RequestOptions): Promise<GetRouteInstanceResult> => request<GetRouteInstanceResult>(ctx, E.pauseRoute, { body }, options);

/** Resumes a paused route instance. `POST /Routes/ResumeRoute` — legacy: U. */
export const resumeRoute = (ctx: ApiContext, body: ResumeRouteInput, options?: RequestOptions): Promise<GetRouteInstanceResult> => request<GetRouteInstanceResult>(ctx, E.resumeRoute, { body }, options);

/** Skip a stop with reason. `POST /Routes/SkipStop` — legacy: U. */
export const skipStop = (ctx: ApiContext, body: SkipStopInput, options?: RequestOptions): Promise<SaveRoutePlanResult> => request<SaveRoutePlanResult>(ctx, E.skipStop, { body }, options);

/** Starts a route instance. `POST /Routes/StartRoute` — legacy: U. */
export const startRoute = (ctx: ApiContext, body: StartRouteInput, options?: RequestOptions): Promise<GetRouteInstanceResult> => request<GetRouteInstanceResult>(ctx, E.startRoute, { body }, options);

/** Updates notes on an active route instance stop. `POST /Routes/UpdateStopNotes` — legacy: U. */
export const updateStopNotes = (ctx: ApiContext, body: UpdateStopNotesInput, options?: RequestOptions): Promise<SaveRoutePlanResult> => request<SaveRoutePlanResult>(ctx, E.updateStopNotes, { body }, options);
