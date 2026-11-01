import type { ComponentType, ReactNode } from 'react';

import type { GateStep } from '../gate/gate-state';
import { createRegistryStore } from './registry-store';

/** What every gate screen receives. Screens own their behaviour through the auth hooks; the shell only decides which. */
export interface ShellGateScreenProps {
  step: GateStep;
  /** The variant's product name (`identity.name`). */
  appName: string;
  /**
   * Onboarding: call when finished (the shell stores `IS_FIRST_TIME = false`). Access denied: call to go back to sign
   * in. Other steps end on their own when the auth state changes.
   */
  onComplete?: () => void;
}

export type ShellGateScreen = ComponentType<ShellGateScreenProps>;

/**
 * Gate screens supplied by `@resgrid/features/auth-ui` (and friends) through the variant's root layout. The shell never
 * imports features (layering); anything not registered falls back to a minimal built-in screen.
 */
export interface ShellScreens {
  Login: ShellGateScreen;
  Onboarding: ShellGateScreen;
  Maintenance: ShellGateScreen;
  PersonalLock: ShellGateScreen;
  SharedDeviceLock: ShellGateScreen;
  AccessDenied: ShellGateScreen;
  /** Shown while startup runs (storage, auth restore). */
  Loading: ShellGateScreen;
}

export type ShellScreenName = keyof ShellScreens;

const screens = createRegistryStore<Partial<ShellScreens>>({});

/** Registers gate screens; returns a function that removes exactly these registrations. */
export function registerShellScreens(next: Partial<ShellScreens>): () => void {
  screens.update((current) => ({ ...current, ...next }));
  return () => {
    screens.update((current) => {
      const copy: Partial<ShellScreens> = { ...current };
      (Object.keys(next) as ShellScreenName[]).forEach((name) => {
        if (copy[name] === next[name]) {
          delete copy[name];
        }
      });
      return copy;
    });
  };
}

export const getShellScreens = (): Partial<ShellScreens> => screens.get();
export const useShellScreens = (): Partial<ShellScreens> => screens.useValue();

// ---------------------------------------------------------------------------------------------------------------
// Sidebar content (manifest `shell.sidebarContent`). `menu` is built in; `unit-status` is registered by the Unit module.

export interface SidebarContentProps {
  /** Close the drawer after navigating (no-op for a permanent sidebar). */
  onNavigate: () => void;
}

export type SidebarContentKind = 'menu' | 'unit-status';

const sidebarContent = createRegistryStore<Partial<Record<SidebarContentKind, ComponentType<SidebarContentProps>>>>({});

export function registerSidebarContent(kind: SidebarContentKind, component: ComponentType<SidebarContentProps>): () => void {
  sidebarContent.update((current) => ({ ...current, [kind]: component }));
  return () => {
    sidebarContent.update((current) => {
      if (current[kind] !== component) {
        return current;
      }
      const copy = { ...current };
      delete copy[kind];
      return copy;
    });
  };
}

export const useSidebarContent = (kind: SidebarContentKind): ComponentType<SidebarContentProps> | undefined => sidebarContent.useValue()[kind];

// ---------------------------------------------------------------------------------------------------------------
// Signed-in overlays (step-up prompt host, recovery codes, LiveKit sheet, unit-available alerts…): mounted once inside
// the shell so no screen carries its own and two can never stack.

const overlays = createRegistryStore<readonly { id: string; component: ComponentType }[]>([]);

export function registerShellOverlay(id: string, component: ComponentType): () => void {
  overlays.update((current) => [...current.filter((entry) => entry.id !== id), { id, component }]);
  return () => {
    overlays.update((current) => current.filter((entry) => !(entry.id === id && entry.component === component)));
  };
}

export const useShellOverlays = (): readonly { id: string; component: ComponentType }[] => overlays.useValue();

// ---------------------------------------------------------------------------------------------------------------
// Banners under the app bar (below the realtime banner), on every signed-in screen: Dispatch's awaiting-resources strip.
// Each banner decides itself when to render (and renders nothing otherwise).

const banners = createRegistryStore<readonly { id: string; component: ComponentType }[]>([]);

export function registerShellBanner(id: string, component: ComponentType): () => void {
  banners.update((current) => [...current.filter((entry) => entry.id !== id), { id, component }]);
  return () => {
    banners.update((current) => current.filter((entry) => !(entry.id === id && entry.component === component)));
  };
}

export const useShellBanners = (): readonly { id: string; component: ComponentType }[] => banners.useValue();

// ---------------------------------------------------------------------------------------------------------------
// Signed-in context providers from the app layer (map style/services, status session facts, chat identity, the
// navigation-app hand-off…). The shell never imports features, so apps/omni/shell-registrations.tsx registers them and
// the shell nests them around the signed-in frame (header, sidebar, routes and overlays), inside the gate: startup has
// finished and a session exists whenever they render.

export type ShellProviderComponent = ComponentType<{ children?: ReactNode }>;

export interface ShellProviderOptions {
  /** Nesting order: lower is outer (default 0). Providers with the same order nest in registration order. */
  order?: number;
}

export interface ShellProviderEntry {
  readonly id: string;
  readonly component: ShellProviderComponent;
  readonly order: number;
  /** Registration sequence (ties on `order` nest in registration order). */
  readonly sequence: number;
}

const providers = createRegistryStore<readonly ShellProviderEntry[]>([]);
let providerSequence = 0;

/**
 * Registers a provider around the signed-in shell; returns a function that removes exactly this registration. The same
 * id replaces the earlier provider (a variant module can supersede a default). Register at module load, before the shell
 * mounts: adding or removing one later remounts everything inside it.
 */
export function registerShellProvider(id: string, component: ShellProviderComponent, options: ShellProviderOptions = {}): () => void {
  const entry: ShellProviderEntry = { id, component, order: options.order ?? 0, sequence: providerSequence++ };
  providers.update((current) => [...current.filter((existing) => existing.id !== id), entry].sort((a, b) => a.order - b.order || a.sequence - b.sequence));
  return () => {
    providers.update((current) => current.filter((existing) => existing !== entry));
  };
}

export const getShellProviders = (): readonly ShellProviderEntry[] => providers.get();
export const useShellProviders = (): readonly ShellProviderEntry[] => providers.useValue();

/** Test helper. Not for app code. */
export function resetShellSlotsForTests(): void {
  screens.set({});
  sidebarContent.set({});
  overlays.set([]);
  banners.set([]);
  providers.set([]);
}
