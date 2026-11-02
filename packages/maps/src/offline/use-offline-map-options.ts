import type { ConnectivitySource } from '@resgrid/offline';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';

import type { StyleSpecification } from '../types';
import type { OfflineMapsController } from './manager';
import { OfflineModeSwitch, type OfflineModeSwitchOptions } from './mode-switch';
import { createOfflineMapOptions } from './offline-options';
import type { MapLoadErrorKind, MapOfflineOptions } from './types';

const noopSubscribe = (): (() => void) => () => undefined;
const nullInstalled = (): null => null;

export interface UseOfflineMapOptionsConfig {
  /** Network state (`initOffline().connectivity`); without one the device counts as online. */
  connectivity?: ConnectivitySource | null;
  /** Overrides the manifest's `PreferLocalInAo` (D16). */
  preferLocal?: boolean;
  /** Clock and timers of the mode switch (tests). */
  switchOptions?: OfflineModeSwitchOptions;
}

/**
 * `MapProvider`'s `offline` prop from the pack manager: switches to the local `pmtiles://file://…` style when packs
 * are installed and the device is offline (or local is preferred), and back to the online department style otherwise.
 * The switch (D16) goes offline when connectivity drops or the maps report more than 5 tile errors in 30 s, and back
 * online once connectivity has been stable for 30 s.
 *
 * ```tsx
 * const offline = useOfflineMapOptions(offlineMaps, { connectivity: runtime.connectivity });
 * <MapProvider config={config} colorScheme={scheme} offline={offline}>…</MapProvider>
 * ```
 */
export function useOfflineMapOptions(controller: OfflineMapsController | null | undefined, config: UseOfflineMapOptionsConfig = {}): MapOfflineOptions | null {
  const { connectivity, preferLocal, switchOptions } = config;
  const installed = useSyncExternalStore(controller ? controller.subscribe : noopSubscribe, controller ? controller.getInstalledSet : nullInstalled, controller ? controller.getInstalledSet : nullInstalled);
  // One switch per mounted provider, created with the connectivity known at mount (no 30 s wait at start).
  const [modeSwitch] = useState(() => new OfflineModeSwitch(connectivity?.isOnline() ?? true, switchOptions));
  const isOnline = useSyncExternalStore(modeSwitch.subscribe, modeSwitch.isOnline, modeSwitch.isOnline);
  // Composed styles survive new option objects for the same installed revision (stable style → no restyle).
  const styleCache = useRef(new Map<string, StyleSpecification | null>());

  useEffect(() => {
    if (!connectivity) {
      modeSwitch.setConnectivity(true);
      return undefined;
    }
    modeSwitch.setConnectivity(connectivity.isOnline());
    return connectivity.subscribe((online) => modeSwitch.setConnectivity(online));
  }, [connectivity, modeSwitch]);

  useEffect(() => () => modeSwitch.dispose(), [modeSwitch]);

  const onMapError = useCallback((kind: MapLoadErrorKind) => modeSwitch.reportError(kind), [modeSwitch]);

  return useMemo(() => {
    const revision = installed ? `${installed.revision}:` : null;
    for (const key of [...styleCache.current.keys()]) {
      if (revision === null || !key.startsWith(revision)) styleCache.current.delete(key);
    }
    return createOfflineMapOptions({ installed, isOnline, preferLocal, styleCache: styleCache.current, onUse: controller ? (packIds) => controller.markUsed(packIds) : undefined, onMapError });
  }, [installed, isOnline, preferLocal, controller, onMapError]);
}
