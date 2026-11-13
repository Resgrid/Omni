// Context providers the feature screens need, registered around the signed-in shell (registerShellProvider in
// shell-registrations.tsx). They render inside the ShellGate, so startup has run (storage, auth, platform packages) and a
// session exists. The active unit and active call come from the shell's active session (frozen legacy keys).
import { getShellApiContext, getShellOfflineRuntime, setActiveCallId, setActiveUnitId, useActiveCallId, useActiveUnitId, useShellStore } from '@resgrid/app-shell';
import { useActiveVariant } from '@resgrid/config';
import { isNative, logger } from '@resgrid/core';
import { ChatIdentityProvider } from '@resgrid/features/chat';
import { type NavigationHandoff, NavigationHandoffProvider, type NavigationTarget } from '@resgrid/features/contacts';
import { useInAppNavigationAvailable } from '@resgrid/features/navigation/hooks/use-in-app-navigation';
import { navigateInAppTo } from '@resgrid/features/navigation/routes';
import { useOfflineMapsController } from '@resgrid/features/offline-maps';
import { type ActiveUnitAdapter, getNavigationApp, openNavigationTarget, type StorageSyncServices, usePreferencesVersion } from '@resgrid/features/settings';
import { StatusProvider } from '@resgrid/features/status';
import { statusHoldApplies } from '@resgrid/features/status/lib/hold-to-confirm';
import { UnitRoutesMapProvider } from '@resgrid/features/unit-routes';
import { acquireLocationFix } from '@resgrid/location';
import { MapProvider, type MapServices, useOfflineMapOptions } from '@resgrid/maps';
import { CustomBottomSheet, NativeModal, useResolvedColorScheme } from '@resgrid/ui';
import { router } from 'expo-router';
import React, { type ReactNode, useMemo } from 'react';

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
 * offline style switch to installed packs (the controller is null where the platform has no pack storage).
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

/**
 * Hold-to-confirm (the department's setting, only in the Responder and Unit mobile apps — `capabilities.status.holdToConfirm`
 * on iOS/Android), the device's active unit and the crew's active call for the status sheets.
 */
export function ShellStatusProvider({ children }: ProviderProps) {
  const departmentEnabled = useShellStore((state) => state.departmentConfig?.StatusHoldToConfirm === true);
  const transportDestinationChecks = useShellStore((state) => state.departmentConfig?.TransportDestinationChecks === true);
  const appAllowsHold = useActiveVariant().capabilities.status.holdToConfirm;
  const holdToConfirm = statusHoldApplies({ departmentEnabled, appAllowsHold, isNativeApp: isNative() });
  const activeUnitId = useActiveUnitId();
  const activeCallId = useActiveCallId();
  return (
    <StatusProvider holdToConfirm={holdToConfirm} transportDestinationChecks={transportDestinationChecks} activeUnitId={activeUnitId} activeCallId={activeCallId} onActiveCallChange={changeActiveCall}>
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

/** The navigation app chosen in Settings (Settings → Preferences → Navigation app), from the device's recent position. */
const openExternalNavigation = openNavigationTarget;

/** In-app turn-by-turn (MapLibre plan §9.1): a call by id (the server routes to it), any other point handed over in memory. */
const openInAppNavigation = (target: NavigationTarget): Promise<boolean> => {
  if ('address' in target) return openExternalNavigation(target);
  navigateInAppTo(router, target);
  return Promise.resolve(true);
};

/**
 * Directions: in-app turn-by-turn where the app can navigate and the crew kept it as their choice (the default where it
 * is offered), else their navigation app. "Open in…" from the navigation screen always goes to the external app.
 */
export function ShellNavigationHandoffProvider({ children }: ProviderProps) {
  const inApp = useInAppNavigationAvailable();
  usePreferencesVersion();
  const prefersInApp = inApp && getNavigationApp({ inApp }) === 'resgrid';
  const value = useMemo<NavigationHandoff>(() => ({ navigateTo: prefersInApp ? openInAppNavigation : openExternalNavigation, openExternal: openExternalNavigation }), [prefersInApp]);
  return <NavigationHandoffProvider value={value}>{children}</NavigationHandoffProvider>;
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
