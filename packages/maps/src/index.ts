// @resgrid/maps (layer L3) — the MapLibre wrapper and the map components every app uses (MapLibre plan §8.1, omni-plan §9).
// MapLibre only: features import map components from here, never @maplibre/maplibre-react-native or maplibre-gl directly.
// Config, rights, terminology and services arrive through MapProvider / props — this package imports no stores.

// Wrapper (rnmapbox-shaped API; .native over @maplibre/maplibre-react-native, .web over maplibre-gl)
export * from './rg';
export { CONGESTION_COLORS, congestionSegments, RouteLine, type RouteLineProps } from './rg/route-layer';
export { TRAFFIC_COLORS, TrafficLayer, type TrafficLayerProps, trafficTilesFor, useTrafficRefreshStamp } from './rg/traffic-layer';

// Provider: style resolution (MapLibre fields → Mapbox fallback → raster → hidden), theme, services, overlay slots
export {
  type MapIconRegistry,
  type MapIconSource,
  type MapPacksProfile,
  MapProviderContext,
  type MapProviderContextValue,
  type MapsCapabilities,
  type MapStyleKind,
  type MapStyleState,
  NO_MAP_CAPABILITIES,
  useMapCapabilities,
  useMapCenter,
  useMapIcons,
  useMapProviderContext,
  useMapRouting,
  useMapServices,
  useMapStyle,
  useMapTheme,
  useMapTraffic,
} from './provider/context';
export { FALLBACK_MAP_CENTER, type MapCenter, resolveMapCenter } from './provider/map-center';
export { deriveMapStyleState, MapProvider, type MapProviderProps } from './provider/map-provider';
export { isPublicMapboxToken, type MapboxResourceKind, parseMapboxStyleUrl, rewriteMapboxUrl, transformMapboxStyle } from './provider/mapbox-compat';
export type { MapModalSlotProps, MapOverlaySlots, MapSheetSlotProps } from './provider/overlay-types';
export { MapModal, MapSheet } from './provider/overlays';
export {
  DEFAULT_TRAFFIC_REFRESH_SECONDS,
  type MapRoutingCapabilities,
  type MapTrafficConfig,
  type MapTrafficTileType,
  NO_MAP_ROUTING,
  NO_MAP_TRAFFIC,
  resolveMapRouting,
  resolveMapTraffic,
} from './provider/routing-traffic';
export { createMapServices, type MapCurrentPosition, type MapServices } from './provider/services';
export { clearMapStyleCache, type MapFetch } from './provider/style-loader';
export {
  buildRasterStyle,
  DEFAULT_MAPBOX_ATTRIBUTION,
  DEFAULT_RASTER_ATTRIBUTION,
  FALLBACK_MAPBOX_DAY_STYLE,
  FALLBACK_MAPBOX_NIGHT_STYLE,
  type MapConfigInput,
  type MapStyleSource,
  type RasterStyleSource,
  resolveMapStyleSource,
  resolveRasterSource,
} from './provider/style-resolution';
export { DARK_MAP_THEME, LIGHT_MAP_THEME, type MapThemeColors, resolveMapTheme } from './provider/theme';
export { isSafeMapUrl } from './provider/url-safety';
export {
  CONFIG_SIGNATURE_REFRESH_MARGIN_MS,
  createMapUrlSigner,
  isSignedMapUrl,
  mapConfigRefreshAt,
  type MapUrlSigner,
  type MapUrlSignerOptions,
  signatureExpiry,
  type SignedMapUrl,
  type SignMapResourceBatch,
  stripSignature,
} from './provider/url-signer';

// Components
export { CustomMapRasterLayer, type CustomMapRasterLayerProps, GeoJsonMapLayer, type GeoJsonMapLayerProps, IndoorMapFloorLayer, type IndoorMapFloorLayerProps } from './components/department-map-layers';
export { FullScreenLocationPicker, type FullScreenLocationPickerProps } from './components/full-screen-location-picker';
export { FullScreenMap, type FullScreenMapProps } from './components/full-screen-map';
export { LocationPicker, type LocationPickerProps, type PickedLocation, PickerPin, type PickerState, usePickerState } from './components/location-picker';
export { MapFocusBanner, type MapFocusBannerProps, MapOverlayLegend, type MapOverlayLegendItem } from './components/map-banners';
export {
  MapControlButton,
  type MapControlButtonProps,
  MapLayersButton,
  MapLayersSheet,
  type MapLayersSheetProps,
  type MapLayerToggleItem,
  MapLegendButton,
  MapRecenterButton,
  MapTrafficButton,
  type MapTrafficButtonProps,
} from './components/map-controls';
export { MapLegendSheet, type MapLegendSheetProps, type NormalizedLegend, normalizeMapLegend } from './components/map-legend-sheet';
export { MapPins, type MapPinsProps } from './components/map-pins';
export { OFFLINE_LAYERS_SECTION, offlineDepartmentLayerIds, OfflineDepartmentLayers, type OfflineDepartmentLayersProps, offlineLayersFilter } from './components/offline-department-layers';
export { PinDetailSheet, type PinDetailSheetProps } from './components/pin-detail-sheet';
export { PinMarker, PinMarkerIcon, type PinMarkerIconProps, type PinMarkerProps } from './components/pin-marker';
export { PixelImageMap, type PixelImageMapProps, useImageSize } from './components/pixel-image-map';
export { PoiFilterSheet, type PoiFilterSheetProps, PoiList, type PoiListProps } from './components/poi-list';
export { PoiMarkerIcon, PoiMarkers, type PoiMarkersProps } from './components/poi-markers';
export { StaticMap, type StaticMapProps } from './components/static-map';
export { DIRECTION_ARROW_DATA_URI, UnitLocationMarker, type UnitLocationMarkerProps } from './components/unit-location-marker';
export { isOfflineMapStale, offlineBadgeLabel, OfflineMapBadge, type OfflineMapBadgeProps } from './rg/offline-map-badge';

// Hooks and pure helpers
export { type FitOptions, type FollowPosition, useFitBounds, useFollowCamera } from './hooks/use-camera-helpers';
export { useLocalFileUrl } from './hooks/use-local-file-url';
export { useSignedMapUrl, useSignedMapUrls } from './hooks/use-signed-map-url';
export * from './lib/camera';
export * from './lib/custom-maps';
export { offlineCustomMapSourceId, offlineDepartmentSourceId, offlineFloorSourceId, styleHasGlyphs, styleHasSource, styleImageSourceUrl } from './lib/offline-style-sources';
export { buildPinCollection, bundledIconKey, getRemoteIconUrl, type PinCollection, type PinCollectionOptions, type PinFeatureProperties, type PinIcon, resolvePinIcon } from './lib/pin-features';
export * from './lib/pin-ids';
export { createPixelFrame, hasGeoBounds, parsePixelRing, PIXEL_EDITOR_EXTENT, type PixelFrame, type PixelRegion, pixelRegionsToFeatureCollection } from './lib/pixel-frame';
export * from './lib/poi';
export { fillStaticMapTemplate, type StaticMapRequest } from './lib/static-map';

// Offline seams (§19.5) and web/Electron PMTiles protocol
export * from './offline';
export { isPmtilesProtocolRegistered, type LocalPackReader, type PmtilesProtocolHandle, readLocalPackFile, registerPmtilesProtocol, setLocalPackReader } from './pmtiles/register-pmtiles';
export { configureMapRenderer } from './rg/renderer-setup';
export * from './types';
