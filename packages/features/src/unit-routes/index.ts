// @resgrid/features/unit-routes — Unit's routes stack (omni-plan §7.11): plans, start, active route with stop
// check-in/out/skip (offline through the outbox), server directions, POIs, stops, stop contacts and history.
// Route files re-export the screens, e.g. `export { default } from '@resgrid/features/unit-routes/screens/route-active';`.
// Maps: wrap the Unit layout in <UnitRoutesMapProvider renderMap={…MapLibre via @resgrid/maps…}> (or pass `renderMap`).

// Screens (9)
export { ACTIVE_ROUTE_POLL_MS, default as RouteActiveScreen, type RouteActiveScreenProps } from './screens/route-active';
export { default as RouteDirectionsScreen, type RouteDirectionsScreenProps } from './screens/route-directions';
export { default as RouteHistoryScreen, type RouteHistoryScreenProps } from './screens/route-history';
export { default as RouteInstanceScreen, type RouteInstanceScreenProps } from './screens/route-instance';
export { isPoiDestination, default as RoutePoiScreen, type RoutePoiScreenProps } from './screens/route-poi';
export { default as RouteStartScreen, type RouteStartScreenProps } from './screens/route-start';
export { default as RouteStopScreen, type RouteStopScreenProps } from './screens/route-stop';
export { default as RouteStopContactScreen, type RouteStopContactScreenProps, stopContactName } from './screens/route-stop-contact';
export { default as RoutesHomeScreen, type RoutesHomeScreenProps } from './screens/routes-home';

// Components
export { DeviationBanner, type DeviationBannerProps } from './components/deviation-banner';
export { RouteCard, type RouteCardProps } from './components/route-card';
export { ACTIVE_ROUTE_PLAN_STATUS, RoutePlansList } from './components/route-plans-list';
export { type RouteStat, RouteStats } from './components/route-stats';
export { SkipStopDialog, type SkipStopDialogProps } from './components/skip-stop-dialog';
export { StopCard, type StopCardProps } from './components/stop-card';

// Map slot
export { type RenderRouteMap, type RouteMapKind, RouteMapSlot, type RouteMapSlotProps, type RouteMapStop, UnitRoutesMapProvider, useRouteMapRenderer } from './map-slot';

// Hooks and helpers
export { type StopActions, useStopActions } from './hooks/use-stop-actions';
export { formatArrivalTime, formatDistance, formatDuration, formatRouteTime } from './lib/route-format';
export { boundsOf, geofenceRing, geometryPositions, isMappable, type LngLat, parseRouteGeometry, type RouteBounds, type RouteGeometry, type RouteLineString, type RouteMultiLineString } from './lib/route-geo';
export { DEFAULT_GEOFENCE_RADIUS_M, DEFAULT_ROUTE_COLOR, instanceMapStops, mapBounds, planMapStops, routeColor, stopGeofence, waypointMapStops } from './lib/route-map';
export {
  canStartPlan,
  currentStop,
  deviationTypeKey,
  INSTANCE_STATUS_LOOK,
  instanceDeviations,
  instanceStatusLook,
  isStopDone,
  progressPercent,
  sortStops,
  type StatusLook,
  STOP_PRIORITY_LOOK,
  STOP_STATUS_LOOK,
  STOP_TYPE_KEYS,
  type StopActionKind,
  stopActions,
  stopStatusLook,
} from './lib/route-status';

// Routes and nav
export { type FeatureNavEntry, unitRoutesNav } from './nav';
export { readRouteParam, UNIT_ROUTES_ROUTE_PATTERNS, unitRoutesRoutes } from './routes';
