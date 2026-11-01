import type { DispatchedEventResultData } from '@resgrid/models';
import { Text, TypeIcon } from '@resgrid/ui';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Platform, StyleSheet, View } from 'react-native';

import { getDispatchTypeStyle, getUniqueDispatches, isUnitDispatchType } from '../lib/call-dispatch';

export interface DispatchTickerProps {
  dispatches: readonly DispatchedEventResultData[];
  /** Scroll badges that do not fit (Responder ticker). Off: they wrap/clip in place (compact rows, reduced motion). */
  animate?: boolean;
  /** Larger badges for wall boards. */
  large?: boolean;
  testID?: string;
}

const REPEAT_GAP = 28;
const MIN_DURATION_MS = 4000;
const MS_PER_PIXEL = 25;

/**
 * Who the call went to, as P/U/G/R badges (Responder dispatch ticker). Scrolls like a marquee only when the badges
 * overflow; uses React Native's Animated so it runs the same on native, web and Electron.
 */
export const DispatchTicker: React.FC<DispatchTickerProps> = ({ dispatches, animate = true, large = false, testID = 'dispatch-ticker' }) => {
  const unique = useMemo(() => getUniqueDispatches(dispatches), [dispatches]);
  const translateX = useRef(new Animated.Value(0)).current;
  const [containerWidth, setContainerWidth] = useState(0);
  const [contentWidth, setContentWidth] = useState(0);
  const overflowing = animate && containerWidth > 0 && contentWidth > containerWidth;

  useEffect(() => {
    translateX.setValue(0);
    if (!overflowing) return undefined;
    const distance = contentWidth + REPEAT_GAP;
    const loop = Animated.loop(Animated.timing(translateX, { toValue: -distance, duration: Math.max(MIN_DURATION_MS, distance * MS_PER_PIXEL), easing: Easing.linear, useNativeDriver: Platform.OS !== 'web' }));
    loop.start();
    return () => loop.stop();
  }, [contentWidth, overflowing, translateX]);

  if (unique.length === 0) return null;

  const renderBadges = (suffix: string) =>
    unique.map((dispatch) => {
      const style = getDispatchTypeStyle(dispatch.Type);
      return (
        <View
          key={`${dispatch.Id || `${dispatch.Type}:${dispatch.Name}`}-${suffix}`}
          style={StyleSheet.flatten([styles.badge, large ? styles.badgeLarge : null, { backgroundColor: style.backgroundColor }])}
          accessible
          accessibilityLabel={`${style.label} ${dispatch.Name}`}
        >
          <Text style={StyleSheet.flatten([styles.badgeType, large ? styles.badgeTypeLarge : null, { color: style.textColor }])}>{style.label}</Text>
          {isUnitDispatchType(dispatch.Type) ? (
            <View style={styles.icon}>
              <TypeIcon iconUrl={dispatch.TypeIconUrl} mapIcon={dispatch.TypeMapIcon} size={large ? 18 : 14} />
            </View>
          ) : null}
          <Text style={StyleSheet.flatten([styles.badgeName, large ? styles.badgeNameLarge : null, { color: style.textColor }])} numberOfLines={1}>
            {dispatch.Name}
          </Text>
        </View>
      );
    });

  return (
    <View style={styles.viewport} onLayout={(event) => setContainerWidth(event.nativeEvent.layout.width)} testID={testID}>
      <Animated.View style={StyleSheet.flatten([styles.track, { transform: [{ translateX }] }])}>
        <View style={styles.content} onLayout={(event) => setContentWidth(event.nativeEvent.layout.width)} testID={`${testID}-primary`}>
          {renderBadges('a')}
        </View>
        {overflowing ? (
          <View style={StyleSheet.flatten([styles.content, styles.repeat])} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
            {renderBadges('b')}
          </View>
        ) : null}
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  viewport: { overflow: 'hidden', width: '100%' },
  track: { flexDirection: 'row', alignItems: 'center' },
  content: { flexDirection: 'row', alignItems: 'center', flexShrink: 0, paddingVertical: 2 },
  repeat: { marginLeft: REPEAT_GAP },
  badge: { flexDirection: 'row', alignItems: 'center', borderRadius: 10, maxWidth: 160, minHeight: 20, paddingHorizontal: 6, paddingVertical: 2, marginRight: 6 },
  badgeLarge: { borderRadius: 14, maxWidth: 260, minHeight: 30, paddingHorizontal: 10, marginRight: 10 },
  badgeType: { fontSize: 9, fontWeight: '700', marginRight: 3 },
  badgeTypeLarge: { fontSize: 14 },
  badgeName: { flexShrink: 1, fontSize: 10, fontWeight: '600' },
  badgeNameLarge: { fontSize: 16 },
  icon: { marginRight: 3 },
});
