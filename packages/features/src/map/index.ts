// @resgrid/features/map — the department map shared by Responder, Unit, Dispatch and BigBoard (omni-plan §7.10 "Maps"):
// pins, live positions, department layers, legend, pin details with actions, recenter/follow, `/map?callId=` focus.
//
// The map lock (Unit's sidebar "Lock map to unit") is re-exported through one statement at the end: Oxlint's readable
// spacing wants a blank line between top-level statements, which the export sorter removes.
import { LEGACY_LOCATION_STORE_NAME, MAP_LOCK_STORE_NAME, type MapLockState, useMapLock, useMapLockStore } from './hooks/use-map-lock';

export { ActiveRouteOverlay, type ActiveRouteOverlayProps, activeRouteShapes } from './components/active-route-overlay';
export { MapHighlights, type MapHighlightsProps } from './components/map-highlights';
export { type MapPinAction, MapPinDetails, type MapPinDetailsProps, MapPinPanel, type MapPinPanelProps } from './components/map-pin-details';
export { type ActiveRouteOverlayData, useActiveRouteOverlay } from './hooks/use-active-route-overlay';
export { type DepartmentMapLayer, useDepartmentLayers } from './hooks/use-department-layers';
export { type LiveMapPins, MAP_REFRESH_EVENTS, useLiveMapPins } from './hooks/use-live-map-pins';
export { type MapViewState, useMapViewStore } from './hooks/use-map-view-store';
export { MAP_TRAFFIC_STORE_NAME, type MapTrafficPreferenceState, TRAFFIC_SURFACES, useMapTrafficPreferenceStore, useTrafficPreference } from './hooks/use-traffic-preference';
export { toFeatureCollection } from './lib/layer-geojson';
export * from './lib/map-camera';
export * from './lib/map-markers';
export { type FeatureNavEntry, mapNav } from './nav';
export { MAP_FOCUS_PARAMS, MAP_ROUTE_PATTERNS, mapRoutes } from './routes';
export { default as MapScreen, type MapScreenLinks, type MapScreenProps } from './screens/map-screen';

export { LEGACY_LOCATION_STORE_NAME, MAP_LOCK_STORE_NAME, type MapLockState, useMapLock, useMapLockStore };
