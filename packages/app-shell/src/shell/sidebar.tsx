import { SideDrawer, Text, useThemeColors } from '@resgrid/ui';
import { type Href, usePathname, useRouter } from 'expo-router';
import React, { useCallback } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useShellTranslation } from '../i18n';
import { type NavRegistry, normalizeHref } from '../nav/define-nav';
import { type NavItem, useNavItems } from '../nav/use-nav-items';
import { type SidebarContentProps, useSidebarContent } from '../runtime/slots';
import { useShell } from './shell-context';
import { PANEL_SIDEBAR_WIDTH, PERMANENT_SIDEBAR_WIDTH } from './sidebar-mode';

function MenuRow({ item, active, onPress }: { item: NavItem; active: boolean; onPress: (item: NavItem) => void }) {
  const colors = useThemeColors();
  const Icon = item.icon;
  const color = active ? colors.primaryStrong : colors.icon;
  return (
    <Pressable
      accessibilityRole="menuitem"
      accessibilityState={{ selected: active }}
      onPress={() => onPress(item)}
      style={StyleSheet.flatten([styles.row, active ? { backgroundColor: colors.surfaceRaised } : null])}
      testID={item.testID}
    >
      {Icon ? (
        <View style={styles.rowIcon}>
          <Icon size={22} color={color} />
        </View>
      ) : null}
      <Text style={StyleSheet.flatten([styles.rowLabel, { color: active ? colors.primaryStrong : colors.text }])} numberOfLines={1}>
        {item.label}
      </Text>
    </Pressable>
  );
}

/** The built-in `menu` sidebar content: the variant's nav entries (tab + sidebar placements), flag/capability filtered. */
export function NavMenu({ nav, onNavigate }: SidebarContentProps & { nav: NavRegistry }) {
  const items = useNavItems(nav, ['tab', 'sidebar']);
  const pathname = normalizeHref(usePathname());
  const router = useRouter();
  const { t } = useShellTranslation();

  const onPress = useCallback(
    (item: NavItem) => {
      router.navigate(item.href as Href);
      onNavigate();
    },
    [onNavigate, router]
  );

  return (
    <ScrollView accessibilityRole="menu" accessibilityLabel={t('shell.navigation')} contentContainerStyle={styles.menu} testID="shell-nav-menu">
      {items.map((item) => (
        <MenuRow key={item.id} item={item} active={normalizeHref(item.href) === pathname} onPress={onPress} />
      ))}
    </ScrollView>
  );
}

/** Sidebar content for the manifest's `shell.sidebarContent`: a registered component (Unit's status console), else the menu. */
export function SidebarContent({ nav, onNavigate }: SidebarContentProps & { nav: NavRegistry }) {
  const shell = useShell();
  const Registered = useSidebarContent(shell.variant.shell.sidebarContent);
  return Registered ? <Registered onNavigate={onNavigate} /> : <NavMenu nav={nav} onNavigate={onNavigate} />;
}

/** The inline sidebar (permanent column or Dispatch panel) when the current mode shows one. */
export function InlineSidebar({ nav }: { nav: NavRegistry }) {
  const shell = useShell();
  const colors = useThemeColors();
  const noop = useCallback(() => undefined, []);
  const visible = shell.sidebarMode === 'permanent' || (shell.sidebarMode === 'panel' && shell.isMenuOpen);
  if (!visible) {
    return null;
  }
  const width = shell.sidebarMode === 'permanent' ? PERMANENT_SIDEBAR_WIDTH : PANEL_SIDEBAR_WIDTH;
  return (
    <View
      style={StyleSheet.flatten([styles.inline, { width, backgroundColor: colors.background, borderRightColor: colors.border }])}
      testID={shell.sidebarMode === 'permanent' ? 'shell-sidebar-permanent' : 'shell-sidebar-panel'}
    >
      <SidebarContent nav={nav} onNavigate={noop} />
    </View>
  );
}

/** The modal drawer (drawer mode). */
export function DrawerSidebar({ nav }: { nav: NavRegistry }) {
  const shell = useShell();
  const insets = useSafeAreaInsets();
  if (shell.sidebarMode !== 'drawer') {
    return null;
  }
  return (
    <SideDrawer isOpen={shell.isMenuOpen} onClose={shell.closeMenu} testID="shell-sidebar-drawer">
      <View style={StyleSheet.flatten([styles.drawerBody, { paddingTop: insets.top }])}>
        <SidebarContent nav={nav} onNavigate={shell.closeMenu} />
      </View>
    </SideDrawer>
  );
}

const styles = StyleSheet.create({
  menu: { paddingVertical: 8 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, minHeight: 48 },
  rowIcon: { marginRight: 12 },
  rowLabel: { fontSize: 16, flexShrink: 1 },
  inline: { borderRightWidth: StyleSheet.hairlineWidth },
  drawerBody: { flex: 1 },
});
