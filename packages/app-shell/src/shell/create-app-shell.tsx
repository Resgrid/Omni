import { reportOperatorActivity, updateActivity } from '@resgrid/auth';
import type { VariantManifest } from '@resgrid/config';
import { isDev, recordUserActivity } from '@resgrid/core';
import { AppBarBackContext, useThemeColors } from '@resgrid/ui';
import { Stack, Tabs } from 'expo-router';
import React, { type ComponentType, useCallback, useMemo, useRef } from 'react';
import { type ColorValue, StyleSheet, View } from 'react-native';

import { ShellGate } from '../gate/shell-gate';
import type { NavRegistry } from '../nav/define-nav';
import { buildTabScreens, findUnregisteredRoutes } from '../nav/filter';
import { useNavFilterContext, useNavLabel } from '../nav/use-nav-items';
import { getShellNav } from '../runtime/shell-config';
import { ShellUpdateNotice } from '../updates/update-notice';
import { ShellHeader, useHeaderLeading } from './header';
import { RegisteredBanners, RegisteredOverlays, SessionInitOverlay, ShellOfflineToast, ShellRealtimeBanner } from './overlays';
import { RegisteredProviders } from './registered-providers';
import { ShellProvider } from './shell-context';
import { DrawerSidebar, InlineSidebar } from './sidebar';

/**
 * Activity for the personal lock, the shared-session idle timer and the wall-display update restart, at most every 5 s
 * (a write per touch is too many).
 */
const ACTIVITY_THROTTLE_MS = 5_000;

function useActivityCapture(): () => boolean {
  const last = useRef(0);
  return useCallback(() => {
    const now = Date.now();
    if (now - last.current >= ACTIVITY_THROTTLE_MS) {
      last.current = now;
      updateActivity(now);
      reportOperatorActivity(false, now);
      recordUserActivity(now);
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
      backBehavior="history"
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
              // Expo Router 58 treats href: null as an inactive route and redirects away from it.
              // Hide only the button so drawer and detail routes remain navigable.
              ...(screen.visible ? {} : { tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }),
            }}
          />
        );
      })}
    </Tabs>
  );
}

/**
 * The drawer shells' routes (Responder, Dispatch, BigBoard): a header-less stack, so the screens below the current one stay
 * mounted. A Slot rendered only the current route, so opening a call or a chat channel threw away the screen underneath —
 * Back rebuilt it, and nested layouts (Home's Status / Calls tabs) came back on their first screen. Legacy Responder kept
 * them mounted by pushing details onto its root stack. No transition: switching screens looks as it did under the Slot.
 */
const DRAWER_STACK_OPTIONS = { headerShown: false, animation: 'none' } as const;

function ShellFrame({ variant, nav }: { variant: VariantManifest; nav: NavRegistry }) {
  const colors = useThemeColors();
  const onTouchCapture = useActivityCapture();
  // The app bar owns back: a detail screen's in-content header drops its own arrow while this one shows.
  const { leading } = useHeaderLeading(nav);
  return (
    <View style={StyleSheet.flatten([styles.fill, { backgroundColor: colors.background }])} onStartShouldSetResponderCapture={onTouchCapture} testID={`app-shell-${variant.shell.kind}`}>
      <ShellHeader nav={nav} />
      <ShellRealtimeBanner />
      <RegisteredBanners />
      <View style={styles.body}>
        <InlineSidebar nav={nav} />
        <View style={styles.content}>
          <AppBarBackContext.Provider value={leading === 'back'}>{variant.shell.kind === 'tabs' ? <RegistryTabs nav={nav} /> : <Stack screenOptions={DRAWER_STACK_OPTIONS} />}</AppBarBackContext.Provider>
        </View>
      </View>
      <DrawerSidebar nav={nav} />
      <ShellOfflineToast />
      <ShellUpdateNotice />
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
 * `shell.kind` picks the frame — `drawer-slot` (header + header-less stack: Responder, Dispatch, BigBoard) or `tabs` (header + tab
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
