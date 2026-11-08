import React, { useCallback, useEffect, useRef } from 'react';
import { type LayoutChangeEvent, Pressable, ScrollView, type StyleProp, StyleSheet, Text, type TextStyle, useWindowDimensions, View, type ViewStyle } from 'react-native';

import { formatBadgeCount } from './count-badge';
import { EdgeChevrons, useEdgeScroll } from './edge-scroll';
import { type ThemeColors, useThemeColors } from './theme/use-theme-colors';
import { useTranslation } from './utils/i18n';
import { useWheelScrollsSideways } from './wheel-scroll';

/**
 * - `pills`: the tab strip at the top of a top-level page (Shifts, Calls, Messages, Calendar, Checklists, Routes, IC's
 *   command switcher, weather alerts): bordered pills on a full-width strip.
 * - `underlined` / `default`: an underlined row (a detail screen's sections, e.g. a call's tabs).
 * - `segmented`: a filled segmented control (the member home's Status / Staffing / Call switch, which stays one).
 */
export type TabBarVariant = 'default' | 'pills' | 'underlined' | 'segmented';

export type TabBarSize = 'sm' | 'md' | 'lg';

export type TabTitleFontSize = 'text-2xs' | 'text-xs' | 'text-sm' | 'text-base' | 'text-lg' | 'text-xl';

export interface TabBarItem<K extends string = string> {
  key: K;
  /** Shown as given: translate it first. */
  label: React.ReactNode;
  icon?: React.ReactNode;
  /** A count beside the label; hidden at 0. */
  badge?: number;
  badgeVariant?: 'critical' | 'warning';
  /** Read instead of the label (e.g. "Trades, 2 pending"). */
  accessibilityLabel?: string;
  accessibilityHint?: string;
  /** Defaults to `<bar testID>-tab-<key>`; the label and badge add `-label` and `-badge`. */
  testID?: string;
}

export interface TabBarProps<K extends string = string> {
  tabs: readonly TabBarItem<K>[];
  /** The selected tab; a key not in `tabs` selects none. */
  activeKey: K | null | undefined;
  onChange: (key: K, index: number) => void;
  /** Scroll sideways when the tabs do not fit (default), or share the width equally. */
  scrollable?: boolean;
  variant?: TabBarVariant;
  size?: TabBarSize;
  titleFontSize?: TabTitleFontSize;
  /** Extra style for every tab button (e.g. a 44 dp touch target). The bar takes styles, not classes: see BAR LAYOUT. */
  tabStyle?: StyleProp<ViewStyle>;
  /** Extra style for the bar (margins). */
  style?: StyleProp<ViewStyle>;
  /** Edge chevron buttons that show more tabs are scrolled off-screen and page the bar towards them (scrollable bar only). */
  showOverflowIndicators?: boolean;
  /** Names the tab list for screen readers. */
  accessibilityLabel?: string;
  /** The bar; its scroller and chevrons add `-scroll-view`, `-left-overflow` and `-right-overflow`. */
  testID?: string;
}

/*
 * BAR LAYOUT: the tab bar is plain React Native styles, with no className anywhere inside it. Through the class layer
 * the labels' line height is resolved at run time from CSS variables (`text-xs` is `var(--tw-leading, …)` times the
 * em size), and the active tab adds and drops variable-setting classes (`shadow-sm`, font weight) on every selection.
 * On Android devices, from a cold start, that left Responder's Status/Staffing bar collapsed to its padding with the
 * labels drawn about 1 px tall (twice, after a root `flex-1` fix). Fixed numbers lay out the same on every platform:
 * native uses `inlineRem: 16`, the browser's rem, so these are the values the classes produced.
 */

/** Font size and an explicit line height per title size; the tab's minimum height is built from the line height. */
const TITLE_METRICS: Record<TabTitleFontSize, { fontSize: number; lineHeight: number }> = {
  'text-2xs': { fontSize: 10, lineHeight: 14 },
  'text-xs': { fontSize: 12, lineHeight: 16 },
  'text-sm': { fontSize: 14, lineHeight: 20 },
  'text-base': { fontSize: 16, lineHeight: 24 },
  'text-lg': { fontSize: 18, lineHeight: 28 },
  'text-xl': { fontSize: 20, lineHeight: 28 },
};

