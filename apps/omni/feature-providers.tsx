// Context providers the feature screens need, registered around the signed-in shell (registerShellProvider in
// shell-registrations.tsx). They render inside the ShellGate, so startup has run (storage, auth, platform packages) and a
// session exists. The active unit and active call come from the shell's active session (frozen legacy keys).
import { getShellApiContext, getShellOfflineRuntime, setActiveCallId, setActiveUnitId, useActiveCallId, useActiveUnitId, useShellStore } from '@resgrid/app-shell';
import { useActiveVariant } from '@resgrid/config';
import { logger } from '@resgrid/core';
import { ChatIdentityProvider } from '@resgrid/features/chat';
import { type NavigationHandoff, NavigationHandoffProvider, type NavigationTarget } from '@resgrid/features/contacts';
import { useOfflineMapsController } from '@resgrid/features/offline-maps';
import { type ActiveUnitAdapter, openMapsWithAddress, openMapsWithDirections, type StorageSyncServices } from '@resgrid/features/settings';
import { StatusProvider } from '@resgrid/features/status';
import { UnitRoutesMapProvider } from '@resgrid/features/unit-routes';
import { acquireLocationFix } from '@resgrid/location';
import { MapProvider, type MapServices, useOfflineMapOptions } from '@resgrid/maps';
import { CustomBottomSheet, NativeModal, useResolvedColorScheme } from '@resgrid/ui';
import React, { type ReactNode } from 'react';

import { MAP_ICONS } from './map-icons';
import { getMapLibreWorkerUrl } from './map-worker';
import { renderRouteMap } from './route-map';

type ProviderProps = { children?: ReactNode };

const MAP_OVERLAYS = { Modal: NativeModal, Sheet: CustomBottomSheet };

/** "Get my location" in map pickers: an on-demand fix through @resgrid/location (permission flow included). */
const MAP_SERVICES: Partial<MapServices> = {
  getCurrentPosition: async () => {
    try {
      const result = await acquireLocationFix();
      const coords = result.location?.coords;
      return coords ? { latitude: coords.latitude, longitude: coords.longitude, heading: coords.heading, accuracy: coords.accuracy } : null;
    } catch (error) {
      logger.warn({ message: 'Map location fix failed', context: { error: error instanceof Error ? error.name : typeof error } });
      return null;
    }
  },
};

const MAP_WORKER_URL = getMapLibreWorkerUrl();

/**
 * Department map style, attribution, centre, bundled icons, overlays and services for every map (@resgrid/maps), and the
 * offline style switch to installed packs (iOS/Android; the controller is null on the web).
 */
export function ShellMapProvider({ children }: ProviderProps) {
  const config = useShellStore((state) => state.departmentConfig);
  const colorScheme = useResolvedColorScheme();
  const offline = useOfflineMapOptions(useOfflineMapsController(), { connectivity: getShellOfflineRuntime()?.connectivity ?? null });
  return (
    <MapProvider config={config} colorScheme={colorScheme} apiContext={getShellApiContext()} icons={MAP_ICONS} overlays={MAP_OVERLAYS} services={MAP_SERVICES} offline={offline} webWorkerUrl={MAP_WORKER_URL}>
      {children}
    </MapProvider>
  );
}

const changeActiveCall = (callId: string): void => setActiveCallId(callId);

/** Clears the crew's active call (Unit's status console). */
export const clearActiveCall = (): void => setActiveCallId(null);

/** The department's hold-to-confirm setting, the device's active unit and the crew's active call for the status sheets. */
export function ShellStatusProvider({ children }: ProviderProps) {
  const holdToConfirm = useShellStore((state) => state.departmentConfig?.StatusHoldToConfirm === true);
  const activeUnitId = useActiveUnitId();
  const activeCallId = useActiveCallId();
  return (
    <StatusProvider holdToConfirm={holdToConfirm} activeUnitId={activeUnitId} activeCallId={activeCallId} onActiveCallChange={changeActiveCall}>
      {children}
    </StatusProvider>
  );
}

const toPositiveInt = (value: string | null): number | null => {
  const parsed = Number(value);
  return value !== null && Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

/** Chat as the active unit where the device reports status for a unit (capability, not the app id); as the user elsewhere. */
export function ShellChatIdentityProvider({ children }: ProviderProps) {
  const variant = useActiveVariant();
  const activeUnitId = useActiveUnitId();
  const asUnitId = variant.capabilities.status.subject === 'unit' ? toPositiveInt(activeUnitId) : null;
  return <ChatIdentityProvider asUnitId={asUnitId}>{children}</ChatIdentityProvider>;
}

/** Directions open in the navigation app chosen in Settings (Settings → Preferences → Navigation app). */
const NAVIGATION_HANDOFF: NavigationHandoff = {
  navigateTo: (target: NavigationTarget) => ('address' in target ? openMapsWithAddress(target.address) : openMapsWithDirections(target.latitude, target.longitude, target.label)),
};

export function ShellNavigationHandoffProvider({ children }: ProviderProps) {
  return <NavigationHandoffProvider value={NAVIGATION_HANDOFF}>{children}</NavigationHandoffProvider>;
}

/** Unit's route maps (unit-routes map slot) drawn with @resgrid/maps. */
export function ShellRouteMapProvider({ children }: ProviderProps) {
  return <UnitRoutesMapProvider renderMap={renderRouteMap}>{children}</UnitRoutesMapProvider>;
}

/** Settings → Unit: choose the device's unit (Unit's status subject). */
export const ACTIVE_UNIT_ADAPTER: ActiveUnitAdapter = {
  useActiveUnitId,
  setActiveUnit: async (unitId: string) => setActiveUnitId(unitId),
};

/** Settings → Advanced → Storage & sync, from the offline runtime startup opened (null before startup.offline ran). */
export function storageSyncServices(): StorageSyncServices | null {
  const offline = getShellOfflineRuntime();
  return offline ? { storage: offline.storageManager, outbox: offline.outbox, sync: offline.sync } : null;
}
