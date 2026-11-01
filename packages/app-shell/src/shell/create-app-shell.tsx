import { reportOperatorActivity, updateActivity } from '@resgrid/auth';
import type { VariantManifest } from '@resgrid/config';
import { isDev } from '@resgrid/core';
import { useThemeColors } from '@resgrid/ui';
import { Slot, Tabs } from 'expo-router';
import React, { type ComponentType, useCallback, useMemo, useRef } from 'react';
import { type ColorValue, StyleSheet, View } from 'react-native';

import { ShellGate } from '../gate/shell-gate';
import type { NavRegistry } from '../nav/define-nav';
import { buildTabScreens, findUnregisteredRoutes } from '../nav/filter';
import { useNavFilterContext, useNavLabel } from '../nav/use-nav-items';
import { getShellNav } from '../runtime/shell-config';
import { ShellHeader } from './header';
import { RegisteredBanners, RegisteredOverlays, SessionInitOverlay, ShellOfflineToast, ShellRealtimeBanner } from './overlays';
import { RegisteredProviders } from './registered-providers';
import { ShellProvider } from './shell-context';
import { DrawerSidebar, InlineSidebar } from './sidebar';

/** Activity for the personal lock and the shared-session idle timer, at most every 5 s (a write per touch is too many). */
const ACTIVITY_THROTTLE_MS = 5_000;

function useActivityCapture(): () => boolean {
  const last = useRef(0);
  return useCallback(() => {
    const now = Date.now();
    if (now - last.current >= ACTIVITY_THROTTLE_MS) {
      last.current = now;
      updateActivity(now);
      reportOperatorActivity(false, now);
    }
    // Observe only: never take the responder from the touched control.
    return false;
  }, []);
}

/** Tabs generated from the nav registry: every registered route gets a screen; only available `tab` entries a button. */
export function RegistryTabs({ nav }: { nav: NavRegistry }) {
  const context = useNavFilterContext();
  const label = useNavLabel();
  const colors = useThemeColors();
  const screens = useMemo(() => buildTabScreens(nav.entries, context, label), [nav, context, label]);

  // Dev-time registry check: an (app) route without a nav entry would become an unlabeled tab.
  const screenListeners = useCallback(
    ({ route }: { route: { name: string } }) => {
      if (isDev()) {
        const missing = findUnregisteredRoutes([route.name], nav.entries);
        if (missing.length > 0) {
          throw new Error(`Route "(app)/${missing[0]}" has no nav registry entry. Add it to variants/<variant>/nav.ts (placement 'hidden' if it has no link).`);
        }
      }
      return {};
    },
    [nav]
  );

  return (
    <Tabs
      screenListeners={screenListeners}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primaryStrong,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.background, borderTopColor: colors.border },
      }}
    >
      {screens.map((screen) => {
        const Icon = screen.entry.icon;
        return (
          <Tabs.Screen
            key={screen.name}
            name={screen.name}
            options={{
              title: screen.title,
              tabBarButtonTestID: screen.entry.testID ?? `${screen.entry.id}-tab`,
              ...(Icon
                ? {
                    tabBarIcon: ({ color, size }: { color: ColorValue; size: number }) => (
                      <View>
                        <Icon color={typeof color === 'string' ? color : undefined} size={size} />
                      </View>
                    ),
                  }
                : {}),
              ...(screen.visible ? {} : { href: null }),
            }}
          />
        );
      })}
    </Tabs>
  );
}

function ShellFrame({ variant, nav }: { variant: VariantManifest; nav: NavRegistry }) {
  const colors = useThemeColors();
  const onTouchCapture = useActivityCapture();
  return (
    <View style={StyleSheet.flatten([styles.fill, { backgroundColor: colors.background }])} onStartShouldSetResponderCapture={onTouchCapture} testID={`app-shell-${variant.shell.kind}`}>
      <ShellHeader nav={nav} />
      <ShellRealtimeBanner />
      <RegisteredBanners />
      <View style={styles.body}>
        <InlineSidebar nav={nav} />
        <View style={styles.content}>{variant.shell.kind === 'tabs' ? <RegistryTabs nav={nav} /> : <Slot />}</View>
      </View>
      <DrawerSidebar nav={nav} />
      <ShellOfflineToast />
      <RegisteredOverlays />
      <SessionInitOverlay />
    </View>
  );
}

export interface CreateAppShellOptions {
  /** Defaults to the nav registered with `configureAppShell`. */
  nav?: NavRegistry;
}

/**
 * The `(app)` group layout for a variant (`variants/<v>/app/(app)/_layout.tsx`):
 *
 * ```ts
 * export default createAppShell(variant);
 * ```
 *
 * `shell.kind` picks the frame — `drawer-slot` (header + Slot: Responder, Dispatch, BigBoard) or `tabs` (header + tab
 * bar from the nav registry: Unit, IC) — and `shell.sidebar` the sidebar per form factor. Everything inside is gated by
 * ShellGate.
 */
export function createAppShell(variant: VariantManifest, options: CreateAppShellOptions = {}): ComponentType {
  function AppShellLayout() {
    const nav = options.nav ?? getShellNav();
    return (
      <ShellGate>
        <ShellProvider variant={variant}>
          <RegisteredProviders>
            <ShellFrame variant={variant} nav={nav} />
          </RegisteredProviders>
        </ShellProvider>
      </ShellGate>
    );
  }
  AppShellLayout.displayName = `AppShell(${variant.id})`;
  return AppShellLayout;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  body: { flex: 1, flexDirection: 'row' },
  content: { flex: 1 },
});
