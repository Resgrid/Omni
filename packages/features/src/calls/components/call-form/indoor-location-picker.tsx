import { useCustomMapsStore } from '@resgrid/data';
import { uniqueMapFeatures } from '@resgrid/features/custom-maps/lib/map-features';
import { useTranslation } from '@resgrid/i18n';
import type { MapFeatureResultData } from '@resgrid/models';
import { FlatList, Input, InputField, InputIcon, InputSlot, Pressable, Spinner, Text, useThemeColors } from '@resgrid/ui';
import { Check, Search } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import type { PickedIndoorLocation } from '../../lib/call-form';
import { type IndoorLocationNames, searchResultToIndoorLocation } from '../../lib/indoor-location';
import { CallModalFrame } from '../call-modal-frame';

/** A search starts once typing pauses this long. */
export const INDOOR_SEARCH_DEBOUNCE_MS = 350;

export interface IndoorLocationPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (location: PickedIndoorLocation) => void;
  selectedZoneId: string | null;
  isOnline: boolean;
  /** "Room, Map". */
  formatName: (names: IndoorLocationNames) => string;
}

/**
 * Finds the call's indoor location by name across the department's indoor maps' rooms and custom maps' regions
 * (`Mapping/SearchAllMapFeatures`, online only). Picking one sets the indoor location and moves the call to the room.
 */
export const IndoorLocationPicker: React.FC<IndoorLocationPickerProps> = ({ isOpen, onClose, onSelect, selectedZoneId, isOnline, formatName }) => {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const [query, setQuery] = useState('');
  const results = useCustomMapsStore((state) => state.searchResults);
  const customMaps = useCustomMapsStore((state) => state.customMaps);
  const searchedTerm = useCustomMapsStore((state) => state.searchTerm);
  const isSearching = useCustomMapsStore((state) => state.loading.search === true);
  const failed = useCustomMapsStore((state) => !!state.errors.search);

  // Each opening starts a new search; the results are shared with the maps search screen, so they are cleared on close.
  useEffect(() => {
    setQuery('');
    useCustomMapsStore.getState().clearMapSearch();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !isOnline) return undefined;
    const term = query.trim();

    if (!term) {
      useCustomMapsStore.getState().clearMapSearch();

      return undefined;
    }

    const timer = setTimeout(() => void useCustomMapsStore.getState().searchMapFeatures(term, 'all'), INDOOR_SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [isOnline, isOpen, query]);

  const renderItem = useCallback(
    ({ item }: { item: MapFeatureResultData }) => {
      const detail = [item.MapName, item.FloorOrLayerName].filter((part) => !!part?.trim()).join(' · ');
      const isSelected = item.Id === selectedZoneId;

      return (
        <Pressable
          onPress={() => onSelect(searchResultToIndoorLocation(item, formatName))}
          accessibilityRole="button"
          accessibilityLabel={[item.Name, detail].filter((part) => !!part).join(', ')}
          accessibilityState={{ selected: isSelected }}
          testID={`call-indoor-location-${item.Id}`}
          className="flex-row items-center border-b border-outline-100 px-4 py-3"
        >
          <View style={styles.rowText}>
            <Text className="font-medium text-typography-900">{item.Name}</Text>
            {detail ? (
              <Text size="xs" className="text-typography-500">
                {detail}
              </Text>
            ) : null}
          </View>
          {isSelected ? (
            <View>
              <Check size={18} color={colors.primary} />
            </View>
          ) : null}
        </Pressable>
      );
    },
    [colors.primary, formatName, onSelect, selectedZoneId]
  );

  const term = query.trim();
  const showResults = term !== '' && searchedTerm === term;

  const renderEmpty = () => {
    if (!isOnline) {
      return (
        <Text className="px-4 py-4 text-center text-typography-500" testID="call-indoor-location-offline">
          {t('calls.indoor_location_offline')}
        </Text>
      );
    }

    if (!term) {
      return (
        <Text className="px-4 py-4 text-center text-typography-500" testID="call-indoor-location-hint">
          {t('calls.indoor_location_search_hint')}
        </Text>
      );
    }

    if (isSearching || !showResults) {
      return (
        <View className="py-4" testID="call-indoor-location-searching">
          <Spinner />
        </View>
      );
    }

    return (
      <Text className="px-4 py-4 text-center text-typography-500" testID={failed ? 'call-indoor-location-error' : 'call-indoor-location-empty'}>
        {t(failed ? 'maps.error_loading' : 'calls.indoor_location_none_found')}
      </Text>
    );
  };

  const shown = useMemo(() => (showResults && isOnline ? uniqueMapFeatures(results, customMaps) : []), [customMaps, isOnline, results, showResults]);

  return (
    <CallModalFrame isOpen={isOpen} onClose={onClose} title={t('calls.indoor_location_select')} scrollable={false} testID="call-indoor-location-picker">
      <View style={styles.search}>
        <Input variant="outline" size="sm">
          <InputSlot className="pl-3">
            <InputIcon as={Search} />
          </InputSlot>
          <InputField
            value={query}
            onChangeText={setQuery}
            placeholder={t('calls.indoor_location_search')}
            accessibilityLabel={t('calls.indoor_location_search')}
            editable={isOnline}
            testID="call-indoor-location-search"
          />
        </Input>
      </View>
      {shown.length === 0 ? (
        renderEmpty()
      ) : (
        <FlatList data={shown} keyExtractor={(item: MapFeatureResultData) => `${item.FeatureType}:${item.Id}`} renderItem={renderItem} keyboardShouldPersistTaps="handled" testID="call-indoor-location-list" />
      )}
    </CallModalFrame>
  );
};

const styles = StyleSheet.create({
  search: { paddingHorizontal: 16, paddingVertical: 8 },
  rowText: { flex: 1 },
});
