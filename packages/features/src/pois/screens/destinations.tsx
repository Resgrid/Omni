import { useCapability } from '@resgrid/config';
import { pushRoutePath } from '@resgrid/core/navigation/route-paths';
import { usePoisStore } from '@resgrid/data';
import { useDepartmentTimeZone } from '@resgrid/features/department-config';
import { useTranslation } from '@resgrid/i18n';
import { type PoiResultData } from '@resgrid/models';
import { Box, FlatList, HStack, Input, InputField, InputIcon, InputSlot, Loading, RefreshControl, ScrollRow, ScrollView, TabBar, type TabBarItem, Text, View, ZeroState } from '@resgrid/ui';
import { router } from 'expo-router';
import { Hospital, ListChecks, Search, ShieldCheck, X } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { CapabilitySummaryRow, DestinationAvailabilityRow, DestinationRuleCard } from '../components/destination-board-parts';
import { CapabilityFilterChips, DestinationFilterChip } from '../components/destination-parts';
import { PoiAvailabilitySheet } from '../components/poi-availability-sheet';
import {
  type CapabilitySummary,
  countAvailability,
  type DestinationBoardFilter,
  destinationTypeOptions,
  EMPTY_DESTINATION_BOARD_FILTER,
  filterDestinations,
  suggestionModeLabelKey,
  summarizeCapabilities,
} from '../lib/destination-board';
import { poisRoutes } from '../routes';

export type DestinationsTab = 'availability' | 'capabilities' | 'rules';

export interface DestinationsScreenProps {
  /** The tab shown first (default availability). */
  initialTab?: DestinationsTab;
}

/**
 * Destinations (Dispatch): every destination with what it offers and whether it can take a patient now (with "Set
 * availability" for dispatchers), the department's capabilities with how many destinations offer each and how many cannot
 * provide it now, and the destination rules and suggestions setting that decide which destination a call is suggested
 * (read-only: set on the web under Mapping -> POIs -> Destination Rules).
 */
