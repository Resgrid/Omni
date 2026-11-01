// @resgrid/features/offline-maps — Settings → Offline maps (MapLibre plan §19.8). App shell: build the pack manager with
// `createOfflinePackManager` (@resgrid/maps) and the native adapters (@resgrid/maps/offline/native), then
// `configureOfflineMaps({ controller })` and `registerOfflineMapsSettings()`. Variants re-export `OfflineMapsScreen` at
// `/settings/offline-maps`.

// Screens
export { OfflineMapsScreen } from './screens/offline-maps-screen';

// Composition
export { configureOfflineMaps, getOfflineMapsController, type OfflineMapsRuntime, resetOfflineMapsRuntimeForTests, subscribeOfflineMapsRuntime } from './runtime';
export { OFFLINE_MAPS_SETTINGS_SECTION_ID, OfflineMapsSettingsRow, registerOfflineMapsSettings } from './settings-section';

// Hooks and helpers
export { isOfflineMapsVisible, useOfflineMapsController, useOfflineMapsState } from './hooks/use-offline-maps';
export { buildContentRows, type ContentRow, errorKey, formatBytes, packStateKey, statusKey } from './lib/present';

// Registry entries
export { type FeatureNavEntry, offlineMapsNav } from './nav';
export { OFFLINE_MAPS_ROUTE_PATTERNS, type OfflineMapsRouteName, offlineMapsRoutes } from './routes';