const DEFAULT_TITLE_SIZE: Record<TabBarSize, { portrait: TabTitleFontSize; landscape: TabTitleFontSize }> = {
  sm: { portrait: 'text-2xs', landscape: 'text-xs' },
  md: { portrait: 'text-xs', landscape: 'text-sm' },
  lg: { portrait: 'text-sm', landscape: 'text-base' },
};

/** Page pills keep one readable size in both orientations. */
const PILL_TITLE_SIZE: Record<TabBarSize, TabTitleFontSize> = { sm: 'text-xs', md: 'text-sm', lg: 'text-base' };

/** Tab padding [horizontal, vertical]: segmented tabs are a little roomier than the underlined ones. */
const TAB_PADDING: Record<TabBarSize, { segmented: { portrait: [number, number]; landscape: [number, number] }; other: { portrait: [number, number]; landscape: [number, number] } }> = {
  sm: { segmented: { portrait: [12, 4], landscape: [12, 6] }, other: { portrait: [8, 4], landscape: [12, 6] } },
  md: { segmented: { portrait: [16, 8], landscape: [16, 10] }, other: { portrait: [12, 6], landscape: [16, 8] } },
  lg: { segmented: { portrait: [16, 10], landscape: [20, 12] }, other: { portrait: [16, 8], landscape: [20, 10] } },
};

/** Page pills: padding [horizontal, vertical] and a touch-friendly minimum height. */
const PILL_LAYOUT: Record<TabBarSize, { padding: [number, number]; minHeight: number }> = {
  sm: { padding: [12, 6], minHeight: 32 },
  md: { padding: [16, 8], minHeight: 40 },
  lg: { padding: [20, 10], minHeight: 48 },
};

const PILL_GAP = 8;
const PILL_BORDER_WIDTH = 1;
const ACTIVE_WEIGHT: TextStyle['fontWeight'] = '600';
const INACTIVE_WEIGHT: TextStyle['fontWeight'] = '500';
const BADGE_TEXT_ON_WARNING = '#111827';
const BADGE_TEXT_ON_ERROR = '#ffffff';

/**
 * A fixed bar shares its width equally, so a label longer than its share (a long translation, large system text at
 * 320 dp) shrinks and wraps onto a second line inside its own tab instead of running over the next one.
 */
const FIXED_TAB_LABEL_LINES = 2;

/** Pills and segmented tabs fill the active tab with primary. */
const isFilledVariant = (variant: TabBarVariant): boolean => variant === 'pills' || variant === 'segmented';

const getTitleSize = (variant: TabBarVariant, size: TabBarSize, isLandscape: boolean): TabTitleFontSize => (variant === 'pills' ? PILL_TITLE_SIZE[size] : DEFAULT_TITLE_SIZE[size][isLandscape ? 'landscape' : 'portrait']);

const getTabLayoutStyle = (variant: TabBarVariant, size: TabBarSize, isLandscape: boolean, lineHeight: number): ViewStyle => {
  if (variant === 'pills') {
    const { padding, minHeight } = PILL_LAYOUT[size];

    return { paddingHorizontal: padding[0], paddingVertical: padding[1], minHeight: Math.max(minHeight, lineHeight + padding[1] * 2 + PILL_BORDER_WIDTH * 2), borderWidth: PILL_BORDER_WIDTH };
  }

  const padding = TAB_PADDING[size][variant === 'segmented' ? 'segmented' : 'other'][isLandscape ? 'landscape' : 'portrait'];
  const borderBottomWidth = variant === 'default' || variant === 'underlined' ? 2 : 0;

  // The floor is the tab's own content height, so a label that measures short can never collapse the bar.
  return { paddingHorizontal: padding[0], paddingVertical: padding[1], minHeight: lineHeight + padding[1] * 2 + borderBottomWidth, borderBottomWidth };
};

