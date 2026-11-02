// @resgrid/features/navigation — the in-app turn-by-turn screen (`/navigate`, MapLibre plan §9) over @resgrid/navigation:
// session start for a call, a route's remaining stops or a point, arrival actions (On Scene status, stop check-in with
// geofence auto check-in, next stop) and the "Open in…" fallback. Variants get it with `maps.navigationInApp`.
// Route file: `export { default } from '@resgrid/features/navigation/screens/navigation-screen';`.

export { CallArrivalPanel, findOnSceneStatus, GEOFENCE_CHECK_IN_SECONDS, GEOFENCE_STOPPED_SPEED_MPS, PointArrivalPanel, StopArrivalPanel } from './components/arrival-panels';
export { useInAppNavigationAvailable } from './hooks/use-in-app-navigation';
export { navigationNav } from './nav';
export { NAVIGATION_ROUTE_PATTERNS, type NavigationRequest, navigationRoutes, type PointNavigationRequest, readNavigationParams, requestPointNavigation, takePointNavigationRequest } from './routes';
export { default as NavigationScreen, type NavigationScreenProps } from './screens/navigation-screen';
