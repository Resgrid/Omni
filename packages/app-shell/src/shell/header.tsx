import { useBadgeCount } from '@resgrid/data';
import { contentOnFill, CountBadge, Spinner, SYNC_NOTICE_DELAY_MS, Text, useSettledFlag, useThemeColors } from '@resgrid/ui';
import { type Href, usePathname, useRouter } from 'expo-router';
import { ArrowLeft, Bell, Menu, RefreshCw, TriangleAlert, WifiOff } from 'lucide-react-native';
import React, { useCallback } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useShellTranslation } from '../i18n';
import { useAppInit } from '../init/app-init';
import { type NavEntry, type NavRegistry, normalizeHref } from '../nav/define-nav';
import { useNavLabel } from '../nav/use-nav-items';
import { useShellInboxStatus } from '../providers/inbox-provider';
import { matchRoutePattern } from '../routes/define-routes';
import { useHref } from '../routes/href';
import { useShellStore } from '../runtime/shell-state';
import { useHeaderActionsNode, useScreenTitle, useShell } from './shell-context';
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

/**
 * The header's leading control for the current route and the nav entry it matched. The shell frame reads it too, to
 * tell in-content headers (`AppBarBackContext`) when the app bar already shows back.
 */
export function useHeaderLeading(nav: NavRegistry): { leading: HeaderLeading; match: { entry: NavEntry; exact: boolean } | null } {
  const shell = useShell();
  const pathname = usePathname();
  const router = useRouter();
  const match = findNavEntryForPath(nav, pathname);
  const leading = resolveHeaderLeading({ isTopLevel: isTopLevelScreen(match, pathname), canGoBack: router.canGoBack(), sidebarMode: shell.sidebarMode });

  return { leading, match };
}

type SyncChipKind = 'attention' | 'offline' | 'waiting';

const SYNC_CHIP_ICONS = { attention: TriangleAlert, offline: WifiOff, waiting: RefreshCw } as const;

/**
 * The app bar's sync state: changes that need the user, offline, or changes waiting to send — in that order. Each state
 * shows only once it has itself lasted `SYNC_NOTICE_DELAY_MS`: a write that sends a moment later or a connectivity blip
 * never flashes the bar, and neither does the moment after reconnecting while the queue drains ("Offline" goes at once;
 * "Changes waiting" comes only if sending takes a while). It links to the storage screen when there are changes to see.
 */
function SyncStatusChip() {
  const unsent = useShellStore((state) => state.unsentChanges);
  const attention = useShellStore((state) => state.changesNeedingAttention);
  const isOffline = useShellStore((state) => state.isOffline);
  const href = useHref();
  const router = useRouter();
  const colors = useThemeColors();
  const { t } = useShellTranslation();
  const target = href.settingsStorage();
  const settle = { delayMs: SYNC_NOTICE_DELAY_MS };
  const showAttention = useSettledFlag(attention > 0, settle);
  const showOffline = useSettledFlag(isOffline, settle);
  const showWaiting = useSettledFlag(!isOffline && unsent > 0, settle);
  const kind: SyncChipKind | null = showAttention ? 'attention' : showOffline ? 'offline' : showWaiting ? 'waiting' : null;

  if (kind === null) {
    return null;
  }

  const label =
    kind === 'attention'
      ? t('shell.changes_need_attention', { count: attention })
      : kind === 'offline'
        ? unsent > 0
          ? t('shell.offline_changes_waiting', { count: unsent })
          : t('shell.offline')
        : t('shell.changes_waiting', { count: unsent });

  const fill = kind === 'attention' ? colors.error : colors.warning;
  const onFill = kind === 'attention' ? contentOnFill(colors.error) : colors.textInverse;
  const Icon = SYNC_CHIP_ICONS[kind];

  const content = (
    <View style={StyleSheet.flatten([styles.pending, { backgroundColor: fill }])}>
      <View>
        <Icon size={14} color={onFill} />
      </View>
      <Text style={StyleSheet.flatten([styles.pendingText, { color: onFill }])} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );

  // Offline with nothing queued has nothing to open. Without a storage screen in this variant the chip still shows, but
  // it is not a link (links to absent routes hide).
  return target && (attention > 0 || unsent > 0) ? (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityHint={t('shell.changes_waiting_hint')} onPress={() => router.push(target)} testID="shell-pending-changes">
      {content}
    </Pressable>
  ) : (
    <View accessible accessibilityLabel={label} testID="shell-pending-changes">
      {content}
    </View>
  );
}

/** A bootstrap quicker than this shows no indicator at all; one that shows stays long enough to see. */
export const SESSION_INIT_INDICATOR_DELAY_MS = 1000;
export const SESSION_INIT_INDICATOR_MIN_VISIBLE_MS = 1000;

