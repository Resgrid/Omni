// Route contract (omni-plan §5.3.4). Depends only on React and expo-router (plus a notifications type), so it can
// move to a lower layer (features need `useHref()`) without an API change.
export { CANONICAL_ROUTES, type CanonicalRoutes, isRouteAvailableFor, isRouteKey, ROUTE_KEYS, type RouteKey, type RouteParamNames, type RouteSpec } from './canonical';
export { defineRoutes, matchRoutePattern, type RouteContract } from './define-routes';
export { buildRoutePath, createHrefBuilders, getHrefBuilders, getRouteContract, type HrefBuilder, type HrefBuilders, type RouteParamValue, type RouteQuery, setRouteContract, useHref } from './href';
export { resolveNotificationRoute } from './notification-routes';
