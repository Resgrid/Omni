import type { ConnectivitySource } from '@resgrid/offline';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';

import type { StyleSpecification } from '../types';
import type { OfflineMapsController } from './manager';
import { createOfflineMapOptions } from './offline-options';
import type { MapOfflineOptions } from './types';

const noopSubscribe = (): (() => void) => () => undefined;
const nullInstalled = (): null => null;

export interface UseOfflineMapOptionsConfig {
  /** Network state (`initOffline().connectivity`); without one the device counts as online. */
  connectivity?: ConnectivitySource | null;
  /** Overrides the manifest's `PreferLocalInAo` (D16). */
  preferLocal?: boolean;
}

/**
 * `MapProvider`'s `offline` prop from the pack manager: switches to the local `pmtiles://file://…` style when packs
 * are installed and the device is offline (or local is preferred), and back to the online department style otherwise.
 *
 * ```tsx
 * const offline = useOfflineMapOptions(offlineMaps, { connectivity: runtime.connectivity });
 * <MapProvider config={config} colorScheme={scheme} offline={offline}>…</MapProvider>
 * ```
 */
export function useOfflineMapOptions(controller: OfflineMapsController | null | undefined, config: UseOfflineMapOptionsConfig = {}): MapOfflineOptions | null {
  const { connectivity, preferLocal } = config;
  const installed = useSyncExternalStore(controller ? controller.subscribe : noopSubscribe, controller ? controller.getInstalledSet : nullInstalled, controller ? controller.getInstalledSet : nullInstalled);
  const [isOnline, setOnline] = useState<boolean>(() => connectivity?.isOnline() ?? true);
  // Composed styles survive new option objects for the same installed revision (stable style → no restyle).
  const styleCache = useRef(new Map<string, StyleSpecification | null>());

  useEffect(() => {
    if (!connectivity) {
      setOnline(true);
      return undefined;
    }
    setOnline(connectivity.isOnline());
    return connectivity.subscribe((online) => setOnline(online));
  }, [connectivity]);

  return useMemo(() => {
    const revision = installed ? `${installed.revision}:` : null;
    for (const key of [...styleCache.current.keys()]) {
      if (revision === null || !key.startsWith(revision)) styleCache.current.delete(key);
    }
    return createOfflineMapOptions({ installed, isOnline, preferLocal, styleCache: styleCache.current, onUse: controller ? (packIds) => controller.markUsed(packIds) : undefined });
  }, [installed, isOnline, preferLocal, controller]);
}
