import { useTerm } from '@resgrid/auth';
import { usePersonnelStore } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import type { PersonnelInfoResultData } from '@resgrid/models';
import { FlatList, Text } from '@resgrid/ui';
import { RefreshCw, Users } from 'lucide-react-native';
import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useConsoleStore } from '../hooks/use-console-store';
import { useDashboardViewStore } from '../hooks/use-dashboard-view-store';
import { usePendingPersonnelIds } from '../hooks/use-pending-resource-ids';
import { type ConsoleCallFilter, filterConsolePersonnel, isPersonOnCall } from '../lib/console-filters';
import { isPersonAvailable } from '../lib/console-stats';
import { PanelFrame, PanelIconButton } from './panel-frame';
import { PanelSearch } from './panel-search';
import { ConsolePersonnelRow } from './resource-rows';

export interface PersonnelPanelProps {
  callFilter: ConsoleCallFilter | null;
  onSelectPersonnel: (userId: string) => void;
  onSetStatusForCall?: (userId: string) => void;
  flex?: number;
  maxHeight?: number;
}

/** The console's personnel (Dispatch baseline): search, "available only", filtered to the call while filtering. */
export const PersonnelPanel: React.FC<PersonnelPanelProps> = ({ callFilter, onSelectPersonnel, onSetStatusForCall, flex, maxHeight }) => {
  const { t } = useTranslation();
  const title = useTerm('module.personnel', t('dispatch.personnel'));
  const personnel = usePersonnelStore((state) => state.personnel);
  const isLoading = usePersonnelStore((state) => state.loading.personnel === true);
  const availableOnly = useDashboardViewStore((state) => state.availableOnly);
  const selectedPersonnelId = useConsoleStore((state) => state.selectedPersonnelId);
  const pendingIds = usePendingPersonnelIds();
  const [query, setQuery] = useState('');

  const visible = useMemo(() => filterConsolePersonnel(personnel, { query, availableOnly, callFilter }), [availableOnly, callFilter, personnel, query]);
  const availableCount = useMemo(() => visible.filter(isPersonAvailable).length, [visible]);

  const renderItem = useCallback(
    ({ item }: { item: PersonnelInfoResultData }) => (
      <ConsolePersonnelRow
        person={item}
        isSelected={selectedPersonnelId === item.UserId}
        isOnCall={isPersonOnCall(item, callFilter)}
        hasPendingStatus={pendingIds.has(item.UserId)}
        onPress={onSelectPersonnel}
        onSetStatusForCall={callFilter ? onSetStatusForCall : undefined}
      />
    ),
    [callFilter, onSelectPersonnel, onSetStatusForCall, pendingIds, selectedPersonnelId]
  );

  return (
    <PanelFrame
      title={callFilter ? t('dispatch.personnel_on_call') : title}
      icon={Users}
      iconColor="#8b5cf6"
      cardKey="personnel"
      count={visible.length}
      flex={flex}
      maxHeight={maxHeight}
      testID="personnel-panel"
      right={
        <>
          <View className="flex-row items-center rounded bg-background-success px-1.5 py-0.5" testID="personnel-panel-available">
            <Text className="text-xs font-medium text-success-700">{availableCount}</Text>
          </View>
          <PanelIconButton icon={RefreshCw} onPress={() => void usePersonnelStore.getState().fetchPersonnel({ bypassCache: true })} accessibilityLabel={t('common.refresh')} testID="personnel-refresh" />
        </>
      }
    >
      <PanelSearch value={query} onChange={setQuery} placeholder={t('dispatch_console.search_personnel')} testID="personnel-search" />
      <FlatList
        testID="personnel-list"
        data={visible}
        renderItem={renderItem}
        keyExtractor={(item: PersonnelInfoResultData) => item.UserId}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text className="text-center text-sm text-typography-500">{isLoading ? t('common.loading') : callFilter ? t('dispatch.no_personnel_on_call') : t('dispatch.no_personnel')}</Text>
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
