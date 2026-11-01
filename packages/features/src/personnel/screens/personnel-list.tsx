import { useSecurity, useTerm } from '@resgrid/auth';
import { selectPendingPersonnelWrite, usePersonnelStatusStore, usePersonnelStore } from '@resgrid/data';
import { AvailabilityFilterChips } from '@resgrid/features/status';
import { FilterOptionsSheet, toActiveFilter } from '@resgrid/features/units';
import { useTranslation } from '@resgrid/i18n';
import { type PersonnelInfoResultData } from '@resgrid/models';
import { useRealtimeEvent } from '@resgrid/realtime';
import { Badge, BadgeText, Button, FlatList, HStack, Input, InputField, InputIcon, InputSlot, Loading, RefreshControl, View, ZeroState } from '@resgrid/ui';
import { router } from 'expo-router';
import { Filter, Search, Users, X } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { PersonnelCard } from '../components/personnel-card';
import { usePersonnelViewStore } from '../hooks/use-personnel-view-store';
import { filterPersonnel, sortPersonnel } from '../lib/personnel-filters';
import { personnelRoutes } from '../routes';

export interface PersonnelListScreenProps {
  onSelectPerson?: (person: PersonnelInfoResultData) => void;
}

/**
 * The department's members (Responder list + filters, Dispatch/BigBoard reuse): search, server filters, an
 * availability filter by status meaning, live updates on status/staffing pings. PII only with `CanViewPII`.
 */
export default function PersonnelListScreen({ onSelectPerson }: PersonnelListScreenProps) {
  const { t } = useTranslation();
  const title = useTerm('module.personnel', t('personnel.title'));
  const { canUserViewPII } = useSecurity();
  const personnel = usePersonnelStore((state) => state.personnel);
  const filterOptions = usePersonnelStore((state) => state.filterOptions);
  const isLoading = usePersonnelStore((state) => state.loading.personnel === true);
  const hasError = usePersonnelStore((state) => !!state.errors.personnel);
  const queuedWrites = usePersonnelStatusStore((state) => state.queuedWrites);
  const { query, selectedFilters, availability, setQuery, toggleFilter, clearFilters, setAvailability } = usePersonnelViewStore();
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const activeFilter = toActiveFilter(selectedFilters);

  const load = useCallback((bypassCache: boolean) => usePersonnelStore.getState().fetchPersonnel({ activeFilter, bypassCache }), [activeFilter]);

  useEffect(() => {
    void load(false);
  }, [load]);

  useEffect(() => {
    if (isFilterOpen && filterOptions.length === 0) void usePersonnelStore.getState().getPersonnelFilterOptions();
  }, [filterOptions.length, isFilterOpen]);

  useRealtimeEvent('personnelStatusUpdated', () => void load(true));
  useRealtimeEvent('personnelStaffingUpdated', () => void load(true));

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await load(true);
    setIsRefreshing(false);
  }, [load]);

  const select = useCallback((person: PersonnelInfoResultData) => (onSelectPerson ? onSelectPerson(person) : router.push(personnelRoutes.detail(person.UserId))), [onSelectPerson]);
  const showError = hasError && personnel.length === 0;
  const visible = useMemo(() => sortPersonnel(filterPersonnel(personnel, { query, availability }, canUserViewPII)), [availability, canUserViewPII, personnel, query]);

  return (
    <View className="flex-1 bg-background-50 px-4 pt-4" testID="personnel-list-screen">
      <HStack space="sm" className="mb-2">
        <Input className="flex-1 bg-background-0" size="md" variant="outline">
          <InputSlot className="pl-3">
            <InputIcon as={Search} />
          </InputSlot>
          <InputField testID="personnel-search" placeholder={t('personnel.search')} value={query} onChangeText={setQuery} accessibilityLabel={t('personnel.search')} />
          {query ? (
            <InputSlot className="pr-3" onPress={() => setQuery('')} accessibilityRole="button" accessibilityLabel={t('common.clear_search')}>
              <InputIcon as={X} />
            </InputSlot>
          ) : null}
        </Input>
        <Button variant="outline" className="h-10 bg-background-0" onPress={() => setIsFilterOpen(true)} testID="personnel-filter-button" accessibilityLabel={t('units.filter')}>
          <Filter size={18} color="#6b7280" />
          {selectedFilters.length > 0 ? (
            <Badge size="sm" action="info" className="ml-1">
              <BadgeText>{String(selectedFilters.length)}</BadgeText>
            </Badge>
          ) : null}
        </Button>
      </HStack>
      <AvailabilityFilterChips value={availability} onChange={setAvailability} testID="personnel-availability" />

      {isLoading && !isRefreshing && personnel.length === 0 ? (
        <Loading />
      ) : visible.length === 0 ? (
        <ZeroState icon={Users} heading={showError ? undefined : t('personnel.empty')} isError={showError} testID="personnel-empty" />
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(person) => person.UserId}
          renderItem={({ item }) => <PersonnelCard person={item} canViewPII={canUserViewPII} onPress={select} hasPendingStatus={!!selectPendingPersonnelWrite({ queuedWrites }, item.UserId, 'status')} />}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />}
          contentContainerStyle={{ paddingBottom: 96, paddingTop: 8 }}
          testID="personnel-list"
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
        testID="personnel-filter-sheet"
      />
    </View>
  );
}
