import { useTranslation } from '@resgrid/i18n';
import type { PoiResultData } from '@resgrid/models';
import { Button, ButtonText, FlatList, Input, InputField, InputIcon, InputSlot, Pressable, Spinner, Text, useThemeColors } from '@resgrid/ui';
import { Check, Search } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { CallModalFrame } from '../call-modal-frame';
import { destinationPoiLabel, filterDestinationPois } from './destination-poi-picker';

export interface LocationPoiPickerProps {
  isOpen: boolean;
  onClose: () => void;
  /** The department's points of interest, any type (`Mapping/GetPois`). */
  pois: readonly PoiResultData[];
  selectedId: number | null;
  onSelect: (poi: PoiResultData) => void;
  /** The list is being read. */
  isLoading?: boolean;
  /** The last read failed: with nothing to show, the picker offers `onRetry` instead of "none found". */
  loadFailed?: boolean;
  onRetry?: () => void;
}

/**
 * Picks the point of interest the call location comes from (Core M0322 `LocationPoiId`): any of the department's POIs,
 * searchable by name, type and address, alphabetically (the same search and order as the destination picker).
 */
export const LocationPoiPicker: React.FC<LocationPoiPickerProps> = ({ isOpen, onClose, pois, selectedId, onSelect, isLoading = false, loadFailed = false, onRetry }) => {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const [query, setQuery] = useState('');
  const visible = useMemo(() => filterDestinationPois(pois, query), [pois, query]);

  useEffect(() => {
    if (isOpen) setQuery('');
  }, [isOpen]);

  const renderItem = useCallback(
    ({ item }: { item: PoiResultData }) => {
      const label = destinationPoiLabel(item);
      const detail = [item.PoiTypeName, item.Address && item.Address !== label ? item.Address : ''].filter((part) => !!part?.trim()).join(' · ');
      const isSelected = item.PoiId === selectedId;

      return (
        <Pressable
          onPress={() => onSelect(item)}
          accessibilityRole="button"
          accessibilityLabel={[label, detail].filter((part) => !!part).join(', ')}
          accessibilityState={{ selected: isSelected }}
          testID={`call-location-poi-${item.PoiId}`}
          className="flex-row items-center border-b border-outline-100 px-4 py-3"
        >
          <View style={styles.rowText}>
            <Text className="font-medium text-typography-900">{label}</Text>
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
    [colors.primary, onSelect, selectedId]
  );

  // "None found" only after a list was read (or for a search with no match): a failed read offers a retry instead.
  const renderEmpty = () => {
    if (pois.length === 0 && isLoading) {
      return (
        <View className="py-4" testID="call-location-poi-loading">
          <Spinner />
        </View>
      );
    }

    if (pois.length === 0 && loadFailed) {
      return (
        <View className="items-center px-4 py-4" testID="call-location-poi-error">
          <Text className="mb-2 text-center text-typography-600">{t('calls.location_poi_load_error')}</Text>
          {onRetry ? (
            <Button size="sm" variant="outline" onPress={onRetry} testID="call-location-poi-retry">
              <ButtonText>{t('common.retry')}</ButtonText>
            </Button>
          ) : null}
        </View>
      );
    }

    return (
      <Text className="py-4 text-center text-typography-500" testID="call-location-poi-empty">
        {t('calls.location_poi_none_found')}
      </Text>
    );
  };

  return (
    <CallModalFrame isOpen={isOpen} onClose={onClose} title={t('calls.location_poi_select')} scrollable={false} testID="call-location-poi-picker">
      <View style={styles.search}>
        <Input variant="outline" size="sm">
          <InputSlot className="pl-3">
            <InputIcon as={Search} />
          </InputSlot>
          <InputField value={query} onChangeText={setQuery} placeholder={t('calls.location_poi_search')} accessibilityLabel={t('calls.location_poi_search')} testID="call-location-poi-search" />
        </Input>
      </View>
      {visible.length === 0 ? (
        renderEmpty()
      ) : (
        <FlatList data={visible} keyExtractor={(poi: PoiResultData) => String(poi.PoiId)} renderItem={renderItem} keyboardShouldPersistTaps="handled" testID="call-location-poi-list" />
      )}
    </CallModalFrame>
  );
};

const styles = StyleSheet.create({
  search: { paddingHorizontal: 16, paddingVertical: 8 },
  rowText: { flex: 1 },
});
