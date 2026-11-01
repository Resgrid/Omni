import { defaultResetRegistry, defaultRetentionRegistry, defaultStorageAreaRegistry, type ResetRegistry, type RetentionRegistry, type StorageAreaRegistry } from '@resgrid/offline';

import { OFFLINE_MAPS_WIFI_ONLY_KEY, type OfflinePackManager } from './manager';
import { OFFLINE_MAP_PACKS_TABLE } from './registry';

export const OFFLINE_MAP_PACKS_AREA_ID = 'maps.offline-packs';

export interface OfflineMapPacksRegistries {
  reset?: ResetRegistry;
  retention?: RetentionRegistry;
  areas?: StorageAreaRegistry;
}

/**
 * Hooks the pack manager into `@resgrid/offline` (plan §8.2a, MapLibre §19.5 / D17). Call once from the app shell after
 * `initOffline()` and creating the manager; returns the disposer.
 * - retention: a declared rule for `offline_map_packs` (no age/row pruning — rows follow their files) plus the
 *   `maps.offline-packs` hook (other scopes, orphans, stale partials, department opt-out, LRU budget);
 * - wipe: the registry table is a wipe table and the manager's `wipe()` runs as a store reset (files + rows + summary)
 *   on logout, forced sign-out, department switch, server switch and "Clear all local data";
 * - Storage & sync: the `map-packs` area reports bytes on disk and is cleared by "Clear cached data";
 * - the Wi-Fi-only choice is a device preference kept across wipes.
 */
export function registerOfflineMapPacks(manager: OfflinePackManager, registries: OfflineMapPacksRegistries = {}): () => void {
  const reset = registries.reset ?? defaultResetRegistry;
  const retention = registries.retention ?? defaultRetentionRegistry;
  const areas = registries.areas ?? defaultStorageAreaRegistry;

  const disposers = [
    retention.register({ table: OFFLINE_MAP_PACKS_TABLE, area: 'map-packs', timeColumn: 'downloadedAt', keyColumn: 'id', prunableForBudget: false }),
    retention.registerHook({ id: OFFLINE_MAP_PACKS_AREA_ID, apply: () => manager.applyRetention() }),
    reset.registerWipeTable(OFFLINE_MAP_PACKS_TABLE),
    reset.registerStoreReset(OFFLINE_MAP_PACKS_AREA_ID, () => manager.wipe()),
    areas.register({ id: OFFLINE_MAP_PACKS_AREA_ID, area: 'map-packs', getSizeBytes: () => manager.getStorageBytes(), clear: () => manager.clearAll(), clearWithCachedData: true }),
  ];
  reset.registerPreservedKeys([OFFLINE_MAPS_WIFI_ONLY_KEY]);
  return () => disposers.forEach((dispose) => dispose());
}
