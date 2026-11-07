import { useTerm } from '@resgrid/auth';
import { type NavBadgeKey, useBadgeCountLookup, useBadgeCountsStore } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import { contentOnFill, formatBadgeCount, useAppBarTitle, useFormFactor, useThemeColors } from '@resgrid/ui';
import { Tabs, usePathname } from 'expo-router';
import type { LucideIcon } from 'lucide-react-native';
import { Car, House, Phone, User } from 'lucide-react-native';
import React, { useEffect } from 'react';
import { type ColorValue, StyleSheet, View } from 'react-native';

import { MEMBER_HOME_ROUTE_PATTERNS } from '../routes';

export interface MemberHomeTab {
  /** Child route name inside the `home` folder. */
  name: 'index' | 'personnel' | 'units' | 'calls';
  labelKey: string;
  /** Department terminology key (the department's own word wins). */
  termKey?: string;
  icon: LucideIcon;
  testID: string;
  /** Count badge on the tab (the shared badge counts store). */
  badge?: NavBadgeKey;
}

/** Responder's nested home tabs (plan Appendix A: home, personnel, units, calls), in order. */
export const MEMBER_HOME_TABS: readonly MemberHomeTab[] = [
  { name: 'index', labelKey: 'tabs.home', icon: House, testID: 'home-status-tab' },
  { name: 'personnel', labelKey: 'tabs.personnel', termKey: 'module.personnel', icon: User, testID: 'home-people-tab' },
  { name: 'units', labelKey: 'units.title', termKey: 'module.units', icon: Car, testID: 'home-units-tab' },
  { name: 'calls', labelKey: 'tabs.calls', termKey: 'module.calls', icon: Phone, testID: 'home-calls-tab', badge: 'calls' },
];

/** The counts these tabs show; the shell's nav does not list the nested tabs, so the layout asks for them itself. */
const TAB_BADGES: readonly NavBadgeKey[] = MEMBER_HOME_TABS.flatMap((tab) => (tab.badge ? [tab.badge] : []));

/** Each nested tab's path: the shell's nav knows only `/home`, so it would title every tab "Home". */
const TAB_PATHS: Record<MemberHomeTab['name'], string> = {
  index: MEMBER_HOME_ROUTE_PATTERNS.home,
  personnel: MEMBER_HOME_ROUTE_PATTERNS.personnel,
  units: MEMBER_HOME_ROUTE_PATTERNS.units,
  calls: MEMBER_HOME_ROUTE_PATTERNS.calls,
};

const TabIcon: React.FC<{ icon: LucideIcon; color: ColorValue }> = ({ icon: Icon, color }) => (
  // lucide icons never receive `style` (web/Electron): the box carries the size.
  <View style={styles.icon}>
    <Icon size={22} color={String(color)} />
  </View>
);

/**
 * The `home` folder's layout (`variants/responder/app/(app)/home/_layout.tsx` re-exports it): bottom tabs for the member
 * home and the shared personnel, units and calls lists. The parent shell owns the header; the personnel, units and calls
 * tabs give it their title (the home tab keeps the shell's).
 */
export function MemberHomeTabsLayout() {
  const { t } = useTranslation();
  const { isLandscape } = useFormFactor();
  const colors = useThemeColors();
  // Open calls on the Calls tab, as Unit and IC show them on theirs.
  const badgeCount = useBadgeCountLookup();

  useEffect(() => {
    void useBadgeCountsStore.getState().requestBadgeCounts(TAB_BADGES);
  }, []);

  const personnelTitle = useTerm('module.personnel', t('tabs.personnel'));
  const unitsTitle = useTerm('module.units', t('units.title'));
  const callsTitle = useTerm('module.calls', t('tabs.calls'));
  const titles: Record<MemberHomeTab['name'], string> = { index: t('tabs.home'), personnel: personnelTitle, units: unitsTitle, calls: callsTitle };
  const pathname = usePathname();
  const focusedTab = MEMBER_HOME_TABS.find((tab) => tab.name !== 'index' && TAB_PATHS[tab.name] === pathname);

  useAppBarTitle(focusedTab ? titles[focusedTab.name] : null);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: true,
        tabBarLabelStyle: { fontSize: isLandscape ? 12 : 10, fontWeight: '500' },
        tabBarStyle: { paddingBottom: 5, paddingTop: 5, height: isLandscape ? 65 : 60 },
      }}
    >
      {MEMBER_HOME_TABS.map((tab) => {
        const badge = badgeCount(tab.badge);

        return (
          <Tabs.Screen
            key={tab.name}
            name={tab.name}
            options={{
              title: titles[tab.name],
              tabBarIcon: ({ color }) => <TabIcon icon={tab.icon} color={color} />,
              tabBarButtonTestID: tab.testID,
              tabBarBadge: badge ? formatBadgeCount(badge) : undefined,
              tabBarBadgeStyle: { backgroundColor: colors.error, color: contentOnFill(colors.error) },
              tabBarAccessibilityLabel: badge ? t('shell.nav_item_with_count', { label: titles[tab.name], count: badge }) : titles[tab.name],
            }}
          />
        );
      })}
    </Tabs>
  );
}

export default MemberHomeTabsLayout;

const styles = StyleSheet.create({
  icon: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
});
