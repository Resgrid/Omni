import { usePersonnelStore, useUnitsStore } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import type { PersonnelInfoResultData, UnitInfoResultData } from '@resgrid/models';
import { FlatList, Text } from '@resgrid/ui';
import { Layers, RefreshCw } from 'lucide-react-native';
import React, { useCallback, useMemo, useState } from 'react';
import { type GestureResponderEvent, StyleSheet, View } from 'react-native';

import { useConsoleStore } from '../hooks/use-console-store';
import { useDashboardViewStore } from '../hooks/use-dashboard-view-store';
import { usePendingPersonnelIds, usePendingUnitIds } from '../hooks/use-pending-resource-ids';
import { type ConsoleCallFilter, filterConsolePersonnel, filterConsoleUnits, isPersonOnCall, isUnitOnCall } from '../lib/console-filters';
import { PanelFrame, PanelIconButton } from './panel-frame';
import { PanelSearch } from './panel-search';
import { ConsolePersonnelRow, ConsoleUnitRow, isMultiSelectClick } from './resource-rows';

type ResourceRow = { kind: 'header'; key: string; title: string } | { kind: 'unit'; key: string; unit: UnitInfoResultData } | { kind: 'person'; key: string; person: PersonnelInfoResultData };

export interface ResourcesPanelProps {
  callFilter: ConsoleCallFilter | null;
  onSelectUnit: (unitId: string) => void;
  onSelectPersonnel: (userId: string) => void;
  onSetUnitStatusForCall?: (unitId: string) => void;
  onSetPersonnelStatusForCall?: (userId: string) => void;
  flex?: number;
  maxHeight?: number;
}

/** Units and personnel in one list ("Single list" view toggle, Dispatch baseline ResourcesPanel). */
export const ResourcesPanel: React.FC<ResourcesPanelProps> = ({ callFilter, onSelectUnit, onSelectPersonnel, onSetUnitStatusForCall, onSetPersonnelStatusForCall, flex, maxHeight }) => {
  const { t } = useTranslation();
  const units = useUnitsStore((state) => state.unitInfos);
  const personnel = usePersonnelStore((state) => state.personnel);
  const availableOnly = useDashboardViewStore((state) => state.availableOnly);
  const selectedUnitId = useConsoleStore((state) => state.selectedUnitId);
  const selectedPersonnelId = useConsoleStore((state) => state.selectedPersonnelId);
  const isSelectionMode = useConsoleStore((state) => state.isSelectionMode);
  const selectedUnitIds = useConsoleStore((state) => state.selectedUnitIds);
  const pendingUnits = usePendingUnitIds();
  const pendingPeople = usePendingPersonnelIds();
  const [query, setQuery] = useState('');

  const rows = useMemo<ResourceRow[]>(() => {
    const options = { query, availableOnly, callFilter };
    const unitRows = filterConsoleUnits(units, options).map<ResourceRow>((unit) => ({ kind: 'unit', key: `u-${unit.UnitId}`, unit }));
    const personRows = filterConsolePersonnel(personnel, options).map<ResourceRow>((person) => ({ kind: 'person', key: `p-${person.UserId}`, person }));
    return [
      ...(unitRows.length > 0 ? [{ kind: 'header' as const, key: 'h-units', title: t('dispatch.units') }, ...unitRows] : []),
      ...(personRows.length > 0 ? [{ kind: 'header' as const, key: 'h-personnel', title: t('dispatch.personnel') }, ...personRows] : []),
    ];
  }, [availableOnly, callFilter, personnel, query, t, units]);
  const count = rows.filter((row) => row.kind !== 'header').length;
  const selectedSet = useMemo(() => new Set(selectedUnitIds), [selectedUnitIds]);

  const handleUnitPress = useCallback(
    (unitId: string, event?: GestureResponderEvent) => {
      const store = useConsoleStore.getState();
      if (store.isSelectionMode) store.toggleUnitInSelection(unitId);
      else if (isMultiSelectClick(event)) store.startSelection([unitId]);
      else onSelectUnit(unitId);
    },
    [onSelectUnit]
  );

  const renderItem = useCallback(
    ({ item }: { item: ResourceRow }) => {
      if (item.kind === 'header') return <Text className="mb-1 mt-2 text-xs font-semibold uppercase text-typography-500">{item.title}</Text>;
      if (item.kind === 'unit') {
        return (
          <ConsoleUnitRow
            unit={item.unit}
            isSelected={isSelectionMode ? selectedSet.has(item.unit.UnitId) : selectedUnitId === item.unit.UnitId}
            isOnCall={isUnitOnCall(item.unit, callFilter)}
            isSelectionMode={isSelectionMode}
            hasPendingStatus={pendingUnits.has(item.unit.UnitId)}
            onPress={handleUnitPress}
            onLongPress={(unitId) => (useConsoleStore.getState().isSelectionMode ? useConsoleStore.getState().toggleUnitInSelection(unitId) : useConsoleStore.getState().startSelection([unitId]))}
            onSetStatusForCall={callFilter && !isSelectionMode ? onSetUnitStatusForCall : undefined}
          />
        );
      }
      return (
        <ConsolePersonnelRow
          person={item.person}
          isSelected={selectedPersonnelId === item.person.UserId}
          isOnCall={isPersonOnCall(item.person, callFilter)}
          hasPendingStatus={pendingPeople.has(item.person.UserId)}
          onPress={onSelectPersonnel}
          onSetStatusForCall={callFilter ? onSetPersonnelStatusForCall : undefined}
        />
      );
    },
    [callFilter, handleUnitPress, isSelectionMode, onSelectPersonnel, onSetPersonnelStatusForCall, onSetUnitStatusForCall, pendingPeople, pendingUnits, selectedPersonnelId, selectedSet, selectedUnitId]
  );

  return (
    <PanelFrame
      title={callFilter ? t('dispatch_console.resources_on_call') : t('dispatch_console.resources')}
      icon={Layers}
      iconColor="#0ea5e9"
      cardKey="resources"
      count={count}
      flex={flex}
      maxHeight={maxHeight}
      testID="resources-panel"
      right={
        <PanelIconButton
          icon={RefreshCw}
          onPress={() => {
            void useUnitsStore.getState().fetchUnitInfos({ bypassCache: true });
            void usePersonnelStore.getState().fetchPersonnel({ bypassCache: true });
          }}
          accessibilityLabel={t('common.refresh')}
          testID="resources-refresh"
        />
      }
    >
      <PanelSearch value={query} onChange={setQuery} placeholder={t('dispatch_console.search_resources')} testID="resources-search" />
      <FlatList
        testID="resources-list"
        data={rows}
        renderItem={renderItem}
        keyExtractor={(item: ResourceRow) => item.key}
        getItemType={(item: ResourceRow) => item.kind}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text className="text-center text-sm text-typography-500">{t('dispatch_console.no_resources')}</Text>
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
