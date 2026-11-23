// @resgrid/features/map — the department map shared by Responder, Unit, Dispatch and BigBoard (omni-plan §7.10 "Maps"):
// pins, live positions, department layers, facility (custom and indoor) maps, legend, pin details with actions,
// recenter/follow, `/map?callId=` focus.
//
// The map lock (Unit's sidebar "Lock map to unit"), the shared department layers and the facility maps are re-exported
// through one statement at the end: Oxlint's readable spacing wants a blank line between top-level statements, which the
// export sorter removes.
import { DepartmentLayers, DepartmentLayersOverlay, type DepartmentLayersOverlayProps, type DepartmentLayersProps } from './components/department-layers';
import { DispatchBoardLayers, type DispatchBoardLayersProps } from './components/dispatch-board-layers';
import { FacilityLocationPicker, type FacilityLocationPickerProps, type FacilityLocationPickerResult, type PickedFacilityLocation } from './components/facility-location-picker';
import { FacilityFeatureCard, type FacilityFeatureCardProps, facilityFeaturePlace, FacilityMapsOverlay, type FacilityMapsOverlayProps } from './components/facility-maps-overlay';
import { MapLayersControl, type MapLayersControlProps, MapOverlayControls, type MapOverlayControlsProps } from './components/map-layers-control';
import { type FacilityMapsState, type FacilitySelection, facilitySheetSection, type ResolvedFacilityMap, useFacilityFocus, useFacilityMapLayers, useFacilityMapListings, useFacilityMaps } from './hooks/use-facility-maps';
import { LEGACY_LOCATION_STORE_NAME, MAP_LOCK_STORE_NAME, type MapLockState, useMapLock, useMapLockStore } from './hooks/use-map-lock';
import { type MapOverlays, useMapOverlays } from './hooks/use-map-overlays';
import {
  type FacilityBounds,
  type FacilityFeature,
  facilityFeatureOf,
  facilityMapKey,
  type FacilityMapKind,
  type FacilityMapListing,
  facilityMapListings,
  type FacilityOverlayLayer,
  lockedViewBounds,
  parseFacilityMapKey,
} from './lib/facility-maps';

export { ActiveRouteOverlay, type ActiveRouteOverlayProps, activeRouteShapes } from './components/active-route-overlay';
export { MapHighlights, type MapHighlightsProps } from './components/map-highlights';
export { type MapPinAction, MapPinDetails, type MapPinDetailsProps, MapPinPanel, type MapPinPanelProps } from './components/map-pin-details';
export { type ActiveRouteOverlayData, useActiveRouteOverlay } from './hooks/use-active-route-overlay';
export { ACTIVE_LAYERS_REFRESH_MS, type DepartmentMapLayer, useDepartmentLayers } from './hooks/use-department-layers';
export { type LiveMapPins, MAP_REFRESH_EVENTS, useLiveMapPins } from './hooks/use-live-map-pins';
export { type MapViewState, useMapViewStore } from './hooks/use-map-view-store';
export { MAP_TRAFFIC_STORE_NAME, type MapTrafficPreferenceState, TRAFFIC_SURFACES, useMapTrafficPreferenceStore, useTrafficPreference } from './hooks/use-traffic-preference';
export { toFeatureCollection } from './lib/layer-geojson';
export * from './lib/map-camera';
export * from './lib/map-markers';
export { type FeatureNavEntry, mapNav } from './nav';
export { MAP_FOCUS_PARAMS, MAP_ROUTE_PATTERNS, mapRoutes } from './routes';
export { default as MapScreen, type MapScreenLinks, type MapScreenProps } from './screens/map-screen';

export {
  DepartmentLayers,
  DepartmentLayersOverlay,
  type DepartmentLayersOverlayProps,
  type DepartmentLayersProps,
  DispatchBoardLayers,
  type DispatchBoardLayersProps,
  type FacilityBounds,
  type FacilityFeature,
  FacilityFeatureCard,
  type FacilityFeatureCardProps,
  facilityFeatureOf,
  facilityFeaturePlace,
  FacilityLocationPicker,
  type FacilityLocationPickerProps,
  type FacilityLocationPickerResult,
  facilityMapKey,
  type FacilityMapKind,
  type FacilityMapListing,
  facilityMapListings,
  FacilityMapsOverlay,
  type FacilityMapsOverlayProps,
  type FacilityMapsState,
  type FacilityOverlayLayer,
  type FacilitySelection,
  facilitySheetSection,
  LEGACY_LOCATION_STORE_NAME,
  lockedViewBounds,
  MAP_LOCK_STORE_NAME,
  MapLayersControl,
  type MapLayersControlProps,
  type MapLockState,
  MapOverlayControls,
  type MapOverlayControlsProps,
  type MapOverlays,
  parseFacilityMapKey,
  type PickedFacilityLocation,
  type ResolvedFacilityMap,
  useFacilityFocus,
  useFacilityMapLayers,
  useFacilityMapListings,
  useFacilityMaps,
  useMapLock,
  useMapLockStore,
  useMapOverlays,
};
