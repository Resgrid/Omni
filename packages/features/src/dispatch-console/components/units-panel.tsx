import { useTerm } from '@resgrid/auth';
import { useUnitsStore } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import type { UnitInfoResultData } from '@resgrid/models';
import { FlatList, HStack, Pressable, Text } from '@resgrid/ui';
import { ListChecks, RefreshCw, Truck } from 'lucide-react-native';
import React, { useCallback, useMemo, useState } from 'react';
import { type GestureResponderEvent, StyleSheet, View } from 'react-native';

import { useConsoleStore } from '../hooks/use-console-store';
import { useDashboardViewStore } from '../hooks/use-dashboard-view-store';
import { usePendingUnitIds } from '../hooks/use-pending-resource-ids';
import { type ConsoleCallFilter, filterConsoleUnits, isUnitOnCall } from '../lib/console-filters';
import { isUnitAvailable } from '../lib/console-stats';
import { PanelFrame, PanelIconButton } from './panel-frame';
import { PanelSearch } from './panel-search';
import { ConsoleUnitRow, isMultiSelectClick } from './resource-rows';

export interface UnitsPanelProps {
  callFilter: ConsoleCallFilter | null;
  /** A single unit tapped (not in multi-select): the screen toggles its selection and logs it. */
  onSelectUnit: (unitId: string) => void;
  /** "+" on a unit while filtered to a call. */
  onSetStatusForCall?: (unitId: string) => void;
  flex?: number;
  maxHeight?: number;
}

/** Bar under the search while multi-select is on: count, select all, clear, done. */
const SelectionBar: React.FC<{ count: number; onSelectAll: () => void }> = ({ count, onSelectAll }) => {
  const { t } = useTranslation();
  return (
    <HStack space="sm" className="items-center justify-between border-b border-primary-200 bg-primary-50 px-2 py-1.5" testID="unit-selection-bar">
      <Text className="flex-1 text-xs text-primary-700" numberOfLines={1}>
        {count > 0 ? t('dispatch.bulk_unit_actions.selected_count', { count }) : t('dispatch.bulk_unit_actions.select_hint')}
      </Text>
      <Pressable onPress={onSelectAll} hitSlop={6} testID="unit-select-all">
        <Text className="text-xs font-medium text-primary-600">{t('dispatch.bulk_unit_actions.select_all')}</Text>
      </Pressable>
      {count > 0 ? (
        <Pressable onPress={() => useConsoleStore.getState().clearSelection()} hitSlop={6} testID="unit-select-clear">
          <Text className="text-xs font-medium text-typography-600">{t('dispatch.bulk_unit_actions.clear')}</Text>
        </Pressable>
      ) : null}
      <Pressable onPress={() => useConsoleStore.getState().endSelection()} hitSlop={6} testID="unit-select-done">
        <Text className="text-xs font-semibold text-primary-700">{t('common.done')}</Text>
      </Pressable>
    </HStack>
  );
};

/**
 * The console's units (Dispatch baseline): search, "available only", filtered to the call's units while the console is
 * filtered, crew seats and status. Multi-select (header toggle, long press, Ctrl/Cmd-click on web) builds a group for
 * one status change (an ambulance and the MUG following it, all apparatus returning).
 */
export const UnitsPanel: React.FC<UnitsPanelProps> = ({ callFilter, onSelectUnit, onSetStatusForCall, flex, maxHeight }) => {
  const { t } = useTranslation();
  const title = useTerm('module.units', t('dispatch.units'));
  const units = useUnitsStore((state) => state.unitInfos);
  const isLoading = useUnitsStore((state) => state.loading.unitInfos === true);
  const availableOnly = useDashboardViewStore((state) => state.availableOnly);
  const selectedUnitId = useConsoleStore((state) => state.selectedUnitId);
  const isSelectionMode = useConsoleStore((state) => state.isSelectionMode);
  const selectedUnitIds = useConsoleStore((state) => state.selectedUnitIds);
  const pendingUnitIds = usePendingUnitIds();
  const [query, setQuery] = useState('');

  const visible = useMemo(() => filterConsoleUnits(units, { query, availableOnly, callFilter }), [availableOnly, callFilter, query, units]);
  const selectedSet = useMemo(() => new Set(selectedUnitIds), [selectedUnitIds]);
  const availableCount = useMemo(() => visible.filter(isUnitAvailable).length, [visible]);

  const handlePress = useCallback(
    (unitId: string, event?: GestureResponderEvent) => {
      const store = useConsoleStore.getState();
      if (store.isSelectionMode) store.toggleUnitInSelection(unitId);
      else if (isMultiSelectClick(event)) store.startSelection([unitId]);
      else onSelectUnit(unitId);
    },
    [onSelectUnit]
  );

  const handleLongPress = useCallback((unitId: string) => {
    const store = useConsoleStore.getState();
    if (store.isSelectionMode) store.toggleUnitInSelection(unitId);
    else store.startSelection([unitId]);
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: UnitInfoResultData }) => (
      <ConsoleUnitRow
        unit={item}
        isSelected={isSelectionMode ? selectedSet.has(item.UnitId) : selectedUnitId === item.UnitId}
        isOnCall={isUnitOnCall(item, callFilter)}
        isSelectionMode={isSelectionMode}
        hasPendingStatus={pendingUnitIds.has(item.UnitId)}
        onPress={handlePress}
        onLongPress={handleLongPress}
        onSetStatusForCall={callFilter && !isSelectionMode ? onSetStatusForCall : undefined}
      />
    ),
    [callFilter, handleLongPress, handlePress, isSelectionMode, onSetStatusForCall, pendingUnitIds, selectedSet, selectedUnitId]
  );

  return (
    <PanelFrame
      title={callFilter ? t('dispatch.units_on_call') : title}
      icon={Truck}
      iconColor="#3b82f6"
      cardKey="units"
      count={visible.length}
      flex={flex}
      maxHeight={maxHeight}
      testID="units-panel"
      right={
        <>
          <View className="flex-row items-center rounded bg-background-success px-1.5 py-0.5" testID="units-panel-available">
            <Text className="text-xs font-medium text-success-700">{availableCount}</Text>
          </View>
          <PanelIconButton
            icon={ListChecks}
            color="#6366f1"
            isActive={isSelectionMode}
            onPress={() => (isSelectionMode ? useConsoleStore.getState().endSelection() : useConsoleStore.getState().startSelection())}
            accessibilityLabel={t('dispatch.bulk_unit_actions.multi_select')}
            testID="unit-multi-select-toggle"
          />
          <PanelIconButton icon={RefreshCw} onPress={() => void useUnitsStore.getState().fetchUnitInfos({ bypassCache: true })} accessibilityLabel={t('common.refresh')} testID="units-refresh" />
        </>
      }
    >
      <PanelSearch value={query} onChange={setQuery} placeholder={t('dispatch_console.search_units')} testID="units-search" />
      {isSelectionMode ? <SelectionBar count={selectedUnitIds.length} onSelectAll={() => useConsoleStore.getState().addUnitsToSelection(visible.map((unit) => unit.UnitId))} /> : null}
      <FlatList
        testID="units-list"
        data={visible}
        renderItem={renderItem}
        keyExtractor={(item: UnitInfoResultData) => item.UnitId}
        extraData={selectedUnitIds}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text className="text-center text-sm text-typography-500">{isLoading ? t('common.loading') : callFilter ? t('dispatch.no_units_on_call') : t('dispatch.no_units')}</Text>
          </View>
        }
      />
    </PanelFrame>
  );
};

const styles = StyleSheet.create({
  list: { padding: 8 },
  empty: { padding: 24, alignItems: 'center' },
});
