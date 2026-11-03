import { HStack, Pressable, Text, useThemeColors } from '@resgrid/ui';
import type { LucideIcon } from 'lucide-react-native';
import { ChevronDown, ChevronUp } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { selectCardCollapsed, useDashboardViewStore } from '../hooks/use-dashboard-view-store';
import type { DashboardCardKey } from '../lib/console-types';

export interface PanelFrameProps {
  title: string;
  icon: LucideIcon;
  iconColor: string;
  /** Collapsed state is remembered per card on the device. */
  cardKey: DashboardCardKey;
  count?: number;
  /** Flex weight when expanded; a collapsed card shrinks to its header so siblings take the space. */
  flex?: number;
  /** Height cap when the panel is not flex-sized (phone column), so its list virtualizes. */
  maxHeight?: number;
  /** Header actions (refresh, new, filters). */
  right?: React.ReactNode;
  children?: React.ReactNode;
  testID: string;
}

/**
 * A console card: header with icon, title, count, actions and a collapse toggle, then its content. The header actions sit
 * beside the toggle, never inside it: on the web a button inside a button is invalid markup (React logs it on every render).
 */
export const PanelFrame: React.FC<PanelFrameProps> = ({ title, icon: Icon, iconColor, cardKey, count, flex, maxHeight, right, children, testID }) => {
  const colors = useThemeColors();
  const isCollapsed = useDashboardViewStore(selectCardCollapsed(cardKey));
  const setCardCollapsed = useDashboardViewStore((state) => state.setCardCollapsed);
  const sizing = isCollapsed ? null : flex !== undefined ? { flex } : maxHeight !== undefined ? { maxHeight, minHeight: Math.min(200, maxHeight) } : null;
  const toggle = () => setCardCollapsed(cardKey, !isCollapsed);

  return (
    <View style={StyleSheet.flatten([styles.panel, sizing])} className="overflow-hidden rounded-lg border border-outline-200 bg-background-0" testID={testID}>
      <HStack className="items-center border-b border-outline-200 bg-background-50">
        <Pressable onPress={toggle} accessibilityRole="button" accessibilityState={{ expanded: !isCollapsed }} accessibilityLabel={title} className="flex-1 py-2 pl-3" testID={`${testID}-header`}>
          <HStack space="sm" className="items-center">
            <View>
              <Icon size={16} color={iconColor} />
            </View>
            <Text className="text-sm font-semibold text-typography-800" numberOfLines={1}>
              {title}
            </Text>
            {typeof count === 'number' ? (
              <View className="rounded-full bg-primary-100 px-2 py-0.5" testID={`${testID}-count`}>
                <Text className="text-xs font-bold text-primary-700">{count}</Text>
              </View>
            ) : null}
          </HStack>
        </Pressable>
        <HStack space="xs" className="items-center py-2 pr-3">
          {right}
          {/* The chevron repeats the header toggle for pointer users; assistive tech and the keyboard use the header button. */}
          <Pressable onPress={toggle} aria-hidden focusable={false} hitSlop={6} testID={`${testID}-chevron`}>
            <View>{isCollapsed ? <ChevronUp size={16} color={colors.token('typography-500')} /> : <ChevronDown size={16} color={colors.token('typography-500')} />}</View>
          </Pressable>
        </HStack>
      </HStack>
      {isCollapsed ? null : <View style={styles.content}>{children}</View>}
    </View>
  );
};

/** A small icon button for panel headers; an active one (a filter that is on) is filled with the accent. */
export const PanelIconButton: React.FC<{ icon: LucideIcon; color?: string; onPress: () => void; accessibilityLabel: string; testID: string; isActive?: boolean }> = ({
  icon: Icon,
  color,
  onPress,
  accessibilityLabel,
  testID,
  isActive = false,
}) => {
  const colors = useThemeColors();

  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected: isActive }}
      className={`rounded p-1 ${isActive ? 'bg-primary-600' : ''}`}
      testID={testID}
    >
      <View>
        <Icon size={14} color={isActive ? colors.textInverse : (color ?? colors.token('typography-500'))} />
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  panel: { minWidth: 0, marginBottom: 8 },
  content: { flex: 1, minHeight: 0 },
});
