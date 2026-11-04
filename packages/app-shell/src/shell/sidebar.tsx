import { getBaseApiUrl, securityStore, useAuthStore } from '@resgrid/auth';
import { Avatar, AvatarFallbackText, AvatarImage, SideDrawer, Text, useThemeColors } from '@resgrid/ui';
import { type Href, usePathname, useRouter } from 'expo-router';
import React, { useCallback } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { useShellTranslation } from '../i18n';
import { type NavRegistry, normalizeHref } from '../nav/define-nav';
import { type NavItem, useNavItems } from '../nav/use-nav-items';
import { type SidebarContentProps, useSidebarContent } from '../runtime/slots';
import { useShell } from './shell-context';
import { PANEL_SIDEBAR_WIDTH, PERMANENT_SIDEBAR_WIDTH } from './sidebar-mode';

function MenuRow({ item, active, onPress }: { item: NavItem; active: boolean; onPress: (item: NavItem) => void }) {
  const colors = useThemeColors();
  const Icon = item.icon;
  const color = active ? colors.primaryStrong : colors.textMuted;
  return (
    <Pressable
      accessibilityRole="menuitem"
      accessibilityState={{ selected: active }}
      onPress={() => onPress(item)}
      style={({ pressed }) => StyleSheet.flatten([styles.row, active ? { backgroundColor: colors.token('primary-500', 0.12) } : pressed ? { backgroundColor: colors.surfaceRaised } : null])}
      testID={item.testID}
    >
      {Icon ? (
        <View style={styles.rowIcon}>
          <Icon size={22} color={color} />
        </View>
      ) : null}
      <Text style={StyleSheet.flatten([styles.rowLabel, { color: active ? colors.primaryStrong : colors.icon }, active ? styles.rowLabelActive : null])} numberOfLines={1}>
        {item.label}
      </Text>
    </Pressable>
  );
}

/** The member's avatar (Core serves a default image when none is uploaded). */
const avatarImageUrl = (userId: string): string => `${getBaseApiUrl()}/Avatars/Get?id=${encodeURIComponent(userId)}`;

/** Who is signed in, to which department: avatar, name and department from the rights DTO. Nothing until rights load. */
export function MenuProfile() {
  const colors = useThemeColors();
  const fullName = securityStore((state) => state.rights?.FullName?.trim() ?? '');
  const departmentName = securityStore((state) => state.rights?.DepartmentName?.trim() ?? '');
  const userId = useAuthStore((state) => state.userId);
  if (!fullName && !departmentName) {
    return null;
  }
  return (
    <View style={StyleSheet.flatten([styles.profile, { borderBottomColor: colors.border }])} testID="shell-nav-profile">
      <Avatar size="md">
        <AvatarFallbackText>{fullName || departmentName}</AvatarFallbackText>
        {userId ? <AvatarImage source={{ uri: avatarImageUrl(userId) }} testID="shell-nav-profile-avatar" /> : null}
      </Avatar>
      <View style={styles.profileText}>
        {fullName ? (
          <Text style={StyleSheet.flatten([styles.profileName, { color: colors.text }])} numberOfLines={1} testID="shell-nav-profile-name">
            {fullName}
          </Text>
        ) : null}
        {departmentName ? (
          <Text style={StyleSheet.flatten([styles.profileDepartment, { color: colors.textMuted }])} numberOfLines={1} testID="shell-nav-profile-department">
            {departmentName}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/** The built-in `menu` sidebar content: the variant's nav entries (tab + sidebar placements), flag/capability filtered. */
export function NavMenu({ nav, onNavigate }: SidebarContentProps & { nav: NavRegistry }) {
  const items = useNavItems(nav, ['tab', 'sidebar']);
  const pathname = normalizeHref(usePathname());
  const router = useRouter();
  const { variant } = useShell();
  const { t } = useShellTranslation();
  const isDrawerStack = variant.shell.kind === 'drawer-slot';

  const onPress = useCallback(
    (item: NavItem) => {
      // The section already showing stays as it is (its search, filters and tab); the menu just closes.
      if (normalizeHref(item.href) === pathname) {
        onNavigate();

        return;
      }

      // The drawer shells keep the screens under the current one mounted. `navigate` pushes, so a menu hop first goes
      // back to the first screen (normally Home, which keeps its tab and list) and opens the section from there: one
      // mounted screen per open section rather than one per hop. Unit and IC switch tabs as before.
      if (isDrawerStack && router.canDismiss()) router.dismissAll();

      router.navigate(item.href as Href);
      onNavigate();
    },
    [isDrawerStack, onNavigate, pathname, router]
  );

  return (
    <ScrollView contentContainerStyle={styles.menu} testID="shell-nav-menu">
      <MenuProfile />
      <View accessibilityRole="menu" accessibilityLabel={t('shell.navigation')}>
        {items.map((item) => (
          <MenuRow key={item.id} item={item} active={normalizeHref(item.href) === pathname} onPress={onPress} />
        ))}
      </View>
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
      style={StyleSheet.flatten([styles.inline, { width, backgroundColor: colors.canvas, borderRightColor: colors.border }])}
      testID={shell.sidebarMode === 'permanent' ? 'shell-sidebar-permanent' : 'shell-sidebar-panel'}
    >
      <SidebarContent nav={nav} onNavigate={noop} />
    </View>
  );
}

/** The modal drawer (drawer mode). */
export function DrawerSidebar({ nav }: { nav: NavRegistry }) {
  const shell = useShell();
  if (shell.sidebarMode !== 'drawer') {
    return null;
  }
  // SideDrawer pads the panel for the safe area; padding again here left an empty band above the menu.
  return (
    <SideDrawer isOpen={shell.isMenuOpen} onClose={shell.closeMenu} testID="shell-sidebar-drawer">
      <View style={styles.drawerBody}>
        <SidebarContent nav={nav} onNavigate={shell.closeMenu} />
      </View>
    </SideDrawer>
  );
}

const styles = StyleSheet.create({
  menu: { paddingVertical: 8 },
  profile: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16, marginBottom: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  profileText: { flex: 1, marginLeft: 12 },
  profileName: { fontSize: 17, fontWeight: '600' },
  profileDepartment: { fontSize: 14, marginTop: 2 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, minHeight: 48 },
  rowIcon: { marginRight: 12 },
  rowLabel: { fontSize: 16, fontWeight: '500', flexShrink: 1 },
  rowLabelActive: { fontWeight: '600' },
  inline: { borderRightWidth: StyleSheet.hairlineWidth },
  drawerBody: { flex: 1 },
});
