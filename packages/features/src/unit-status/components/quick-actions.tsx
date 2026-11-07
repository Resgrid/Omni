import { terminologyStore, useFeatureFlag, useIsRecordsFieldEnabled } from '@resgrid/auth';
import { useHasModule } from '@resgrid/config';
import { useBadgeCountLookup } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import { CountBadge, Pressable, Text, View } from '@resgrid/ui';
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
  /**
   * `grid` (default): `columns` per row, icon and label left-aligned (the full console). `sidebar`: legacy Unit's sidebar
   * buttons — chat and the assistant side by side, every other action on a row of its own, centred.
   */
  arrangement?: 'grid' | 'sidebar';
  buttonMinHeight?: number;
  iconSize?: number;
  testID?: string;
}

/**
 * The console's shortcuts (Unit sidebar buttons), gated by department feature flags (unknown = off), the active unit
 * and the variant's modules; labels follow the department's terminology.
 */
export const QuickActions: React.FC<QuickActionsProps> = ({ hasActiveUnit, onNavigate, exclude, columns = 2, arrangement = 'grid', buttonMinHeight = 48, iconSize = 18, testID = 'unit-quick-actions' }) => {
  const { t } = useTranslation();
  const chat = useFeatureFlag(QUICK_ACTION_FLAGS.chat);
  const checklists = useFeatureFlag(QUICK_ACTION_FLAGS.checklists);
  const deployments = useFeatureFlag(QUICK_ACTION_FLAGS.deployments);
  const records = useIsRecordsFieldEnabled();
  const hasInventory = useHasModule('inventory');
  const terms = terminologyStore((state) => state.names);
  // The shell asks for the counts of the app's nav entries, chat among them.
  const badgeCount = useBadgeCountLookup();

  const actions = useMemo(
    () => visibleQuickActions({ chat, checklists, deployments, records, inventory: hasActiveUnit && hasInventory }, exclude),
    [chat, checklists, deployments, exclude, hasActiveUnit, hasInventory, records]
  );
  const itemStyle = useMemo(() => StyleSheet.flatten([styles.item, { width: `${100 / Math.max(1, columns)}%` as const }]), [columns]);
  const isSidebar = arrangement === 'sidebar';

  const open = (action: QuickAction) => {
    router.push(action.href as Href);
    onNavigate?.();
  };

  return (
    <View style={styles.grid} testID={testID}>
      {actions.map((action) => {
        const Icon = action.icon;
        const label = (action.termKey ? terms[action.termKey] : undefined) || t(action.labelKey);
        const count = badgeCount(action.badge);

        return (
          <View key={action.id} style={isSidebar ? (isPaired(action.id) && hasPair(actions) ? styles.half : styles.full) : itemStyle}>
            <Pressable
              onPress={() => open(action)}
              accessibilityRole="button"
              accessibilityLabel={count ? t('shell.nav_item_with_count', { label, count }) : label}
              testID={`${testID}-${action.id}`}
              className={`flex-row items-center rounded-lg border border-outline-200 bg-background-0 px-3 ${isSidebar ? 'justify-center' : ''}`}
              style={{ minHeight: buttonMinHeight }}
            >
              <View style={styles.icon}>
                <Icon size={iconSize} color={action.id === 'assistant' ? ASSISTANT_COLOR : ACTION_COLOR} />
              </View>
              <Text className={`${isSidebar ? 'flex-shrink' : 'flex-1'} font-medium text-typography-900`} numberOfLines={1}>
                {label}
              </Text>
              <CountBadge count={count} testID={`${testID}-${action.id}-badge`} />
            </Pressable>
          </View>
        );
      })}
    </View>
  );
};

const ACTION_COLOR = '#2563eb';

/** Legacy Unit drew the assistant's sparkles in violet. */
const ASSISTANT_COLOR = '#7c3aed';

/** Chat and the assistant share a row in the sidebar (both or neither show: one Chat.System flag gates them). */
const isPaired = (id: QuickActionId): boolean => id === 'chat' || id === 'assistant';

const hasPair = (actions: readonly QuickAction[]): boolean => actions.filter((action) => isPaired(action.id)).length === 2;

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 },
  item: { padding: 4 },
  half: { width: '50%', padding: 4 },
  full: { width: '100%', padding: 4 },
  icon: { marginRight: 8 },
});
