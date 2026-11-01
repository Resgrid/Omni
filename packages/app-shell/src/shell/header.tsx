import { Text, useThemeColors } from '@resgrid/ui';
import { type Href, usePathname, useRouter } from 'expo-router';
import { ArrowLeft, Menu, RefreshCw } from 'lucide-react-native';
import React, { useCallback } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useShellTranslation } from '../i18n';
import { type NavEntry, type NavRegistry, normalizeHref } from '../nav/define-nav';
import { useNavLabel } from '../nav/use-nav-items';
import { matchRoutePattern } from '../routes/define-routes';
import { useHref } from '../routes/href';
import { useShellStore } from '../runtime/shell-state';
import { useHeaderActionsNode, useShell } from './shell-context';
import type { SidebarMode } from './sidebar-mode';

export type HeaderLeading = 'back' | 'menu' | 'none';

/**
 * Header back-button rules: a screen below the top level (not a nav entry's own path) gets a back button when there is
 * history; top-level screens get the menu button, except next to a permanent sidebar (spacer instead).
 */
export function resolveHeaderLeading(input: { isTopLevel: boolean; canGoBack: boolean; sidebarMode: SidebarMode }): HeaderLeading {
  if (!input.isTopLevel && input.canGoBack) {
    return 'back';
  }
  return input.sidebarMode === 'permanent' ? 'none' : 'menu';
}

const isPatternHref = (href: string): boolean => href.includes('[');

/**
 * The nav entry for a path: its own entry (a static href, or a hidden detail entry whose pattern matches: `/call/12` →
 * `/call/[id]`), else the closest ancestor entry (`/calls/12` → Calls).
 */
export function findNavEntryForPath(nav: NavRegistry, pathname: string): { entry: NavEntry; exact: boolean } | null {
  const path = normalizeHref(pathname);
  const exact = nav.findByHref(path) ?? nav.entries.find((entry) => isPatternHref(entry.href) && matchRoutePattern(entry.href, path));
  if (exact) {
    return { entry: exact, exact: true };
  }
  let best: NavEntry | null = null;
  for (const entry of nav.entries) {
    const href = normalizeHref(entry.href);
    if (href !== '/' && path.startsWith(`${href}/`) && (!best || href.length > normalizeHref(best.href).length)) {
      best = entry;
    }
  }
  return best ? { entry: best, exact: false } : null;
}

/**
 * Whether a path is a top-level screen (menu button) rather than one reached from another screen (back button): a menu
 * or tab entry's own path, a tab of a nested tab layout (`nestedTabs`), or the root. Hidden entries (details, account
 * security) are always reached from somewhere else.
 */
export function isTopLevelScreen(match: { entry: NavEntry; exact: boolean } | null, pathname: string): boolean {
  if (normalizeHref(pathname) === '/') {
    return true;
  }
  return match !== null && match.entry.placement !== 'hidden' && (match.exact || match.entry.nestedTabs === true);
}

function PendingChangesIndicator() {
  const unsent = useShellStore((state) => state.unsentChanges);
  const href = useHref();
  const router = useRouter();
  const colors = useThemeColors();
  const { t } = useShellTranslation();
  const target = href.settingsStorage();

  if (unsent <= 0) {
    return null;
  }
  const label = t('shell.changes_waiting', { count: unsent });
  const content = (
    <View style={StyleSheet.flatten([styles.pending, { backgroundColor: colors.warning }])}>
      <View>
        <RefreshCw size={14} color={colors.textInverse} />
      </View>
      <Text style={StyleSheet.flatten([styles.pendingText, { color: colors.textInverse }])} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
  // Without a storage screen in this variant the count still shows, but it is not a link (links to absent routes hide).
  return target ? (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityHint={t('shell.changes_waiting_hint')} onPress={() => router.push(target)} testID="shell-pending-changes">
      {content}
    </Pressable>
  ) : (
    <View accessible accessibilityLabel={label} testID="shell-pending-changes">
      {content}
    </View>
  );
}

export interface ShellHeaderProps {
  nav: NavRegistry;
}

export function ShellHeader({ nav }: ShellHeaderProps) {
  const shell = useShell();
  const pathname = usePathname();
  const router = useRouter();
  const href = useHref();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { t, tk } = useShellTranslation();
  const label = useNavLabel();
  const actions = useHeaderActionsNode();

  const match = findNavEntryForPath(nav, pathname);
  const isTopLevel = isTopLevelScreen(match, pathname);
  const leading = resolveHeaderLeading({ isTopLevel, canGoBack: router.canGoBack(), sidebarMode: shell.sidebarMode });
  const title = match ? label(match.entry) : tk('app.title', shell.variant.identity.name, { appName: shell.variant.identity.name });

  const goBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace(href.home() ?? ('/' as Href));
  }, [href, router]);

  const onColor = colors.textInverse;
  return (
    <View style={StyleSheet.flatten([styles.header, { paddingTop: insets.top, backgroundColor: colors.primaryStrong }])} testID="shell-header">
      <View style={styles.side}>
        {leading === 'back' ? (
          <Pressable accessibilityRole="button" accessibilityLabel={t('shell.back')} onPress={goBack} style={styles.iconButton} testID="shell-back-button">
            <View>
              <ArrowLeft size={24} color={onColor} />
            </View>
          </Pressable>
        ) : leading === 'menu' ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={shell.isMenuOpen ? t('shell.close_menu') : t('shell.open_menu')}
            accessibilityState={{ expanded: shell.isMenuOpen }}
            onPress={shell.sidebarMode === 'panel' ? shell.toggleMenu : shell.openMenu}
            style={styles.iconButton}
            testID="shell-menu-button"
          >
            <View>
              <Menu size={24} color={onColor} />
            </View>
          </Pressable>
        ) : (
          <View style={styles.iconButton} />
        )}
      </View>
      <View style={styles.titleBox}>
        <Text style={StyleSheet.flatten([styles.title, { color: onColor }])} numberOfLines={1} accessibilityRole="header" testID="shell-header-title">
          {title}
        </Text>
      </View>
      <View style={StyleSheet.flatten([styles.side, styles.actions])}>
        <PendingChangesIndicator />
        {actions}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, minHeight: 56 },
  side: { minWidth: 48, flexDirection: 'row', alignItems: 'center' },
  actions: { justifyContent: 'flex-end' },
  iconButton: { padding: 8, minWidth: 40, minHeight: 40, alignItems: 'center', justifyContent: 'center' },
  titleBox: { flex: 1, alignItems: 'center', paddingHorizontal: 8 },
  title: { fontSize: 18, fontWeight: '600' },
  pending: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4, marginRight: 4 },
  pendingText: { fontSize: 12, fontWeight: '600', marginLeft: 4 },
});
