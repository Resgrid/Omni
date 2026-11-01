import type { VariantManifest } from '@resgrid/config';
import type { NamespaceResources } from '@resgrid/i18n';
import type { LocationSettings } from '@resgrid/location';
import type { CallKeepSetupConfig, VoiceSoundAssets } from '@resgrid/voice';

import { EMPTY_NAV, type NavRegistry } from '../nav/define-nav';
import { defineRoutes, type RouteContract } from '../routes/define-routes';
import { setRouteContract } from '../routes/href';
import { setActiveUnitProvider } from './session';
import { registerShellScreens, type ShellScreens } from './slots';

export interface AppShellOptions {
  /** Show onboarding on web/Electron too. Default false (Dispatch showed it on iOS/Android only). */
  onboardingOnWeb?: boolean;
  /** Mount the Novu inbox provider on web/Electron. Default false (Dispatch/BigBoard ran without it on web). */
  inboxOnWeb?: boolean;
  /** Wall-board / kiosk mode: `useFormFactor()` reports `wall`. */
  kiosk?: boolean;
  /** CallKeep labels (already translated); used where the variant has `voice.callKeep`. */
  callKeep?: CallKeepSetupConfig;
  /** PTT sound assets (they live in the app bundle). */
  voiceSounds?: VoiceSoundAssets;
  /** Unit: the active unit (default: the legacy `activeUnitId` storage key). */
  getActiveUnitId?: () => string | null;
  /** Location preferences (default: the legacy `REALTIME_GEOLOCATION_ENABLED` / `BACKGROUND_GEOLOCATION_ENABLED` keys). */
  getLocationSettings?: () => LocationSettings | Promise<LocationSettings>;
  /** Register the default startup/session steps (default true; tests that drive init themselves pass false). */
  registerDefaultSteps?: boolean;
}

export interface AppShellConfig {
  variant: VariantManifest;
  /** The variant's translation namespace, e.g. `unitResources` from `@resgrid/i18n/resources/unit`. */
  i18nResources?: NamespaceResources;
  /** `defineNav([...])` from `variants/<v>/nav.ts`. */
  nav?: NavRegistry;
  /** `defineRoutes([...])` from `variants/<v>/nav.ts`. */
  routes?: RouteContract;
  /** Gate screens from `@resgrid/features/auth-ui` (built-in fallbacks otherwise). */
  screens?: Partial<ShellScreens>;
  options?: AppShellOptions;
}

let config: AppShellConfig | null = null;
const configuredListeners = new Set<(next: AppShellConfig) => void>();

/** The config set by the variant's root layout; throws before `configureAppShell()`. */
export function getAppShellConfig(): AppShellConfig {
  if (!config) {
    throw new Error('The app shell is not configured. The variant root layout must call configureAppShell() after setActiveVariant().');
  }
  return config;
}

export const getOptionalAppShellConfig = (): AppShellConfig | null => config;

export const getAppShellOptions = (): AppShellOptions => config?.options ?? {};

export const getShellNav = (): NavRegistry => config?.nav ?? EMPTY_NAV;

/** Hook for init wiring that must react to configuration (default steps register once). */
export function onAppShellConfigured(listener: (next: AppShellConfig) => void): () => void {
  configuredListeners.add(listener);
  return () => {
    configuredListeners.delete(listener);
  };
}

/** Stores the config and applies the parts that are plain registrations (route contract, screens, unit provider). */
export function applyAppShellConfig(next: AppShellConfig): void {
  if (config && config.variant.id !== next.variant.id) {
    throw new Error(`The app shell is already configured for "${config.variant.id}"; cannot reconfigure for "${next.variant.id}".`);
  }
  config = next;
  setRouteContract(next.routes ?? defineRoutes(['home']));
  if (next.screens) {
    registerShellScreens(next.screens);
  }
  setActiveUnitProvider(next.options?.getActiveUnitId ?? null);
  configuredListeners.forEach((listener) => listener(next));
}

/** Test helper. Not for app code. */
export function resetAppShellConfigForTests(): void {
  config = null;
  setRouteContract(defineRoutes(['home']));
  setActiveUnitProvider(null);
}
