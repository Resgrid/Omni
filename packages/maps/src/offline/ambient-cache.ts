import { OfflineManager } from '@maplibre/maplibre-react-native';

/**
 * Applies `AmbientCacheMaxBytes` to MapLibre Native's ambient tile cache (MapLibre plan §19.5): tiles viewed online
 * stay available offline up to this budget. The value is clamped by the caller (`normalizeAmbientCacheBytes`).
 */
export const setMaplibreAmbientCacheSize = async (bytes: number): Promise<void> => {
  await OfflineManager.setMaximumAmbientCacheSize(bytes);
};
