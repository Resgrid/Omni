import type { StorageArea } from './retention';

/**
 * Storage outside the offline database that the Storage & sync screen reports and clears: attachment
 * staging files, offline map packs (MapLibre plan §19), persisted working-set stores.
 */
export interface ExternalStorageArea {
  id: string;
  area: StorageArea;
  getSizeBytes?(): Promise<number>;
  clear?(): Promise<void>;
  /**
   * Also cleared by "Clear cached data" (map packs, cached stores). Leave false for anything that
   * can hold unsent work, such as attachment staging.
   */
  clearWithCachedData?: boolean;
}

export interface StorageAreaRegistry {
  register(area: ExternalStorageArea): () => void;
  list(): ExternalStorageArea[];
  clear(): void;
}

export function createStorageAreaRegistry(): StorageAreaRegistry {
  const areas = new Map<string, ExternalStorageArea>();
  return {
    register(area) {
      areas.set(area.id, area);
      return () => {
        if (areas.get(area.id) === area) areas.delete(area.id);
      };
    },
    list: () => Array.from(areas.values()),
    clear: () => areas.clear(),
  };
}

export const defaultStorageAreaRegistry = createStorageAreaRegistry();

export const registerStorageArea = (area: ExternalStorageArea): (() => void) => defaultStorageAreaRegistry.register(area);