/**
 * The signed-in bootstrap's first run, without blocking anything: launch never puts a spinner over the app (owner
 * decision, 2026-11-04). Rights, flags and terminology are persisted, so every screen works from the last session's
 * copies while the bootstrap refreshes them, and lists show their own loading inside the page. Once the run has taken a
 * moment (a quick one would only flash it), a small spinner sits in the app bar just left of the notification bell. It
 * used to be a "Loading…" chip at the top of the content, where it covered search fields and tab buttons (owner, 2026-11-06).
 * It takes no touches and holds a fixed slot, so the bell does not move when it goes.
 */
function SessionInitSpinner() {
  const init = useAppInit();
  const colors = useThemeColors();
  const { t } = useShellTranslation();
  const isVisible = useSettledFlag(init.isSessionLoading, { delayMs: SESSION_INIT_INDICATOR_DELAY_MS, minVisibleMs: SESSION_INIT_INDICATOR_MIN_VISIBLE_MS });

  if (!isVisible) {
    return null;
  }

  return (
    <View pointerEvents="none" accessible accessibilityRole="progressbar" accessibilityLabel={t('shell.loading')} accessibilityState={{ busy: true }} style={styles.initSpinner} testID="shell-init-loading">
      <Spinner size="small" color={colors.primary} />
    </View>
  );
}

function InboxBellButton({ count, onPress }: { count: number; onPress: () => void }) {
  const colors = useThemeColors();
  const { t, tk } = useShellTranslation();
  const label = count > 0 ? t('shell.notifications_unread', { count }) : tk('notifications.title', 'Notifications');

  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.iconButton} testID="shell-notifications-button">
      <View>
        <Bell size={24} color={colors.text} />
      </View>
      <CountBadge count={count} placement="corner" testID="shell-notifications-badge" />
    </Pressable>
  );
}

/** The unread count from the badge counts store (the inbox provider's one Novu subscription feeds it while ready). */
function ReadyInboxBell({ onPress }: { onPress: () => void }) {
  const count = useBadgeCount('notifications') ?? 0;

  return <InboxBellButton count={count} onPress={onPress} />;
}

/**
 * The notification bell with the unread count (every legacy app with an inbox had it): shown where the variant has the
 * inbox route and Novu runs on this platform with department settings. The count appears once the inbox is ready.
 */
function InboxBell() {
  const status = useShellInboxStatus();
  const href = useHref();
  const router = useRouter();
  const pathname = usePathname();
  const target = href.notifications();

  const open = useCallback(() => {
    if (target && normalizeHref(pathname) !== normalizeHref(String(target))) {
      router.push(target);
    }
  }, [pathname, router, target]);

  if (!target || status === 'unavailable') {
    return null;
  }

  return status === 'ready' ? <ReadyInboxBell onPress={open} /> : <InboxBellButton count={0} onPress={open} />;
}

export interface ShellHeaderProps {
  nav: NavRegistry;
}

export function ShellHeader({ nav }: ShellHeaderProps) {
  const shell = useShell();
  const router = useRouter();
  const href = useHref();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { t, tk } = useShellTranslation();
  const label = useNavLabel();
  const actions = useHeaderActionsNode();
  // A detail screen's own header (ScreenHeader) titles the bar while the bar shows back, instead of a second row below.
  const screenTitle = useScreenTitle();

  const { leading, match } = useHeaderLeading(nav);
  const title = screenTitle?.title ?? (match ? label(match.entry) : tk('app.title', shell.variant.identity.name, { appName: shell.variant.identity.name }));

  const goBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();

      return;
    }

    router.replace(href.home() ?? ('/' as Href));
  }, [href, router]);

  // The Dispatch app bar: the panel-header surface with body text, a hairline and a soft shadow, in every app.
  const onColor = colors.text;

  return (
    <View style={StyleSheet.flatten([styles.header, { paddingTop: insets.top, backgroundColor: colors.surface, borderBottomColor: colors.border }])} testID="shell-header">
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
      <View style={StyleSheet.flatten([styles.side, styles.actions])} testID="shell-header-actions">
        <SyncStatusChip />
        {screenTitle?.right ?? null}
        {actions}
        <SessionInitSpinner />
        <InboxBell />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    minHeight: 56,
    borderBottomWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
    zIndex: 1,
  },
  side: { minWidth: 48, flexDirection: 'row', alignItems: 'center' },
  actions: { justifyContent: 'flex-end' },
  iconButton: { padding: 8, minWidth: 40, minHeight: 40, alignItems: 'center', justifyContent: 'center' },
  initSpinner: { width: 32, height: 40, alignItems: 'center', justifyContent: 'center' },
  titleBox: { flex: 1, alignItems: 'center', paddingHorizontal: 8 },
  title: { fontSize: 18, fontWeight: '700', letterSpacing: 0.5 },
  // The Text primitive's default line height (24, from `text-base`) does not shrink with an inline fontSize on native, so
  // chip and badge text pins its own; the count pill grows (minHeight) instead of clipping with larger system text.
  pending: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4, marginRight: 4 },
  pendingText: { fontSize: 12, lineHeight: 16, fontWeight: '600', marginLeft: 4 },
});