const getTabStateStyle = (variant: TabBarVariant, isActive: boolean, colors: ThemeColors): ViewStyle => {
  if (variant === 'pills') {
    return { backgroundColor: isActive ? colors.primaryStrong : colors.background, borderColor: isActive ? colors.primaryStrong : colors.borderStrong, borderRadius: 9999 };
  }

  if (variant === 'segmented') return { backgroundColor: isActive ? colors.primaryStrong : 'transparent', borderRadius: 12 };

  return { borderBottomColor: isActive ? colors.primaryStrong : 'transparent' };
};

const getLabelColor = (variant: TabBarVariant, isActive: boolean, colors: ThemeColors): string => {
  if (variant === 'pills') return isActive ? colors.textInverse : colors.token('typography-800');

  if (isFilledVariant(variant)) return isActive ? colors.textInverse : colors.textMuted;

  return isActive ? colors.primaryStrong : colors.token('typography-500');
};

/** The bar's own surface: the page strip is a full-width band (its chevrons sit on the same colour). */
const getBarSurfaceStyle = (variant: TabBarVariant, colors: ThemeColors): ViewStyle | null => (variant === 'pills' ? { backgroundColor: colors.background, borderBottomWidth: 1, borderBottomColor: colors.border } : null);

/** The row the tabs sit in. */
const getRowStyle = (variant: TabBarVariant, colors: ThemeColors): ViewStyle => {
  if (variant === 'segmented') return { padding: 6, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceRaised };

  if (variant === 'pills') return { paddingHorizontal: 16, paddingVertical: 8 };

  return { borderBottomWidth: 1, borderBottomColor: colors.border };
};

interface BadgeColors {
  background: string;
  text: string;
}

const getBadgeColors = (variant: TabBarVariant, isActive: boolean, badgeVariant: TabBarItem['badgeVariant'], colors: ThemeColors): BadgeColors => {
  // On a filled page pill a red badge would sit on primary; it turns into a light chip instead.
  if (variant === 'pills' && isActive) return { background: colors.background, text: colors.token('typography-800') };

  return badgeVariant === 'warning' ? { background: colors.warning, text: BADGE_TEXT_ON_WARNING } : { background: colors.error, text: BADGE_TEXT_ON_ERROR };
};

/**
 * A row of tabs: the bar of `SharedTabs`, and on its own the strip at the top of a top-level page whose content the
 * screen renders itself (`variant="pills"`). A scrollable bar keeps the selected tab in view and shows edge chevrons
 * whenever tabs run off either side, so a phone never hides tabs without a hint; a chevron pages the bar that way. A
 * finger swipes it, and on web and Electron a mouse wheel scrolls it too.
 */