export default function DestinationsScreen({ initialTab = 'availability' }: DestinationsScreenProps) {
  const { t } = useTranslation();
  const { destinationAvailability } = useCapability('calls');
  const timeZone = useDepartmentTimeZone();
  const destinations = usePoisStore((state) => state.destinationPois);
  const capabilities = usePoisStore((state) => state.poiCapabilities);
  const rules = usePoisStore((state) => state.destinationRules);
  const isLoading = usePoisStore((state) => state.loading.destinationPois === true);
  const isRulesLoading = usePoisStore((state) => state.loading.destinationRules === true);
  const [tab, setTab] = useState<DestinationsTab>(initialTab);
  const [filter, setFilter] = useState<DestinationBoardFilter>(EMPTY_DESTINATION_BOARD_FILTER);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [editing, setEditing] = useState<PoiResultData | null>(null);

  // Availability changes by the hour: read it fresh on open, showing the stored copy meanwhile (and offline).
  useEffect(() => {
    void usePoisStore.getState().fetchDestinationPois({ bypassCache: true });
    void usePoisStore.getState().fetchPoiCapabilities({ bypassCache: true });
    void usePoisStore.getState().fetchDestinationRules({ bypassCache: true });
  }, []);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await Promise.all([
      usePoisStore.getState().fetchDestinationPois({ bypassCache: true }),
      usePoisStore.getState().fetchPoiCapabilities({ bypassCache: true }),
      usePoisStore.getState().fetchDestinationRules({ bypassCache: true }),
    ]);
    setIsRefreshing(false);
  }, []);

  const counts = useMemo(() => countAvailability(destinations), [destinations]);
  const visible = useMemo(() => filterDestinations(destinations, filter), [destinations, filter]);
  const typeOptions = useMemo(() => destinationTypeOptions(destinations), [destinations]);
  const capabilitySummaries = useMemo(() => summarizeCapabilities(capabilities, destinations), [capabilities, destinations]);
  const capabilityOptions = useMemo(() => capabilitySummaries.filter((summary) => summary.offeredBy > 0), [capabilitySummaries]);
  const notOpen = counts.total - counts.open;

  const tabs = useMemo<TabBarItem<DestinationsTab>[]>(
    () => [
      { key: 'availability', label: t('pois.destinations.tab_availability'), badge: notOpen > 0 ? notOpen : undefined, badgeVariant: 'warning', testID: 'destinations-tab-availability' },
      { key: 'capabilities', label: t('pois.destinations.tab_capabilities'), testID: 'destinations-tab-capabilities' },
      { key: 'rules', label: t('pois.destinations.tab_rules'), testID: 'destinations-tab-rules' },
    ],
    [notOpen, t]
  );

  const openPoi = useCallback((poi: PoiResultData) => pushRoutePath(router, poisRoutes.detail(poi.PoiId)), []);

  const showCapability = useCallback((summary: CapabilitySummary) => {
    setFilter({ ...EMPTY_DESTINATION_BOARD_FILTER, capabilityId: summary.id });
    setTab('availability');
  }, []);

  const refreshControl = <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />;

  const renderAvailability = () => (
    <View className="flex-1" testID="destinations-availability">
      <Input className="mb-2 bg-background-0" size="md" variant="outline">
        <InputSlot className="pl-3">
          <InputIcon as={Search} />
        </InputSlot>
        <InputField
          testID="destinations-search"
          placeholder={t('pois.destinations.search')}
          value={filter.query}
          onChangeText={(query) => setFilter((current) => ({ ...current, query }))}
          accessibilityLabel={t('pois.destinations.search')}
        />
        {filter.query ? (
          <InputSlot className="pr-3" onPress={() => setFilter((current) => ({ ...current, query: '' }))} accessibilityRole="button" accessibilityLabel={t('common.clear_search')}>
            <InputIcon as={X} />
          </InputSlot>
        ) : null}
      </Input>
      <ScrollRow className="mb-2" testID="destinations-status-chips">
        <HStack space="sm">
          <DestinationFilterChip
            label={t('pois.destinations.filter_all', { count: counts.total })}
            selected={filter.status === 'all'}
            onPress={() => setFilter((current) => ({ ...current, status: 'all' }))}
            testID="destinations-status-all"
          />
          <DestinationFilterChip
            label={t('pois.destinations.filter_not_open', { count: notOpen })}
            selected={filter.status === 'not_open'}
            onPress={() => setFilter((current) => ({ ...current, status: current.status === 'not_open' ? 'all' : 'not_open' }))}
            testID="destinations-status-not-open"
          />
          {typeOptions.length > 1
            ? typeOptions.map((type) => (
                <DestinationFilterChip
                  key={type.id}
                  label={type.name}
                  selected={filter.poiTypeId === type.id}
                  onPress={() => setFilter((current) => ({ ...current, poiTypeId: current.poiTypeId === type.id ? null : type.id }))}
                  testID={`destinations-type-${type.id}`}
                />
              ))
            : null}
        </HStack>
      </ScrollRow>
      <CapabilityFilterChips options={capabilityOptions} selectedId={filter.capabilityId} onChange={(capabilityId) => setFilter((current) => ({ ...current, capabilityId }))} testID="destinations-capability-chips" />
      <Text className="mb-2 text-xs text-typography-500" testID="destinations-counts">
        {t('pois.destinations.counts', { open: counts.open, limited: counts.limited, diversion: counts.diversion, closed: counts.closed })}
      </Text>
      {isLoading && !isRefreshing && destinations.length === 0 ? (
        <Loading text={t('pois.destinations.loading')} />
      ) : visible.length === 0 ? (
        <ZeroState
          icon={Hospital}
          heading={destinations.length === 0 ? t('pois.destinations.empty') : t('pois.destinations.no_match')}
          description={destinations.length === 0 ? t('pois.destinations.empty_description') : undefined}
          onRetry={handleRefresh}
          testID="destinations-empty"
        />
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(poi) => String(poi.PoiId)}
          renderItem={({ item }) => <DestinationAvailabilityRow poi={item} timeZone={timeZone} onOpen={openPoi} onSetAvailability={destinationAvailability ? setEditing : undefined} />}
          refreshControl={refreshControl}
          contentContainerStyle={{ paddingBottom: 96 }}
          testID="destinations-list"
        />
      )}
    </View>
  );

  const renderCapabilities = () =>
    capabilitySummaries.length === 0 ? (
      <ZeroState
        icon={ListChecks}
        heading={t('pois.destinations.capabilities.empty')}
        description={t('pois.destinations.capabilities.empty_description')}
        onRetry={handleRefresh}
        testID="destinations-capabilities-empty"
      />
    ) : (
      <FlatList
        data={capabilitySummaries}
        keyExtractor={(summary) => summary.id}
        renderItem={({ item }) => <CapabilitySummaryRow summary={item} onPress={showCapability} />}
        ListHeaderComponent={<Text className="mb-2 text-xs text-typography-500">{t('pois.destinations.capabilities.intro')}</Text>}
        refreshControl={refreshControl}
        contentContainerStyle={{ paddingBottom: 96 }}
        testID="destinations-capabilities"
      />
    );

  const renderRules = () =>
    !rules && isRulesLoading ? (
      <Loading text={t('pois.destinations.rules.loading')} />
    ) : !rules ? (
      <ZeroState icon={ShieldCheck} heading={t('pois.destinations.rules.load_failed')} onRetry={handleRefresh} testID="destinations-rules-unavailable" />
    ) : (
      <ScrollView refreshControl={refreshControl} contentContainerStyle={{ paddingBottom: 96 }} testID="destinations-rules">
        <Box className="mb-3 rounded-xl border border-outline-200 bg-background-0 p-3" testID="destinations-rules-setting">
          <HStack space="sm" className="items-center justify-between">
            <Text className="text-sm font-semibold text-typography-700">{t('pois.destinations.rules.suggestions')}</Text>
            <Text className="text-sm text-typography-900" testID="destinations-rules-mode">
              {t(suggestionModeLabelKey(rules.Mode))}
            </Text>
          </HStack>
          <Text className="mt-1 text-xs text-typography-500">{t('pois.destinations.rules.window', { count: rules.PreferredWithinMinutes })}</Text>
          <Text className="mt-2 text-xs text-typography-500">{t('pois.destinations.rules.read_only')}</Text>
        </Box>
        {(rules.Rules ?? []).length === 0 ? (
          <ZeroState icon={ShieldCheck} heading={t('pois.destinations.rules.empty')} description={t('pois.destinations.rules.empty_description')} onRetry={handleRefresh} testID="destinations-rules-empty" />
        ) : (
          (rules.Rules ?? []).map((rule) => <DestinationRuleCard key={rule.DestinationRuleId} rule={rule} />)
        )}
      </ScrollView>
    );

  return (
    <View className="flex-1 bg-background-50 px-4 pt-4" testID="destinations-screen">
      <TabBar tabs={tabs} activeKey={tab} onChange={setTab} variant="pills" testID="destinations-tabs" />
      <View className="mt-3 flex-1">{tab === 'availability' ? renderAvailability() : tab === 'capabilities' ? renderCapabilities() : renderRules()}</View>
      {editing && destinationAvailability ? <PoiAvailabilitySheet isOpen onClose={() => setEditing(null)} poi={editing} onSaved={() => setEditing(null)} /> : null}
    </View>
  );
}
