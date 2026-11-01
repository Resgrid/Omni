import { terminologyStore, useFeatureFlag, useIsRecordsFieldEnabled } from '@resgrid/auth';
import { useHasModule } from '@resgrid/config';
import { useTranslation } from '@resgrid/i18n';
import { Pressable, Text, View } from '@resgrid/ui';
import { type Href, router } from 'expo-router';
import React, { useMemo } from 'react';
import { StyleSheet } from 'react-native';

import { QUICK_ACTION_FLAGS, type QuickAction, type QuickActionId, visibleQuickActions } from '../lib/quick-actions';

export interface QuickActionsProps {
  hasActiveUnit: boolean;
  /** Called after navigating (closes the drawer). */
  onNavigate?: () => void;
  /** Actions whose routes this variant does not have (hidden rather than broken). */
  exclude?: readonly QuickActionId[];
  /** Two per row on wide consoles. */
  columns?: number;
  buttonMinHeight?: number;
  iconSize?: number;
  testID?: string;
}

/**
 * The console's shortcuts (Unit sidebar buttons), gated by department feature flags (unknown = off), the active unit
 * and the variant's modules; labels follow the department's terminology.
 */
export const QuickActions: React.FC<QuickActionsProps> = ({ hasActiveUnit, onNavigate, exclude, columns = 2, buttonMinHeight = 48, iconSize = 18, testID = 'unit-quick-actions' }) => {
  const { t } = useTranslation();
  const chat = useFeatureFlag(QUICK_ACTION_FLAGS.chat);
  const checklists = useFeatureFlag(QUICK_ACTION_FLAGS.checklists);
  const deployments = useFeatureFlag(QUICK_ACTION_FLAGS.deployments);
  const records = useIsRecordsFieldEnabled();
  const hasInventory = useHasModule('inventory');
  const terms = terminologyStore((state) => state.names);

  const actions = useMemo(
    () => visibleQuickActions({ chat, checklists, deployments, records, inventory: hasActiveUnit && hasInventory }, exclude),
    [chat, checklists, deployments, exclude, hasActiveUnit, hasInventory, records]
  );
  const itemStyle = useMemo(() => StyleSheet.flatten([styles.item, { width: `${100 / Math.max(1, columns)}%` as const }]), [columns]);

  const open = (action: QuickAction) => {
    router.push(action.href as Href);
    onNavigate?.();
  };

  return (
    <View style={styles.grid} testID={testID}>
      {actions.map((action) => {
        const Icon = action.icon;
        const label = (action.termKey ? terms[action.termKey] : undefined) || t(action.labelKey);
        return (
          <View key={action.id} style={itemStyle}>
            <Pressable
              onPress={() => open(action)}
              accessibilityRole="button"
              accessibilityLabel={label}
              testID={`${testID}-${action.id}`}
              className="flex-row items-center rounded-lg border border-outline-200 bg-background-0 px-3"
              style={{ minHeight: buttonMinHeight }}
            >
              <View style={styles.icon}>
                <Icon size={iconSize} color="#2563eb" />
              </View>
              <Text className="flex-1 font-medium text-typography-900" numberOfLines={1}>
                {label}
              </Text>
            </Pressable>
          </View>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 },
  item: { padding: 4 },
  icon: { marginRight: 8 },
});
