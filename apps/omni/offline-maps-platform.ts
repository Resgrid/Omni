// Web and Electron (MapLibre plan §19.6): offline map packs in the Origin Private File System — on disk in the app profile
// in Electron (its `app://` origin is a privileged secure scheme), best effort in a browser (persistent storage is
// requested; the browser may still evict). maplibre-gl reads them through the `pmtiles`/`opfs` protocols. The registry is
// its own memory DB kept in OPFS beside the packs, so packs stay known across reloads while the web offline DB is not
// durable yet (plan §8.2 S7). Without OPFS there is no pack manager. iOS/Android: offline-maps-platform.native.ts.
import { createBrowserNetworkProbe, createOfflinePackManager, createOpfsPackFileStore, createOpfsRegistryPersistence, type OfflinePackManager, type OfflinePackManagerOptions, setLocalPackReader } from '@resgrid/maps';
import { createMemoryDb } from '@resgrid/offline';

/** What the shared wiring supplies; the platform file adds its file store, network probe and ambient cache. */
export type PlatformPackManagerInput = Omit<OfflinePackManagerOptions, 'fileStore' | 'network' | 'applyAmbientCacheSize' | 'platformSupported'>;

/** Asks the browser not to evict the packs under storage pressure (granted silently in Electron and installed PWAs). */
async function requestPersistentStorage(): Promise<void> {
  try {
    const storage = typeof navigator !== 'undefined' ? navigator.storage : undefined;
    if (storage && typeof storage.persist === 'function' && !(await storage.persisted())) await storage.persist();
  } catch {
    // Best effort: without it the packs are only as durable as the browser keeps them.
  }
}

export async function createPlatformOfflinePackManager(input: PlatformPackManagerInput): Promise<OfflinePackManager | null> {
  const fileStore = createOpfsPackFileStore();
  const persistence = createOpfsRegistryPersistence();
  if (!fileStore || !persistence) {
    return null;
  }
  const db = await createMemoryDb({ persistence });
  void requestPersistentStorage();
  setLocalPackReader(fileStore);
  return createOfflinePackManager({ ...input, db, fileStore, network: createBrowserNetworkProbe() });
}
