import type { GetActiveNavigationsResult, GetRouteInput, GetRouteResult, ReportNavigationProgressInput, ReportNavigationProgressResult, RoutingCapabilitiesResult } from '@resgrid/models';

import { type ApiContext, defineEndpoints, request, type RequestOptions } from '../../core';

/**
 * Core v4 endpoints for routing (Routing, MapLibre plan §6.3 and §9.4). Routes and drive times come from the install's
 * provider through the server; no provider key reaches the app. The contract test checks every entry against Swagger.
 */
export const routingEndpoints = defineEndpoints('routing', {
  getActiveNavigations: { method: 'GET', path: '/Routing/GetActiveNavigations', query: ['callId', 'unitId'] },
  getCallRoute: { method: 'GET', path: '/Routing/GetCallRoute', query: ['callId', 'latitude', 'longitude', 'heading', 'unitId', 'navigation', 'language', 'metric'] },
  getRoute: { method: 'POST', path: '/Routing/GetRoute', body: 'json' },
  getRoutingCapabilities: { method: 'GET', path: '/Routing/GetCapabilities' },
  reportNavigationProgress: { method: 'POST', path: '/Routing/ReportNavigationProgress', body: 'json' },
});

const E = routingEndpoints;

/** Units navigating now with their live ETAs (filtered to what the caller may see). `GET /Routing/GetActiveNavigations` — new in Omni. */
export const getActiveNavigations = (ctx: ApiContext, params: { callId?: number | string; unitId?: number | string } = {}, options?: RequestOptions): Promise<GetActiveNavigationsResult> =>
  request<GetActiveNavigationsResult>(ctx, E.getActiveNavigations, { params }, options);

/**
 * Route from a position to a call (navigation start and reroute); the unit's vehicle limits apply when `unitId` is sent.
 * `GET /Routing/GetCallRoute` — new in Omni.
 */
export const getCallRoute = (
  ctx: ApiContext,
  params: { callId: number | string; latitude: number; longitude: number; heading?: number; unitId?: number | string; navigation?: boolean; language?: string; metric?: boolean },
  options?: RequestOptions
): Promise<GetRouteResult> => request<GetRouteResult>(ctx, E.getCallRoute, { params }, options);

/** What the install's routing provider supports. `GET /Routing/GetCapabilities` — new in Omni. */
export const getRoutingCapabilities = (ctx: ApiContext, options?: RequestOptions): Promise<RoutingCapabilitiesResult> => request<RoutingCapabilitiesResult>(ctx, E.getRoutingCapabilities, {}, options);

/** A route through two or more points. `POST /Routing/GetRoute` — new in Omni. */
export const getRoute = (ctx: ApiContext, body: GetRouteInput, options?: RequestOptions): Promise<GetRouteResult> => request<GetRouteResult>(ctx, E.getRoute, { body }, options);

/** A navigating unit's progress (start, reroute, arrival, end, and at most every 15 s). `POST /Routing/ReportNavigationProgress` — new in Omni. */
export const reportNavigationProgress = (ctx: ApiContext, body: ReportNavigationProgressInput, options?: RequestOptions): Promise<ReportNavigationProgressResult> =>
  request<ReportNavigationProgressResult>(ctx, E.reportNavigationProgress, { body }, options);
