// iOS/Android: the offline pack manager with the native adapters (expo-file-system pack store and background transfers,
// NetInfo Wi-Fi probe, MapLibre ambient cache). Metro picks this file for native builds only; the web build gets offline-maps-platform.ts.
import { createOfflinePackManager, defaultOfflineFetch, type OfflinePackManager } from '@resgrid/maps';
import { createExpoBackgroundTransfer, createExpoPackFileStore, createNetInfoNetworkProbe, setMaplibreAmbientCacheSize } from '@resgrid/maps/offline/native';

import type { PlatformPackManagerInput } from './offline-maps-platform';

export type { PlatformPackManagerInput } from './offline-maps-platform';

export function createPlatformOfflinePackManager(input: PlatformPackManagerInput): OfflinePackManager | null {
  const fileStore = createExpoPackFileStore();
  if (!fileStore) {
    return null;
  }
  // Background transfers: on iOS the packs keep downloading with the app suspended or the screen locked.
  const backgroundTransfer = createExpoBackgroundTransfer({ kv: input.kv ?? null, fetchImpl: input.fetchImpl ?? defaultOfflineFetch });
  return createOfflinePackManager({ ...input, fileStore, backgroundTransfer, network: createNetInfoNetworkProbe(), applyAmbientCacheSize: setMaplibreAmbientCacheSize });
}
