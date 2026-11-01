import { useTerm } from '@resgrid/auth';
import { selectPendingUnitStatus, useUnitsStore, useUnitStatusStore } from '@resgrid/data';
import { AvailabilityFilterChips } from '@resgrid/features/status';
import { useTranslation } from '@resgrid/i18n';
import { type UnitInfoResultData } from '@resgrid/models';
import { useRealtimeEvent } from '@resgrid/realtime';
import { Badge, BadgeText, Button, FlatList, HStack, Input, InputField, InputIcon, InputSlot, Loading, RefreshControl, View, ZeroState } from '@resgrid/ui';
import { router } from 'expo-router';
import { Filter, Search, Truck, X } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { FilterOptionsSheet } from '../components/filter-options-sheet';
import { UnitCard } from '../components/unit-card';
import { useUnitsViewStore } from '../hooks/use-units-view-store';
import { filterUnits, toActiveFilter } from '../lib/unit-filters';
import { unitsRoutes } from '../routes';

export interface UnitsListScreenProps {
  /** Where a tap goes; defaults to the unit detail route. Dispatch passes its console selection, BigBoard nothing. */
  onSelectUnit?: (unit: UnitInfoResultData) => void;
}

/**
 * The department's units (Responder list + filters, Dispatch/BigBoard reuse): search, server filter options, an
 * availability filter by status meaning, pull to refresh and live updates on `unitStatusUpdated`.
 */
export default function UnitsListScreen({ onSelectUnit }: UnitsListScreenProps) {
  const { t } = useTranslation();
  const title = useTerm('module.units', t('units.title'));
  const unitInfos = useUnitsStore((state) => state.unitInfos);
  const filterOptions = useUnitsStore((state) => state.filterOptions);
  const isLoading = useUnitsStore((state) => state.loading.unitInfos === true);
  const hasError = useUnitsStore((state) => !!state.errors.unitInfos);
  const queuedStatuses = useUnitStatusStore((state) => state.queuedStatuses);
  const { query, selectedFilters, availability, setQuery, toggleFilter, clearFilters, setAvailability } = useUnitsViewStore();
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const activeFilter = toActiveFilter(selectedFilters);

  const load = useCallback((bypassCache: boolean) => useUnitsStore.getState().fetchUnitInfos({ activeFilter, bypassCache }), [activeFilter]);

  useEffect(() => {
    void load(false);
  }, [load]);

  useEffect(() => {
    if (isFilterOpen && filterOptions.length === 0) void useUnitsStore.getState().fetchFilterOptions();
  }, [filterOptions.length, isFilterOpen]);

  useRealtimeEvent('unitStatusUpdated', () => {
    void load(true);
  });

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await load(true);
    setIsRefreshing(false);
  }, [load]);

  const handleSelect = useCallback((unit: UnitInfoResultData) => (onSelectUnit ? onSelectUnit(unit) : router.push(unitsRoutes.detail(unit.UnitId))), [onSelectUnit]);
  const showError = hasError && unitInfos.length === 0;
  const units = useMemo(() => filterUnits(unitInfos, { query, availability }), [availability, query, unitInfos]);

  return (
    <View className="flex-1 bg-background-50 px-4 pt-4" testID="units-list-screen">
      <HStack space="sm" className="mb-2">
        <Input className="flex-1 bg-background-0" size="md" variant="outline">
          <InputSlot className="pl-3">
            <InputIcon as={Search} />
          </InputSlot>
          <InputField testID="units-search" placeholder={t('units.search')} value={query} onChangeText={setQuery} accessibilityLabel={t('units.search')} />
          {query ? (
            <InputSlot className="pr-3" onPress={() => setQuery('')} accessibilityRole="button" accessibilityLabel={t('common.clear_search')}>
              <InputIcon as={X} />
            </InputSlot>
          ) : null}
        </Input>
        <Button variant="outline" className="h-10 bg-background-0" onPress={() => setIsFilterOpen(true)} testID="units-filter-button" accessibilityLabel={t('units.filter')}>
          <Filter size={18} color="#6b7280" />
          {selectedFilters.length > 0 ? (
            <Badge size="sm" action="info" className="ml-1">
              <BadgeText>{String(selectedFilters.length)}</BadgeText>
            </Badge>
          ) : null}
        </Button>
      </HStack>
      <AvailabilityFilterChips value={availability} onChange={setAvailability} testID="units-availability" />

      {isLoading && !isRefreshing && unitInfos.length === 0 ? (
        <Loading />
      ) : units.length === 0 ? (
        <ZeroState icon={Truck} heading={showError ? undefined : t('units.empty')} isError={showError} testID="units-empty" />
      ) : (
        <FlatList
          data={units}
          keyExtractor={(unit) => unit.UnitId}
          renderItem={({ item }) => <UnitCard unit={item} onPress={handleSelect} hasPendingStatus={!!selectPendingUnitStatus({ queuedStatuses }, item.UnitId)} />}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />}
          contentContainerStyle={{ paddingBottom: 96, paddingTop: 8 }}
          testID="units-list"
        />
      )}

      <FilterOptionsSheet
        isOpen={isFilterOpen}
        onClose={() => setIsFilterOpen(false)}
        title={`${title} — ${t('units.filter')}`}
        options={filterOptions}
        selected={selectedFilters}
        onToggle={toggleFilter}
        onClear={clearFilters}
        testID="units-filter-sheet"
      />
    </View>
  );
}
