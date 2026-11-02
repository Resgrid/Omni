// @resgrid/navigation (layer L6) — in-app turn-by-turn navigation (MapLibre plan §9): the route engine (pure TS), the
// session store, voice prompts and the navigation screen body over @resgrid/maps. Routes come only from the Resgrid
// server (Routing/GetCallRoute, Routing/GetRoute, live Routes/GetInstanceDirections); no provider is called from the app.
// Variant-agnostic: a variant gets it through the `maps.navigationInApp` capability (Unit today).

// Engine
export * from './engine';

// Session
export { configureNavigation, type ConfigureNavigationOptions, NAVIGATION_SAFETY_NOTICE_KEY, NAVIGATION_VOICE_MUTED_KEY } from './configure';
export {
  type NavigationDestination,
  type NavigationErrorCode,
  type NavigationLegStop,
  type NavigationRouteMeta,
  type NavigationState,
  type NavigationStatus,
  remainingToLeg,
  resetNavigationStoreForTests,
  useNavigationStore,
} from './store/navigation-store';
export { FINAL_REPORT_TTL_MS, isReportStale, NAVIGATION_PROGRESS_EVENT, navigationProgressCoalesceKey, navigationProgressHandler, PROGRESS_REPORT_TTL_MS, submitNavigationProgress } from './store/progress-reports';
export { createServerRouteSource, fromDirectionsResult, fromRouteResult, type ServerRouteSourceOptions } from './store/route-sources';
export {
  getNavigationServices,
  type NavigationPreferences,
  type NavigationProgressReport,
  type NavigationRouteResult,
  type NavigationRouteSource,
  type NavigationServices,
  type NavigationVoice,
  resetNavigationServicesForTests,
  setNavigationServices,
} from './store/services';

// Components
export { ManeuverBanner, type ManeuverBannerProps } from './components/maneuver-banner';
export { ManeuverIcon, type ManeuverIconProps } from './components/maneuver-icon';
export { cameraBearing, followZoomForSpeed, type NavigationCameraMode, NavigationMap, type NavigationMapProps } from './components/navigation-map';
export { NavigationSessionView, type NavigationSessionViewProps } from './components/navigation-session-view';
export { TripBar, type TripBarProps } from './components/trip-bar';
export { useDistanceText } from './components/use-distance-text';
export { useNavigationFixes } from './components/use-navigation-fixes';