export function TabBar<K extends string>({
  tabs,
  activeKey,
  onChange,
  scrollable = true,
  variant = 'default',
  size = 'md',
  titleFontSize,
  tabStyle,
  style,
  showOverflowIndicators = true,
  accessibilityLabel,
  testID = 'tab-bar',
}: TabBarProps<K>) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const currentIndex = tabs.findIndex((tab) => tab.key === activeKey);

  // Which edges hide tabs (the chevrons), and the bar's measurements for bringing the selected tab into view.
  const edge = useEdgeScroll();
  const { scrollViewRef, metricsRef } = edge;

  // Web and Electron: a mouse wheel over the bar scrolls it sideways too.
  useWheelScrollsSideways(scrollViewRef, scrollable);

  // Where each tab of the scrollable bar sits, and which selection the bar last brought into view.
  const tabLayoutsRef = useRef(new Map<number, { x: number; width: number }>());
  const revealedIndexRef = useRef<number | null>(null);

  // Scroll the bar so a tab is in view (centred), once the bar and the tab have been measured.
  const revealTab = useCallback(
    (index: number, animated: boolean) => {
      const layout = tabLayoutsRef.current.get(index);
      const { contentWidth, offsetX, viewportWidth } = metricsRef.current;

      if (layout === undefined || viewportWidth === 0 || contentWidth === 0) return;

      revealedIndexRef.current = index;

      if (layout.x >= offsetX && layout.x + layout.width <= offsetX + viewportWidth) return;

      const centred = layout.x - (viewportWidth - layout.width) / 2;

      scrollViewRef.current?.scrollTo({ x: Math.min(Math.max(0, contentWidth - viewportWidth), Math.max(0, centred)), animated });
    },
    [metricsRef, scrollViewRef]
  );

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
    const { x, width: tabWidth } = event.nativeEvent.layout;
    const previous = tabLayoutsRef.current.get(index);

    tabLayoutsRef.current.set(index, { x, width: tabWidth });
    revealPendingTab(index === currentIndex && previous !== undefined && (previous.x !== x || previous.width !== tabWidth));
  };

  const { onLayout: trackLayout, onContentSizeChange: trackContentSize } = edge;

  const handleScrollViewLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const previousWidth = metricsRef.current.viewportWidth;

      trackLayout(event);
      revealPendingTab(previousWidth !== 0 && previousWidth !== event.nativeEvent.layout.width);
    },
    [metricsRef, revealPendingTab, trackLayout]
  );

  const handleContentSizeChange = useCallback(
    (contentWidth: number) => {
      trackContentSize(contentWidth);
      revealPendingTab();
    },
    [revealPendingTab, trackContentSize]
  );

  // Pills and segmented tabs fill the active tab with primary, so its label and icon go white.
  const isFilledActive = (index: number) => index === currentIndex && isFilledVariant(variant);

  const titleMetrics = TITLE_METRICS[titleFontSize ?? getTitleSize(variant, size, isLandscape)];
  const tabLayoutStyle = getTabLayoutStyle(variant, size, isLandscape, titleMetrics.lineHeight);
  const isPills = variant === 'pills';

  // Tab icons are usually raw lucide icons, whose default stroke is black; give them the label colour unless the caller chose one.
  const renderIcon = (icon: React.ReactNode, index: number) => {
    if (!React.isValidElement<{ color?: string }>(icon) || icon.props.color !== undefined) return icon;

    const color = isFilledActive(index) ? colors.textInverse : index === currentIndex ? colors.primaryStrong : colors.textMuted;

    return React.cloneElement(icon, { color });
  };

  const tabTestID = (tab: TabBarItem<K>) => tab.testID ?? `${testID}-tab-${tab.key}`;

  // Page pills carry the count inline after the label; the other bars pin it to the tab's corner.
  const renderBadge = (tab: TabBarItem<K>, isActive: boolean) => {
    if (tab.badge === undefined || tab.badge <= 0) return null;

    const badgeColors = getBadgeColors(variant, isActive, tab.badgeVariant, colors);

    return (
      <View testID={`${tabTestID(tab)}-badge`} style={StyleSheet.flatten([isPills ? styles.inlineBadge : styles.cornerBadge, { backgroundColor: badgeColors.background }])}>
        <Text numberOfLines={1} style={StyleSheet.flatten([isPills ? styles.inlineBadgeText : styles.cornerBadgeText, { color: badgeColors.text }])}>
          {formatBadgeCount(tab.badge)}
        </Text>
      </View>
    );
  };

  const renderTab = (tab: TabBarItem<K>, index: number, fill: boolean) => {
    const isActive = index === currentIndex;
    const id = tabTestID(tab);
    // Pills are spaced apart; an underlined row keeps its tabs 4 apart only while it scrolls (a fixed row shares the width).
    const spacing = isPills ? (index < tabs.length - 1 ? styles.pillGap : null) : fill ? null : styles.underTabGap;

    const labelStyle = StyleSheet.flatten([
      styles.tabLabel,
      fill ? styles.fixedTabShrink : null,
      { fontSize: titleMetrics.fontSize, lineHeight: titleMetrics.lineHeight, fontWeight: isActive ? ACTIVE_WEIGHT : INACTIVE_WEIGHT, color: getLabelColor(variant, isActive, colors) },
    ]);

    return (
      <Pressable
        key={tab.key}
        testID={id}
        accessibilityRole="tab"
        accessibilityState={{ selected: isActive }}
        accessibilityLabel={tab.accessibilityLabel}
        accessibilityHint={tab.accessibilityHint}
        style={StyleSheet.flatten([styles.tab, fill ? styles.fixedTab : styles.scrollableTab, spacing, tabLayoutStyle, getTabStateStyle(variant, isActive, colors), tabStyle])}
        onLayout={fill ? undefined : (event: LayoutChangeEvent) => handleTabLayout(index, event)}
        onPress={() => onChange(tab.key, index)}
      >
        <View style={fill ? FIXED_TAB_INNER : styles.tabInner}>
          {tab.icon ? <View style={isLandscape ? styles.iconLandscape : styles.icon}>{renderIcon(tab.icon, index)}</View> : null}
          <Text numberOfLines={fill ? FIXED_TAB_LABEL_LINES : 1} style={labelStyle} testID={`${id}-label`}>
            {tab.label}
          </Text>
        </View>
        {renderBadge(tab, isActive)}
      </Pressable>
    );
  };

  const surfaceStyle = getBarSurfaceStyle(variant, colors);
  const rowStyle = getRowStyle(variant, colors);

  if (!scrollable) {
    return (
      <View style={StyleSheet.flatten([styles.fixedBar, surfaceStyle, rowStyle, style])} accessibilityRole="tablist" accessibilityLabel={accessibilityLabel} testID={testID}>
        {tabs.map((tab, index) => renderTab(tab, index, true))}
      </View>
    );
  }

  // The chevrons sit on the bar's own surface so a cut-off tab shows under them as a hint too.
  const chevronBackground = surfaceStyle?.backgroundColor ?? colors.token('background-0', 0.95);

  return (
    <View style={StyleSheet.flatten([styles.scrollWrapper, surfaceStyle, style])} testID={testID}>
      <ScrollView
        ref={scrollViewRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.scrollView}
        contentContainerStyle={StyleSheet.flatten([styles.scrollContent, rowStyle])}
        onLayout={handleScrollViewLayout}
        onContentSizeChange={handleContentSizeChange}
        onScroll={edge.onScroll}
        scrollEventThrottle={16}
        accessibilityRole="tablist"
        accessibilityLabel={accessibilityLabel}
        testID={`${testID}-scroll-view`}
      >
        {tabs.map((tab, index) => renderTab(tab, index, false))}
      </ScrollView>

      {showOverflowIndicators ? (
        <EdgeChevrons
          overflow={edge.overflow}
          onPage={edge.page}
          appearance="strip"
          stripColor={chevronBackground}
          leftLabel={t('common.scroll_tabs_left', { defaultValue: 'Scroll tabs left' })}
          rightLabel={t('common.scroll_tabs_right', { defaultValue: 'Scroll tabs right' })}
          testID={testID}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // Never grows or shrinks: above a full-height list or empty state a shrinkable bar was squeezed to nothing.
  scrollWrapper: { position: 'relative', flexGrow: 0, flexShrink: 0 },
  scrollView: { width: '100%' },
  // Let the tab row (and its bottom border) stretch to at least the full bar width.
  scrollContent: { flexDirection: 'row', flexGrow: 1, paddingTop: 8, overflow: 'visible' },
  fixedBar: { flexDirection: 'row', flexShrink: 0 },
  tab: { position: 'relative', flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  // Equal shares of the fixed bar.
  fixedTab: { flexGrow: 1, flexShrink: 1, flexBasis: 0 },
  scrollableTab: { flexShrink: 0 },
  underTabGap: { marginRight: 4 },
  pillGap: { marginRight: PILL_GAP },
  tabInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  icon: { marginRight: 4 },
  iconLandscape: { marginRight: 6 },
  tabLabel: { flexShrink: 0, textAlign: 'center' },
  // On the web a flex item will not shrink below its longest word (a two-line label clips rather than scrolls, so the
  // browser keeps that minimum): minWidth 0 lets a long unbroken word break inside the tab. Native already starts at 0.
  fixedTabShrink: { flexShrink: 1, minWidth: 0 },
  cornerBadge: { position: 'absolute', top: -4, right: -4, minWidth: 18, minHeight: 18, paddingHorizontal: 4, borderRadius: 9999, alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  cornerBadgeText: { fontSize: 10, lineHeight: 14, fontWeight: '700' },
  inlineBadge: { marginLeft: 8, minWidth: 20, paddingHorizontal: 6, borderRadius: 9999, alignItems: 'center', justifyContent: 'center' },
  inlineBadgeText: { fontSize: 12, lineHeight: 16, fontWeight: '700' },
});

const FIXED_TAB_INNER = StyleSheet.flatten([styles.tabInner, styles.fixedTabShrink]);
