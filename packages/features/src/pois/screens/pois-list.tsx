import { usePoisStore } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import { type PoiResultData } from '@resgrid/models';
import { FlatList, Input, InputField, InputIcon, InputSlot, Loading, RefreshControl, View, ZeroState } from '@resgrid/ui';
import { router } from 'expo-router';
import { MapPinned, Search, X } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { PoiCard } from '../components/poi-card';
import { PoiFilterBar } from '../components/poi-filter-bar';
import { collectPoiCapabilities, EMPTY_POI_FILTER, filterPois, poiLabel, type PoiListFilter } from '../lib/poi-filters';
import { poisRoutes } from '../routes';

export interface PoisListScreenProps {
  onSelectPoi?: (poi: PoiResultData) => void;
  /** Map slot: a POI map beside or above the list (MapLibre via @resgrid/maps, supplied by the app). */
  renderMap?: (pois: readonly PoiResultData[]) => React.ReactNode;
}

/** Points of interest (Dispatch list + R POI set): search, type/destination/capability filters, offline from the persisted store. */
export default function PoisListScreen({ onSelectPoi, renderMap }: PoisListScreenProps) {
  const { t } = useTranslation();
  const pois = usePoisStore((state) => state.pois);
  const poiTypes = usePoisStore((state) => state.poiTypes);
  const isLoading = usePoisStore((state) => state.loading.pois === true);
  const [filter, setFilter] = useState<PoiListFilter>(EMPTY_POI_FILTER);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    void usePoisStore.getState().fetchPois();
    void usePoisStore.getState().fetchPoiTypes();
  }, []);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await Promise.all([usePoisStore.getState().fetchPois({ bypassCache: true }), usePoisStore.getState().fetchPoiTypes({ bypassCache: true })]);
    setIsRefreshing(false);
  }, []);

  const capabilities = useMemo(() => collectPoiCapabilities(pois), [pois]);
  const visible = useMemo(() => filterPois(pois, filter).sort((a, b) => poiLabel(a).localeCompare(poiLabel(b))), [filter, pois]);
  const select = useCallback((poi: PoiResultData) => (onSelectPoi ? onSelectPoi(poi) : router.push(poisRoutes.detail(poi.PoiId))), [onSelectPoi]);

  return (
    <View className="flex-1 bg-background-50 px-4 pt-4" testID="pois-list-screen">
      <Input className="mb-2 bg-background-0" size="md" variant="outline">
        <InputSlot className="pl-3">
          <InputIcon as={Search} />
        </InputSlot>
        <InputField testID="pois-search" placeholder={t('pois.search')} value={filter.query} onChangeText={(query) => setFilter((current) => ({ ...current, query }))} accessibilityLabel={t('pois.search')} />
        {filter.query ? (
          <InputSlot className="pr-3" onPress={() => setFilter((current) => ({ ...current, query: '' }))} accessibilityRole="button" accessibilityLabel={t('common.clear_search')}>
            <InputIcon as={X} />
          </InputSlot>
        ) : null}
      </Input>
      <PoiFilterBar filter={filter} onChange={setFilter} poiTypes={poiTypes} capabilities={capabilities} />
      {renderMap ? <View className="mb-2 h-48 overflow-hidden rounded-xl">{renderMap(visible)}</View> : null}
      {isLoading && !isRefreshing && pois.length === 0 ? (
        <Loading text={t('pois.loading')} />
      ) : visible.length === 0 ? (
        <ZeroState icon={MapPinned} heading={t('pois.empty')} description={pois.length === 0 ? t('pois.empty_description') : undefined} testID="pois-empty" />
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(poi) => String(poi.PoiId)}
          renderItem={({ item }) => <PoiCard poi={item} onPress={select} />}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />}
          contentContainerStyle={{ paddingBottom: 96 }}
          testID="pois-list"
        />
      )}
    </View>
  );
}
