import React, { useCallback, useEffect, useRef, useState } from 'react';
import { type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { Box } from './box';
import { ChevronLeft, ChevronRight } from './lucide-icons';
import { Pressable } from './pressable';
import { Text } from './text';
import { useThemeColors } from './theme/use-theme-colors';
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

export type TabTitleFontSize = 'text-2xs' | 'text-xs' | 'text-sm' | 'text-base' | 'text-lg' | 'text-xl';

export interface SharedTabsProps {
  tabs: TabItem[];
  initialIndex?: number;
  /** Controlled active tab. Omit to let the component keep its own state. */
  activeIndex?: number;
  scrollable?: boolean;
  variant?: 'default' | 'pills' | 'underlined' | 'segmented';
  size?: 'sm' | 'md' | 'lg';
  titleFontSize?: TabTitleFontSize;
  /**
   * Root classes. The tabs size to their content by default, which is what a ScrollView needs: there a `flex-1` root has
   * no height to fill and Android squeezed the tab bar to its padding, hiding the labels. Pass `flex-1` to fill a
   * bounded screen (a full-screen tab layout whose content scrolls itself).
   */
  className?: string;
  tabClassName?: string;
  tabsContainerClassName?: string;
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

interface ScrollMetrics {
  contentWidth: number;
  offsetX: number;
  viewportWidth: number;
}

interface OverflowState {
  canScrollLeft: boolean;
  canScrollRight: boolean;
}

const OVERFLOW_TOLERANCE = 2;
const OVERFLOW_INDICATOR_WIDTH = 28;
const MAX_BADGE = 99;

/**
 * Where a chevron press scrolls the bar: one visible width minus both chevrons, so the tab that was cut off at the edge
 * lands fully in view, but never less than half the bar (a narrow bar would otherwise crawl).
 */
const getTabScrollTarget = ({ contentWidth, offsetX, viewportWidth }: ScrollMetrics, direction: -1 | 1): number => {
  const page = Math.max(viewportWidth - 2 * OVERFLOW_INDICATOR_WIDTH, viewportWidth / 2);
  const maxOffset = Math.max(0, contentWidth - viewportWidth);

  return Math.min(maxOffset, Math.max(0, offsetX + direction * page));
};

const getBadgeContainerClassName = (badgeVariant: TabItem['badgeVariant']): string => {
  const backgroundClassName = badgeVariant === 'warning' ? 'bg-warning-500' : 'bg-error-500';
  return `absolute -right-1 -top-1 min-w-[18px] items-center justify-center rounded-full px-1 ${backgroundClassName}`;
};

const getBadgeTextClassName = (badgeVariant: TabItem['badgeVariant']): string => {
  const textClassName = badgeVariant === 'warning' ? 'text-typography-black' : 'text-typography-white';
  return `text-2xs font-bold ${textClassName}`;
};

/**
 * Tab bar + content (merged from Responder and Unit). State is per instance: the legacy apps shared one
 * global zustand store across every SharedTabs on screen, so two tab sets moved together.
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
  tabClassName = '',
  tabsContainerClassName = '',
  contentClassName = '',
  showOverflowIndicators = true,
  keepMounted = true,
  onChange,
}) => {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const [localActiveIndex, setLocalActiveIndex] = useState(initialIndex);
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const currentIndex = activeIndex ?? localActiveIndex;

  // Track which tabs have ever been activated so they can stay mounted.
  const [mountedTabs, setMountedTabs] = useState<Set<number>>(() => new Set([activeIndex ?? initialIndex]));
  if (!mountedTabs.has(currentIndex)) {
    // A controlled index can move without a press; mount the newly active tab in the same render.
    const next = new Set(mountedTabs);
    next.add(currentIndex);
    setMountedTabs(next);
  }

  const scrollViewRef = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const scrollMetricsRef = useRef<ScrollMetrics>({ contentWidth: 0, offsetX: 0, viewportWidth: 0 });
  const [overflowState, setOverflowState] = useState<OverflowState>({ canScrollLeft: false, canScrollRight: false });

  const updateOverflowState = useCallback(() => {
    const { contentWidth, offsetX, viewportWidth } = scrollMetricsRef.current;
    const nextState = {
      canScrollLeft: offsetX > OVERFLOW_TOLERANCE,
      canScrollRight: contentWidth - viewportWidth - offsetX > OVERFLOW_TOLERANCE,
    };

    setOverflowState((currentState) => (currentState.canScrollLeft === nextState.canScrollLeft && currentState.canScrollRight === nextState.canScrollRight ? currentState : nextState));
  }, []);

  // Where each tab of the scrollable bar sits, and which selection the bar last brought into view.
  const tabLayoutsRef = useRef(new Map<number, { x: number; width: number }>());
  const revealedIndexRef = useRef<number | null>(null);

  // Scroll the bar so a tab is in view (centred), once the bar and the tab have been measured.
  const revealTab = useCallback((index: number, animated: boolean) => {
    const layout = tabLayoutsRef.current.get(index);
    const { contentWidth, offsetX, viewportWidth } = scrollMetricsRef.current;

    if (layout === undefined || viewportWidth === 0 || contentWidth === 0) return;

    revealedIndexRef.current = index;

    if (layout.x >= offsetX && layout.x + layout.width <= offsetX + viewportWidth) return;

    const centred = layout.x - (viewportWidth - layout.width) / 2;

    scrollViewRef.current?.scrollTo({ x: Math.min(Math.max(0, contentWidth - viewportWidth), Math.max(0, centred)), animated });
  }, []);

  // A screen can open on a tab further along (Back to a call on its Command tab): when the measurements arrive, show
  // that tab instead of the start of the bar. A resize or rotation that narrows the bar or moves the selected tab
  // (`moved`) can leave it out of view, so it is shown again; passes that measure the same leave a bar the user has
  // scrolled alone.
  const revealPendingTab = useCallback(
    (moved = false) => {
      if (moved || revealedIndexRef.current !== currentIndex) revealTab(currentIndex, false);
    },
    [currentIndex, revealTab]
  );

  useEffect(() => {
    if (revealedIndexRef.current !== currentIndex) revealTab(currentIndex, revealedIndexRef.current !== null);
  }, [currentIndex, revealTab]);

  const handleTabLayout = (index: number, event: LayoutChangeEvent) => {
    const { x, width } = event.nativeEvent.layout;
    const previous = tabLayoutsRef.current.get(index);

    tabLayoutsRef.current.set(index, { x, width });
    revealPendingTab(index === currentIndex && previous !== undefined && (previous.x !== x || previous.width !== width));
  };

  const handleScrollViewLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const previousWidth = scrollMetricsRef.current.viewportWidth;

      scrollMetricsRef.current.viewportWidth = event.nativeEvent.layout.width;
      updateOverflowState();
      revealPendingTab(previousWidth !== 0 && previousWidth !== event.nativeEvent.layout.width);
    },
    [revealPendingTab, updateOverflowState]
  );

  const handleContentSizeChange = useCallback(
    (contentWidth: number) => {
      scrollMetricsRef.current.contentWidth = contentWidth;
      updateOverflowState();
      revealPendingTab();
    },
    [revealPendingTab, updateOverflowState]
  );

  const handleHeaderScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      scrollMetricsRef.current.offsetX = Math.max(0, event.nativeEvent.contentOffset.x);
      updateOverflowState();
    },
    [updateOverflowState]
  );

  // The scroll events this animates update the offset and the chevrons, as a swipe does.
  const scrollTabs = useCallback((direction: -1 | 1) => {
    scrollViewRef.current?.scrollTo({ x: getTabScrollTarget(scrollMetricsRef.current, direction), animated: true });
  }, []);

  const handleTabPress = useCallback(
    (index: number) => {
      if (activeIndex === undefined) {
        setLocalActiveIndex(index);
      }
      onChange?.(index);
    },
    [activeIndex, onChange]
  );

  // Pills and segmented tabs fill the active tab with primary, so its label and icon go white.
  const isFilledActive = (index: number) => index === currentIndex && (variant === 'pills' || variant === 'segmented');

  const getTitleFontSize = (): TabTitleFontSize => {
    if (titleFontSize) {
      return titleFontSize;
    }
    const defaults: Record<NonNullable<SharedTabsProps['size']>, TabTitleFontSize> = {
      sm: isLandscape ? 'text-xs' : 'text-2xs',
      md: isLandscape ? 'text-sm' : 'text-xs',
      lg: isLandscape ? 'text-base' : 'text-sm',
    };
    return defaults[size];
  };

  const getTitleClassName = (index: number) => {
    const isActive = index === currentIndex;
    const weight = isActive ? 'font-semibold' : 'font-medium';
    if (variant === 'segmented' || variant === 'pills') {
      return `${getTitleFontSize()} ${weight} ${isActive ? 'text-typography-0' : 'text-typography-600'}`;
    }
    return `${getTitleFontSize()} ${weight} ${isActive ? 'text-primary-600' : 'text-typography-500'}`;
  };

  // Tab icons are usually raw lucide icons, whose default stroke is black; give them the label colour unless the caller chose one.
  const renderIcon = (icon: React.ReactNode, index: number) => {
    if (!React.isValidElement<{ color?: string }>(icon) || icon.props.color !== undefined) return icon;
    const color = isFilledActive(index) ? colors.textInverse : index === currentIndex ? colors.primaryStrong : colors.textMuted;
    return React.cloneElement(icon, { color });
  };

  const getTabStyles = (index: number) => {
    const isActive = index === currentIndex;
    const baseStyles = 'flex-row items-center justify-center relative';
    const sizeStyles = {
      sm: variant === 'segmented' ? (isLandscape ? 'px-3 py-1.5' : 'px-3 py-1') : isLandscape ? 'px-3 py-1.5' : 'px-2 py-1',
      md: variant === 'segmented' ? (isLandscape ? 'px-4 py-2.5' : 'px-4 py-2') : isLandscape ? 'px-4 py-2' : 'px-3 py-1.5',
      lg: variant === 'segmented' ? (isLandscape ? 'px-5 py-3' : 'px-4 py-2.5') : isLandscape ? 'px-5 py-2.5' : 'px-4 py-2',
    }[size];
    const variantStyles = {
      default: isActive ? 'border-b-2 border-primary-600' : 'border-b-2 border-transparent',
      pills: isActive ? 'bg-primary-600 rounded-full' : 'bg-transparent',
      underlined: isActive ? 'border-b-2 border-primary-600' : 'border-b-2 border-transparent',
      segmented: isActive ? 'bg-primary-600 rounded-xl shadow-sm' : 'bg-transparent rounded-xl',
    }[variant];

    return `${baseStyles} ${sizeStyles} ${variantStyles} ${tabClassName}`;
  };

  const getContainerClassName = () => {
    const variantStyles = {
      default: 'border-b border-outline-200',
      pills: 'p-1',
      underlined: 'border-b border-outline-200',
      segmented: 'rounded-2xl border border-outline-200 bg-background-100 p-1.5',
    }[variant];
    return `flex flex-row ${variantStyles} ${tabsContainerClassName}`;
  };

  // The scrollable bar's content container takes a style, not a className.
  const containerStyle = StyleSheet.flatten([
    styles.scrollContent,
    variant === 'default' || variant === 'underlined' ? { borderBottomWidth: 1, borderBottomColor: colors.border } : null,
    variant === 'pills' ? styles.pillsContent : null,
    variant === 'segmented' ? { backgroundColor: colors.surfaceRaised, padding: 6, borderRadius: 16, borderWidth: 1, borderColor: colors.border } : null,
  ]);

  const renderBadge = (tab: TabItem) =>
    tab.badge !== undefined && tab.badge > 0 ? (
      <Box testID={`shared-tab-${tab.key}-badge`} className={getBadgeContainerClassName(tab.badgeVariant)} style={styles.badge}>
        <Text className={getBadgeTextClassName(tab.badgeVariant)} numberOfLines={1}>
          {tab.badge > MAX_BADGE ? `${MAX_BADGE}+` : tab.badge}
        </Text>
      </Box>
    ) : null;

  const renderTabInner = (tab: TabItem, index: number) => (
    <Box className="flex-row items-center justify-center">
      {tab.icon ? <Box className={isLandscape ? 'mr-1.5' : 'mr-1'}>{renderIcon(tab.icon, index)}</Box> : null}
      <Text className={getTitleClassName(index)} numberOfLines={1} style={styles.tabLabel}>
        {typeof tab.title === 'string' ? t(tab.title) : tab.title}
      </Text>
    </Box>
  );

  const renderTab = (tab: TabItem, index: number, fill: boolean) => {
    const isActive = index === currentIndex;
    return (
      <Pressable
        key={tab.key}
        testID={`shared-tab-${tab.key}`}
        accessibilityRole="tab"
        accessibilityState={{ selected: isActive }}
        className={fill ? `flex-1 ${getTabStyles(index)}` : getTabStyles(index)}
        style={fill ? undefined : styles.scrollableTab}
        onLayout={fill ? undefined : (event: LayoutChangeEvent) => handleTabLayout(index, event)}
        onPress={() => handleTabPress(index)}
      >
        {renderTabInner(tab, index)}
        {renderBadge(tab)}
      </Pressable>
    );
  };

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
      {scrollable ? (
        <View style={styles.scrollWrapper}>
          <ScrollView
            ref={scrollViewRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.scrollView}
            contentContainerStyle={containerStyle}
            onLayout={handleScrollViewLayout}
            onContentSizeChange={handleContentSizeChange}
            onScroll={handleHeaderScroll}
            scrollEventThrottle={16}
            accessibilityRole="tablist"
            testID="shared-tabs-scroll-view"
          >
            {tabs.map((tab, index) => renderTab(tab, index, false))}
          </ScrollView>

          {showOverflowIndicators && overflowState.canScrollLeft ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('common.scroll_tabs_left', { defaultValue: 'Scroll tabs left' })}
              onPress={() => scrollTabs(-1)}
              testID="shared-tabs-left-overflow"
              style={StyleSheet.flatten([styles.overflowIndicator, styles.overflowLeft, { backgroundColor: colors.token('background-0', 0.95) }])}
            >
              <ChevronLeft size={20} color={colors.icon} />
            </Pressable>
          ) : null}

          {showOverflowIndicators && overflowState.canScrollRight ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('common.scroll_tabs_right', { defaultValue: 'Scroll tabs right' })}
              onPress={() => scrollTabs(1)}
              testID="shared-tabs-right-overflow"
              style={StyleSheet.flatten([styles.overflowIndicator, styles.overflowRight, { backgroundColor: colors.token('background-0', 0.95) }])}
            >
              <ChevronRight size={20} color={colors.icon} />
            </Pressable>
          ) : null}
        </View>
      ) : (
        <Box className={getContainerClassName()} accessibilityRole="tablist">
          {tabs.map((tab, index) => renderTab(tab, index, true))}
        </Box>
      )}

      <Box className={`flex-1 ${contentClassName}`}>{renderContent()}</Box>
    </Box>
  );
};

const styles = StyleSheet.create({
  scrollWrapper: { position: 'relative' },
  scrollView: { width: '100%' },
  // Let the tab row (and its bottom border) stretch to at least the full bar width.
  scrollContent: { flexDirection: 'row', flexGrow: 1, paddingTop: 8, overflow: 'visible' },
  pillsContent: { padding: 4, paddingTop: 12 },
  scrollableTab: { flexShrink: 0, marginRight: 4 },
  tabLabel: { flexShrink: 0 },
  badge: { minHeight: 18, zIndex: 1 },
  overflowIndicator: { position: 'absolute', top: 0, bottom: 0, width: OVERFLOW_INDICATOR_WIDTH, alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  overflowLeft: { left: 0 },
  overflowRight: { right: 0 },
  activeContent: { flex: 1 },
  // display:'none' hides the view and removes it from layout without unmounting.
  hiddenContent: { display: 'none' },
});
