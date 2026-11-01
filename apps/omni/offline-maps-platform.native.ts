// iOS/Android: the offline pack manager with the native adapters (expo-file-system pack store, NetInfo Wi-Fi probe,
// MapLibre ambient cache). Metro picks this file for native builds only; the web build gets offline-maps-platform.ts.
import { createOfflinePackManager, type OfflinePackManager } from '@resgrid/maps';
import { createExpoPackFileStore, createNetInfoNetworkProbe, setMaplibreAmbientCacheSize } from '@resgrid/maps/offline/native';

import type { PlatformPackManagerInput } from './offline-maps-platform';

export type { PlatformPackManagerInput } from './offline-maps-platform';

export function createPlatformOfflinePackManager(input: PlatformPackManagerInput): OfflinePackManager | null {
  const fileStore = createExpoPackFileStore();
  if (!fileStore) {
    return null;
  }
  return createOfflinePackManager({ ...input, fileStore, network: createNetInfoNetworkProbe(), applyAmbientCacheSize: setMaplibreAmbientCacheSize });
}
