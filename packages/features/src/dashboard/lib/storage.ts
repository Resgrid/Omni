import { getDataStorageKv, registerPersistedStore } from '@resgrid/data';
import { createGuardedStateStorage, type DurableKv } from '@resgrid/offline';
import type { StateStorage } from 'zustand/middleware';

/**
 * Where the dashboard keeps its device configuration (layout and widget settings).
 *
 * BigBoard wrote `dashboard-widgets` and `widget-settings` to react-native-mmkv's default instance (`mmkv.default`, no
 * key — declared in the BigBoard manifest's `storage.extraInstances`); on web/Electron that is the same un-prefixed
 * localStorage the main instance uses. The app shell should bind that instance with
 * `setDashboardStorage(runtime.storage.get('mmkv.default'))` so an upgraded board keeps its layout. Until something is
 * bound, the variant's main instance (`@resgrid/data`'s storage) is used. Both store names are in BigBoard's
 * `VARIANT_PRESERVED_KEYS`, so they survive logout: they describe the screen, not the user.
 */

let bound: DurableKv | null | undefined;

interface RehydratableStore {
  persist: { rehydrate: () => Promise<void> | void };
}

const stores = new Map<string, RehydratableStore>();

/** The KV the dashboard stores read and write right now (null before storage is open). */
export const getDashboardKv = (): DurableKv | null => (bound !== undefined ? bound : getDataStorageKv());

const guarded = (): StateStorage | null => {
  const kv = getDashboardKv();
  return kv ? createGuardedStateStorage(kv) : null;
};

/** zustand storage over the late-bound dashboard KV: no-ops until storage is open. */
export const dashboardStateStorage: StateStorage = {
  getItem: (name) => guarded()?.getItem(name) ?? null,
  setItem: (name, value) => guarded()?.setItem(name, value),
  removeItem: (name) => guarded()?.removeItem(name),
};

/** Raw read of a key in the dashboard KV (legacy-store migration). */
export const readDashboardKey = (key: string): string | undefined => getDashboardKv()?.getString(key);

const rehydrate = (store: RehydratableStore): void => {
  void Promise.resolve(store.persist.rehydrate()).catch(() => undefined);
};

/** Registers a dashboard store so it rehydrates when storage opens (data storage) or is re-bound here. */
export function registerDashboardStore(name: string, store: RehydratableStore): void {
  stores.set(name, store);
  registerPersistedStore(name, store);
}

/**
 * Binds the KV the dashboard persists to (BigBoard: `mmkv.default`) and re-reads both stores from it. Pass undefined to
 * follow `@resgrid/data`'s storage again (tests).
 */
export function setDashboardStorage(kv: DurableKv | null | undefined): void {
  bound = kv;
  stores.forEach(rehydrate);
}
