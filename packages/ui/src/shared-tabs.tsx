import React, { useCallback, useMemo, useState } from 'react';
import { type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native';

import { Box } from './box';
import { TabBar, type TabBarItem, type TabBarSize, type TabBarVariant, type TabTitleFontSize } from './tab-bar';
import { useTranslation } from './utils/i18n';

export interface TabItem {
  key: string;
  /** A translation key (run through t()) or a node rendered as is. */
  title: string | React.ReactNode;
  content: React.ReactNode;
  icon?: React.ReactNode;
  badge?: number;
  badgeVariant?: 'critical' | 'warning';
}

export interface SharedTabsProps {
  tabs: TabItem[];
  initialIndex?: number;
  /** Controlled active tab. Omit to let the component keep its own state. */
  activeIndex?: number;
  scrollable?: boolean;
  /** `pills` for the tabs at the top of a top-level page; see `TabBar`. */
  variant?: TabBarVariant;
  size?: TabBarSize;
  titleFontSize?: TabTitleFontSize;
  /**
   * Root classes. The tabs size to their content by default, which is what a ScrollView needs: there a `flex-1` root has
   * no height to fill. Pass `flex-1` to fill a bounded screen (a full-screen tab layout whose content scrolls itself).
   */
  className?: string;
  /** Extra style for every tab button (e.g. a 44 dp touch target). The bar takes styles, not classes: see BAR LAYOUT. */
  tabStyle?: StyleProp<ViewStyle>;
  /** Extra style for the bar (margins). */
  tabsContainerStyle?: StyleProp<ViewStyle>;
  contentClassName?: string;
  /** Edge chevron buttons that show more tabs are scrolled off-screen and page the bar towards them (scrollable bar only). */
  showOverflowIndicators?: boolean;
  /**
   * Keep visited tabs mounted (hidden with display:none) so their state survives switching back —
   * and NativeWind never has to re-upgrade them on revisit. Set false to render only the active tab.
   */
  keepMounted?: boolean;
  onChange?: (index: number) => void;
}

/**
 * Tab bar + content (merged from Responder and Unit). State is per instance: the legacy apps shared one
 * global zustand store across every SharedTabs on screen, so two tab sets moved together. The bar is `TabBar`.
 */
export const SharedTabs: React.FC<SharedTabsProps> = ({
  tabs,
  initialIndex = 0,
  activeIndex,
  scrollable = true,
  variant = 'default',
  size = 'md',
  titleFontSize,
  className = '',
  tabStyle,
  tabsContainerStyle,
  contentClassName = '',
  showOverflowIndicators = true,
  keepMounted = true,
  onChange,
}) => {
  const { t } = useTranslation();
  const [localActiveIndex, setLocalActiveIndex] = useState(initialIndex);
  const currentIndex = activeIndex ?? localActiveIndex;

  // Track which tabs have ever been activated so they can stay mounted.
  const [mountedTabs, setMountedTabs] = useState<Set<number>>(() => new Set([activeIndex ?? initialIndex]));

  if (!mountedTabs.has(currentIndex)) {
    // A controlled index can move without a press; mount the newly active tab in the same render.
    const next = new Set(mountedTabs);
    next.add(currentIndex);
    setMountedTabs(next);
  }

  const barTabs = useMemo<TabBarItem[]>(
    () =>
      tabs.map((tab) => ({
        key: tab.key,
        label: typeof tab.title === 'string' ? t(tab.title) : tab.title,
        icon: tab.icon,
        badge: tab.badge,
        badgeVariant: tab.badgeVariant,
        testID: `shared-tab-${tab.key}`,
      })),
    [t, tabs]
  );

  const handleChange = useCallback(
    (_key: string, index: number) => {
      if (activeIndex === undefined) {
        setLocalActiveIndex(index);
      }

      onChange?.(index);
    },
    [activeIndex, onChange]
  );

  const renderContent = () => {
    if (!keepMounted) {
      return tabs[currentIndex]?.content ?? null;
    }

    return tabs.map((tab, index) =>
      mountedTabs.has(index) ? (
        <View key={tab.key} style={index === currentIndex ? styles.activeContent : styles.hiddenContent} testID={`shared-tab-content-${tab.key}`}>
          {tab.content}
        </View>
      ) : null
    );
  };

  return (
    <Box className={className} testID="shared-tabs">
      <TabBar
        tabs={barTabs}
        activeKey={tabs[currentIndex]?.key}
        onChange={handleChange}
        scrollable={scrollable}
        variant={variant}
        size={size}
        titleFontSize={titleFontSize}
        tabStyle={tabStyle}
        style={tabsContainerStyle}
        showOverflowIndicators={showOverflowIndicators}
        testID="shared-tabs-bar"
      />

      <Box className={`flex-1 ${contentClassName}`}>{renderContent()}</Box>
    </Box>
  );
};

const styles = StyleSheet.create({
  activeContent: { flex: 1 },
  // display:'none' hides the view and removes it from layout without unmounting.
  hiddenContent: { display: 'none' },
});
