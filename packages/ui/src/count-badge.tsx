import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { contentOnFill } from './theme/readable-color';
import { useThemeColors } from './theme/use-theme-colors';

/** Counts above this show as "99+". */
export const MAX_BADGE_COUNT = 99;

/** A badge's text: the count, or "99+" past {@link MAX_BADGE_COUNT}. */
export const formatBadgeCount = (count: number): string => (count > MAX_BADGE_COUNT ? `${MAX_BADGE_COUNT}+` : String(count));

export interface CountBadgeProps {
  /** Nothing renders for null, zero or less. */
  count: number | null | undefined;
  /** `corner`: over an icon's top-right corner (the app bar bell). `inline`: at the end of a row (menu entries). */
  placement?: 'corner' | 'inline';
  testID?: string;
}

/**
 * The red count pill of the app bar bell, the side menu and the tab bars. Plain React Native styles with pinned text
 * metrics (as in the tab bar), so it lays out the same on native, web and Electron and grows with large system text
 * instead of clipping. Put it inside the control it counts for, and give that control a label with the count: the
 * control groups its children, so screen readers read the label rather than the bare number.
 */
export function CountBadge({ count, placement = 'inline', testID }: CountBadgeProps) {
  const colors = useThemeColors();

  if (count == null || count <= 0) return null;

  return (
    <View style={StyleSheet.flatten([styles.pill, placement === 'corner' ? styles.corner : styles.inline, { backgroundColor: colors.error }])} testID={testID}>
      <Text numberOfLines={1} style={StyleSheet.flatten([styles.text, { color: contentOnFill(colors.error) }])}>
        {formatBadgeCount(count)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { minWidth: 18, minHeight: 18, borderRadius: 9999, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center' },
  corner: { position: 'absolute', top: 2, right: 0 },
  inline: { marginLeft: 8 },
  text: { fontSize: 11, lineHeight: 14, fontWeight: '700' },
});
