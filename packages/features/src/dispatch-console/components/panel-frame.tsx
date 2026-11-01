import { HStack, Pressable, Text } from '@resgrid/ui';
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

/** A console card: header with icon, title, count, actions and a collapse toggle, then its content. */
export const PanelFrame: React.FC<PanelFrameProps> = ({ title, icon: Icon, iconColor, cardKey, count, flex, maxHeight, right, children, testID }) => {
  const isCollapsed = useDashboardViewStore(selectCardCollapsed(cardKey));
  const setCardCollapsed = useDashboardViewStore((state) => state.setCardCollapsed);
  const sizing = isCollapsed ? null : flex !== undefined ? { flex } : maxHeight !== undefined ? { maxHeight, minHeight: Math.min(200, maxHeight) } : null;

  return (
    <View style={StyleSheet.flatten([styles.panel, sizing])} className="overflow-hidden rounded-lg border border-outline-200 bg-background-0" testID={testID}>
      <Pressable
        onPress={() => setCardCollapsed(cardKey, !isCollapsed)}
        accessibilityRole="button"
        accessibilityState={{ expanded: !isCollapsed }}
        accessibilityLabel={title}
        className="border-b border-outline-200 bg-background-50 px-3 py-2"
        testID={`${testID}-header`}
      >
        <HStack className="items-center justify-between">
          <HStack space="sm" className="flex-1 items-center">
            <View>
              <Icon size={16} color={iconColor} />
            </View>
            <Text className="text-sm font-semibold" numberOfLines={1}>
              {title}
            </Text>
            {typeof count === 'number' ? (
              <View className="rounded-full bg-primary-50 px-2 py-0.5" testID={`${testID}-count`}>
                <Text className="text-xs font-bold text-primary-700">{count}</Text>
              </View>
            ) : null}
          </HStack>
          <HStack space="xs" className="items-center">
            {right}
            <View>{isCollapsed ? <ChevronUp size={16} color="#6b7280" /> : <ChevronDown size={16} color="#6b7280" />}</View>
          </HStack>
        </HStack>
      </Pressable>
      {isCollapsed ? null : <View style={styles.content}>{children}</View>}
    </View>
  );
};

/** A small icon button for panel headers. */
export const PanelIconButton: React.FC<{ icon: LucideIcon; color?: string; onPress: () => void; accessibilityLabel: string; testID: string; isActive?: boolean }> = ({
  icon: Icon,
  color = '#6b7280',
  onPress,
  accessibilityLabel,
  testID,
  isActive = false,
}) => (
  <Pressable
    onPress={onPress}
    hitSlop={6}
    accessibilityRole="button"
    accessibilityLabel={accessibilityLabel}
    accessibilityState={{ selected: isActive }}
    className={`rounded p-1 ${isActive ? 'bg-primary-500' : ''}`}
    testID={testID}
  >
    <View>
      <Icon size={14} color={isActive ? '#ffffff' : color} />
    </View>
  </Pressable>
);

const styles = StyleSheet.create({
  panel: { minWidth: 0, marginBottom: 8 },
  content: { flex: 1, minHeight: 0 },
});
