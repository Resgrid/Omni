// @resgrid/features/custom-maps — the department's custom and indoor maps (Unit/IC `app/maps`, capability
// `maps.customIndoor`): the list, the search over zones and regions, a custom map with its layers and an indoor map with
// its floors. Georeferenced layers and floors draw on the department map (signed Mercator tiles or images, offline from
// the downloaded packs); layers and floors with no geographic bounds use the pixel-space viewer (MapLibre plan D21).
// Route files re-export the screens, e.g. `export { default } from '@resgrid/features/custom-maps/screens/custom-map';`.

export { FeatureDetailCard, type FeatureDetailCardProps } from './components/feature-detail-card';
export { CUSTOM_MAP_TYPE_KEYS, floorViewMode, layerViewMode, listedCustomMaps, mapBounds, searchResultRoute, sortByOrder, toPixelRegions, usableCenter, type ViewMode } from './lib/map-viewer';
export { customMapsNav } from './nav';
export { CUSTOM_MAPS_ROUTE_PATTERNS, customMapsRoutes, readMapParam } from './routes';
export { default as CustomMapScreen, usePixelLayerImage } from './screens/custom-map';
export { default as IndoorMapScreen } from './screens/indoor-map';
export { default as MapsHomeScreen } from './screens/maps-home';
export { MAP_SEARCH_DEBOUNCE_MS, default as MapsSearchScreen } from './screens/maps-search';
