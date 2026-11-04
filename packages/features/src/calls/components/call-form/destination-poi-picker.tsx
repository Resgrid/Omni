import { useTranslation } from '@resgrid/i18n';
import type { PoiResultData } from '@resgrid/models';
import { FlatList, Input, InputField, InputIcon, InputSlot, Pressable, Text, useThemeColors } from '@resgrid/ui';
import { Check, Search } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { CallModalFrame } from '../call-modal-frame';

/** The name a destination shows: its name, else its address, else its id. */
export const destinationPoiLabel = (poi: Pick<PoiResultData, 'PoiId' | 'Name' | 'Address'>): string => poi.Name?.trim() || poi.Address?.trim() || String(poi.PoiId);

/** Search covers what a row shows: the name, the type and the address. */
const matchesPoi = (poi: PoiResultData, needle: string): boolean => !needle || [poi.Name, poi.PoiTypeName, poi.Address].some((value) => !!value && value.toLowerCase().includes(needle));

/** The department's destinations, alphabetically (a department can have hundreds), narrowed by the search text. */
export function filterDestinationPois(pois: readonly PoiResultData[], query: string): PoiResultData[] {
  const needle = query.trim().toLowerCase();

  return pois.filter((poi) => matchesPoi(poi, needle)).sort((a, b) => destinationPoiLabel(a).localeCompare(destinationPoiLabel(b)));
}

export interface DestinationPoiPickerProps {
  isOpen: boolean;
  onClose: () => void;
  pois: readonly PoiResultData[];
  selectedId: number | null;
  onSelect: (poiId: number) => void;
}

/** Picks the call's destination POI from a searchable list. */
export const DestinationPoiPicker: React.FC<DestinationPoiPickerProps> = ({ isOpen, onClose, pois, selectedId, onSelect }) => {
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
          onPress={() => onSelect(item.PoiId)}
          accessibilityRole="button"
          accessibilityLabel={detail ? `${label}, ${detail}` : label}
          accessibilityState={{ selected: isSelected }}
          testID={`call-destination-poi-${item.PoiId}`}
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

  return (
    <CallModalFrame isOpen={isOpen} onClose={onClose} title={t('calls.destination_poi_select')} scrollable={false} testID="call-destination-picker">
      <View style={styles.search}>
        <Input variant="outline" size="sm">
          <InputSlot className="pl-3">
            <InputIcon as={Search} />
          </InputSlot>
          <InputField value={query} onChangeText={setQuery} placeholder={t('calls.destination_poi_search')} accessibilityLabel={t('calls.destination_poi_search')} testID="call-destination-search" />
        </Input>
      </View>
      {visible.length === 0 ? (
        <Text className="py-4 text-center text-typography-500" testID="call-destination-empty">
          {t('calls.destination_poi_none_found')}
        </Text>
      ) : (
        <FlatList data={visible} keyExtractor={(poi: PoiResultData) => String(poi.PoiId)} renderItem={renderItem} keyboardShouldPersistTaps="handled" testID="call-destination-list" />
      )}
    </CallModalFrame>
  );
};

const styles = StyleSheet.create({
  search: { paddingHorizontal: 16, paddingVertical: 8 },
  rowText: { flex: 1 },
});
