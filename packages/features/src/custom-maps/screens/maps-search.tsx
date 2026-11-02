import { type MapFeatureSearchScope, useCustomMapsStore } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import type { MapFeatureResultData } from '@resgrid/models';
import { HStack, Input, InputField, InputIcon, InputSlot, Loading, Pressable, ScreenHeader, ScrollView, Text, View, VStack, ZeroState } from '@resgrid/ui';
import { router } from 'expo-router';
import { Building2, Map as MapIcon, Search } from 'lucide-react-native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';

import { searchResultRoute } from '../lib/map-viewer';
import { customMapsRoutes } from '../routes';

/** Wait this long after the last keystroke before asking the server. */
export const MAP_SEARCH_DEBOUNCE_MS = 300;

const SCOPES: { value: MapFeatureSearchScope; labelKey: string }[] = [
  { value: 'all', labelKey: 'maps.all' },
  { value: 'indoor', labelKey: 'maps.indoor' },
  { value: 'custom', labelKey: 'maps.custom' },
];

/**
 * Search indoor zones and custom map regions by name (`/maps/search`, Unit/IC `app/maps/search`, `Mapping/SearchAllMapFeatures`):
 * a result opens its map at its floor or layer with the feature selected. Online only.
 */
export default function MapsSearchScreen() {
  const { t } = useTranslation();
  const results = useCustomMapsStore((state) => state.searchResults);
  const isLoading = useCustomMapsStore((state) => state.loading.search === true);
  const hasError = useCustomMapsStore((state) => !!state.errors.search);
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<MapFeatureSearchScope>('all');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      useCustomMapsStore.getState().clearMapSearch();
    },
    []
  );

  const search = useCallback((text: string, nextScope: MapFeatureSearchScope) => {
    if (timer.current) clearTimeout(timer.current);
    if (!text.trim()) {
      useCustomMapsStore.getState().clearMapSearch();
      return;
    }
    timer.current = setTimeout(() => void useCustomMapsStore.getState().searchMapFeatures(text, nextScope), MAP_SEARCH_DEBOUNCE_MS);
  }, []);

  const changeScope = (next: MapFeatureSearchScope) => {
    setScope(next);
    search(query, next);
  };

  const open = (item: MapFeatureResultData) => {
    const href = searchResultRoute(item);
    if (href) router.push(href);
  };

  const back = () => (router.canGoBack() ? router.back() : router.replace(customMapsRoutes.home()));

  return (
    <View className="flex-1 bg-background-50" testID="maps-search-screen">
      <ScreenHeader title={t('maps.search_maps')} onBack={back} />
      <VStack className="px-4 pt-3">
        <Input variant="outline" size="md" className="bg-background-0">
          <InputSlot className="pl-3">
            <InputIcon as={Search} />
          </InputSlot>
          <InputField
            value={query}
            onChangeText={(text: string) => {
              setQuery(text);
              search(text, scope);
            }}
            placeholder={t('maps.search_placeholder')}
            autoFocus
            returnKeyType="search"
            testID="maps-search-input"
          />
        </Input>
        <HStack space="sm" className="mt-3">
          {SCOPES.map((option) => (
            <Pressable
              key={option.value}
              onPress={() => changeScope(option.value)}
              accessibilityRole="button"
              accessibilityState={{ selected: scope === option.value }}
              className={`rounded-full border px-3 py-1 ${scope === option.value ? 'border-primary-500 bg-primary-50' : 'border-outline-200 bg-background-0'}`}
              testID={`maps-search-scope-${option.value}`}
            >
              <Text className={scope === option.value ? 'text-primary-700' : 'text-typography-700'}>{t(option.labelKey)}</Text>
            </Pressable>
          ))}
        </HStack>
      </VStack>
      <ScrollView contentContainerStyle={styles.results} keyboardShouldPersistTaps="handled">
        {isLoading && results.length === 0 ? <Loading text={t('maps.loading')} /> : null}
        {!isLoading && query.trim() && results.length === 0 ? <ZeroState icon={Search} isError={hasError} heading={hasError ? t('maps.error_loading') : t('maps.no_results')} testID="maps-search-empty" /> : null}
        {results.map((item) => {
          const indoor = item.FeatureType === 'indoor_zone';
          return (
            <Pressable key={`${item.FeatureType}:${item.Id}`} onPress={() => open(item)} accessibilityRole="button" testID={`maps-search-result-${item.Id}`}>
              <HStack space="md" className="mb-2 items-center rounded-xl border border-outline-200 bg-background-0 p-3">
                <View>{indoor ? <Building2 size={20} color="#7c3aed" /> : <MapIcon size={20} color="#2563eb" />}</View>
                <VStack className="flex-1">
                  <Text className="text-base font-semibold text-typography-900">{item.Name}</Text>
                  <Text className="text-xs text-typography-500" numberOfLines={1}>
                    {[t(indoor ? 'maps.indoor_zone' : 'maps.custom_region'), item.MapName, item.FloorOrLayerName].filter((part): part is string => !!part).join(' · ')}
                  </Text>
                  {item.Description ? (
                    <Text className="text-sm text-typography-600" numberOfLines={2}>
                      {item.Description}
                    </Text>
                  ) : null}
                </VStack>
              </HStack>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({ results: { padding: 16, paddingBottom: 32 } });
