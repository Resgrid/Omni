import { terminologyStore, useFeatureFlag, useIsRecordsFieldEnabled } from '@resgrid/auth';
import { useHasModule } from '@resgrid/config';
import { useBadgeCountLookup } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import { CountBadge, Pressable, Text, View } from '@resgrid/ui';
import { type Href, router } from 'expo-router';
import React, { useMemo } from 'react';
import { StyleSheet } from 'react-native';

import { QUICK_ACTION_FLAGS, type QuickAction, type QuickActionId, SIDEBAR_ROW_ACTIONS, visibleQuickActions } from '../lib/quick-actions';

export interface QuickActionsProps {
  hasActiveUnit: boolean;
  /** Called after navigating (closes the drawer). */
  onNavigate?: () => void;
  /** Actions whose routes this variant does not have (hidden rather than broken). */
  exclude?: readonly QuickActionId[];
  /** Two per row on wide consoles. */
  columns?: number;
  /**
   * `grid` (default): `columns` per row, icon and label left-aligned (the full console). `sidebar`: Unit's sidebar
   * buttons — chat, checklists, deployments and inventory share one row as icon-only buttons (their count badge on the
   * corner), every other action on a labelled row of its own, centred.
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
  const rowCount = useMemo(() => actions.filter((action) => SIDEBAR_ROW_ACTIONS.includes(action.id)).length, [actions]);
  const rowItemStyle = useMemo(() => StyleSheet.flatten([styles.item, { width: `${100 / Math.max(1, rowCount)}%` as const }]), [rowCount]);

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
        // Four to a row leaves no width for labels: the row's buttons show the icon alone and keep the label for screen readers.
        const iconOnly = isSidebar && SIDEBAR_ROW_ACTIONS.includes(action.id);

        return (
          <View key={action.id} style={isSidebar ? (iconOnly ? rowItemStyle : styles.full) : itemStyle}>
            <Pressable
              onPress={() => open(action)}
              accessibilityRole="button"
              accessibilityLabel={count ? t('shell.nav_item_with_count', { label, count }) : label}
              testID={`${testID}-${action.id}`}
              className={`rounded-lg border border-outline-200 bg-background-0 ${iconOnly ? 'items-center justify-center px-1' : `flex-row items-center px-3 ${isSidebar ? 'justify-center' : ''}`}`}
              style={{ minHeight: buttonMinHeight }}
            >
              {iconOnly ? (
                <Icon size={iconSize + ICON_ONLY_GROWTH} color={ACTION_COLOR} />
              ) : (
                <>
                  <View style={styles.icon}>
                    <Icon size={iconSize} color={ACTION_COLOR} />
                  </View>
                  <Text className={`${isSidebar ? 'flex-shrink' : 'flex-1'} font-medium text-typography-900`} numberOfLines={1}>
                    {label}
                  </Text>
                </>
              )}
              <CountBadge count={count} placement={iconOnly ? 'corner' : 'inline'} testID={`${testID}-${action.id}-badge`} />
            </Pressable>
          </View>
        );
      })}
    </View>
  );
};

const ACTION_COLOR = '#2563eb';

/** Icon-only buttons carry their meaning in the icon alone, so it is drawn a little larger than beside a label. */
const ICON_ONLY_GROWTH = 4;

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 },
  item: { padding: 4 },
  full: { width: '100%', padding: 4 },
  icon: { marginRight: 8 },
});
