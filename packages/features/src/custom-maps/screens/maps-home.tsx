import { pushRoutePath } from '@resgrid/core/navigation/route-paths';
import { useCustomMapsStore } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import type { CustomMapResultData, IndoorMapResultData } from '@resgrid/models';
import { Badge, BadgeText, HStack, Loading, Pressable, RefreshControl, ScrollView, Text, View, VStack, ZeroState } from '@resgrid/ui';
import { router } from 'expo-router';
import { Building2, Map as MapIcon, Search } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet } from 'react-native';

import { CUSTOM_MAP_TYPE_KEYS, listedCustomMaps } from '../lib/map-viewer';
import { customMapsRoutes } from '../routes';

/**
 * The department's custom and indoor maps (`/maps`, Unit/IC `app/maps/index`): a search entry, the custom maps (outdoor,
 * event and general) and the indoor maps with their floor counts. The lists are kept on the device, so they open offline.
 */
export default function MapsHomeScreen() {
  const { t } = useTranslation();
  const customMaps = useCustomMapsStore((state) => state.customMaps);
  const indoorMaps = useCustomMapsStore((state) => state.indoorMaps);
  const indoorMapById = useCustomMapsStore((state) => state.indoorMapById);
  const isLoading = useCustomMapsStore((state) => state.loading.customMaps === true || state.loading.indoorMaps === true);
  const hasError = useCustomMapsStore((state) => !!state.errors.customMaps && !!state.errors.indoorMaps);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (bypassCache: boolean) => {
    const store = useCustomMapsStore.getState();
    await Promise.all([store.fetchCustomMaps(undefined, { bypassCache }), store.fetchIndoorMaps({ bypassCache })]);
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load(true);
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  const custom = useMemo(() => listedCustomMaps(customMaps), [customMaps]);
  const indoor = useMemo(() => [...indoorMaps].sort((a, b) => a.Name.localeCompare(b.Name)), [indoorMaps]);
  const isEmpty = custom.length === 0 && indoor.length === 0;

  const renderCustom = (map: CustomMapResultData) => (
    <Pressable key={map.IndoorMapId} onPress={() => pushRoutePath(router, customMapsRoutes.custom(map.IndoorMapId))} accessibilityRole="button" testID={`maps-custom-${map.IndoorMapId}`}>
      <HStack space="md" className="mb-2 items-center rounded-xl border border-outline-200 bg-background-0 p-3">
        <View style={styles.icon} className="bg-info-100">
          <MapIcon size={20} color="#2563eb" />
        </View>
        <VStack className="flex-1">
          <Text className="text-base font-semibold text-typography-900">{map.Name}</Text>
          {map.Description ? (
            <Text className="text-sm text-typography-500" numberOfLines={1}>
              {map.Description}
            </Text>
          ) : null}
        </VStack>
        {CUSTOM_MAP_TYPE_KEYS[map.MapType] ? (
          <Badge action="info" variant="outline" size="sm">
            <BadgeText>{t(CUSTOM_MAP_TYPE_KEYS[map.MapType])}</BadgeText>
          </Badge>
        ) : null}
      </HStack>
    </Pressable>
  );

  const renderIndoor = (map: IndoorMapResultData) => {
    const floors = indoorMapById[map.IndoorMapId]?.Floors?.length;
    return (
      <Pressable key={map.IndoorMapId} onPress={() => pushRoutePath(router, customMapsRoutes.indoor(map.IndoorMapId))} accessibilityRole="button" testID={`maps-indoor-${map.IndoorMapId}`}>
        <HStack space="md" className="mb-2 items-center rounded-xl border border-outline-200 bg-background-0 p-3">
          <View style={styles.icon} className="bg-secondary-100">
            <Building2 size={20} color="#7c3aed" />
          </View>
          <VStack className="flex-1">
            <Text className="text-base font-semibold text-typography-900">{map.Name}</Text>
            {map.Description ? (
              <Text className="text-sm text-typography-500" numberOfLines={1}>
                {map.Description}
              </Text>
            ) : null}
            {typeof floors === 'number' ? <Text className="text-xs text-typography-400">{t('maps.floor_count', { count: floors })}</Text> : null}
          </VStack>
          <Badge action="muted" variant="outline" size="sm">
            <BadgeText>{t('maps.indoor')}</BadgeText>
          </Badge>
        </HStack>
      </Pressable>
    );
  };

  return (
    <View className="flex-1 bg-background-50" testID="maps-home-screen">
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}>
        <Pressable onPress={() => router.push(customMapsRoutes.search())} accessibilityRole="search" testID="maps-home-search">
          <HStack space="sm" className="mb-4 items-center rounded-lg border border-outline-200 bg-background-0 px-3 py-3">
            <Search size={18} color="#6b7280" />
            <Text className="text-typography-500">{t('maps.search_placeholder')}</Text>
          </HStack>
        </Pressable>
        {isEmpty && isLoading ? <Loading text={t('maps.loading')} /> : null}
        {isEmpty && !isLoading ? (
          <ZeroState icon={MapIcon} isError={hasError} heading={hasError ? t('maps.error_loading') : t('maps.no_maps')} description={hasError ? undefined : t('maps.no_maps_description')} testID="maps-home-empty" />
        ) : null}
        {custom.length > 0 ? (
          <VStack className="mb-2">
            <Text className="mb-2 text-lg font-bold text-typography-900">{t('maps.custom_maps')}</Text>
            {custom.map(renderCustom)}
          </VStack>
        ) : null}
        {indoor.length > 0 ? (
          <VStack>
            <Text className="mb-2 text-lg font-bold text-typography-900">{t('maps.indoor_maps')}</Text>
            {indoor.map(renderIndoor)}
          </VStack>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 32 },
  icon: { alignItems: 'center', borderRadius: 8, height: 36, justifyContent: 'center', width: 36 },
});
