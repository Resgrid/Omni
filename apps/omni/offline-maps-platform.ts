// Web and Electron: offline map packs are out of scope (MapLibre plan §19.6 — the browser cache holds viewed tiles), so
// there is no pack manager and the native adapters never enter the web bundle. iOS/Android: offline-maps-platform.native.ts.
import type { OfflinePackManager, OfflinePackManagerOptions } from '@resgrid/maps';

/** What the shared wiring supplies; the platform file adds its file store, network probe and ambient cache. */
export type PlatformPackManagerInput = Omit<OfflinePackManagerOptions, 'fileStore' | 'network' | 'applyAmbientCacheSize' | 'platformSupported'>;

export function createPlatformOfflinePackManager(_input: PlatformPackManagerInput): OfflinePackManager | null {
  return null;
}
