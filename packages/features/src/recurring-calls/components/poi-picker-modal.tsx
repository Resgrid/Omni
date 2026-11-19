import { CallModalFrame, destinationPoiLabel, filterDestinationPois } from '@resgrid/features/calls';
import { useTranslation } from '@resgrid/i18n';
import type { PoiResultData } from '@resgrid/models';
import { Button, ButtonText, FlatList, Input, InputField, Pressable, Spinner, Text, useThemeColors } from '@resgrid/ui';
import { Check } from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

export interface PoiPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  pois: readonly PoiResultData[];
  selectedId: number | null;
  /** The picked POI, or null to clear the choice. */
  onSelect: (poi: PoiResultData | null) => void;
  /** The list is being read. */
  isLoading?: boolean;
  /** The last read failed: with nothing to show, the picker offers `onRetry` instead of "none found". */
  loadFailed?: boolean;
  onRetry?: () => void;
  testID: string;
}

/**
 * Picks one of the department's points of interest from a searchable list (a schedule's pickup facility or its call's
 * destination), with "None" to clear the choice. Same search and order as the call form's destination picker.
 */
export const PoiPickerModal: React.FC<PoiPickerModalProps> = ({ isOpen, onClose, title, pois, selectedId, onSelect, isLoading = false, loadFailed = false, onRetry, testID }) => {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const [query, setQuery] = useState('');
  const visible = useMemo(() => filterDestinationPois(pois, query), [pois, query]);

  useEffect(() => {
    if (isOpen) setQuery('');
  }, [isOpen]);

  const renderItem = ({ item }: { item: PoiResultData }) => {
    const label = destinationPoiLabel(item);
    const isSelected = item.PoiId === selectedId;

    return (
      <Pressable
        onPress={() => onSelect(item)}
        accessibilityRole="button"
        accessibilityLabel={[label, item.PoiTypeName, item.Address].filter((part) => !!part).join(', ')}
        accessibilityState={{ selected: isSelected }}
        className="flex-row items-center border-b border-outline-100 px-4 py-3"
        testID={`${testID}-poi-${item.PoiId}`}
      >
        <View style={styles.rowText}>
          <Text className="font-medium text-typography-900">{label}</Text>
          {item.PoiTypeName || item.Address ? (
            <Text size="xs" className="text-typography-500">
              {[item.PoiTypeName, item.Address && item.Address !== label ? item.Address : null].filter((part) => !!part).join(' · ')}
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
  };

  // "None found" only after a list was read (or for a search with no match): a failed read offers a retry instead.
  const renderEmpty = () => {
    if (pois.length === 0 && isLoading) {
      return (
        <View className="py-4" testID={`${testID}-loading`}>
          <Spinner />
        </View>
      );
    }

    if (pois.length === 0 && loadFailed) {
      return (
        <View className="items-center px-4 py-4" testID={`${testID}-error`}>
          <Text className="mb-2 text-center text-typography-600">{t('recurring_calls.poi_load_error')}</Text>
          {onRetry ? (
            <Button size="sm" variant="outline" onPress={onRetry} testID={`${testID}-retry`}>
              <ButtonText>{t('common.retry')}</ButtonText>
            </Button>
          ) : null}
        </View>
      );
    }

    return (
      <Text className="py-4 text-center text-typography-500" testID={`${testID}-empty`}>
        {t('recurring_calls.poi_none_found')}
      </Text>
    );
  };

  return (
    <CallModalFrame isOpen={isOpen} onClose={onClose} title={title} scrollable={false} testID={testID}>
      <View style={styles.search}>
        <Input variant="outline" size="sm">
          <InputField value={query} onChangeText={setQuery} placeholder={t('recurring_calls.poi_search')} accessibilityLabel={t('recurring_calls.poi_search')} testID={`${testID}-search`} />
        </Input>
      </View>
      <Pressable onPress={() => onSelect(null)} accessibilityRole="button" className="border-b border-outline-100 px-4 py-3" testID={`${testID}-none`}>
        <Text className="text-typography-700">{t('recurring_calls.poi_none')}</Text>
      </Pressable>
      {visible.length === 0 ? renderEmpty() : <FlatList data={visible} keyExtractor={(poi: PoiResultData) => String(poi.PoiId)} renderItem={renderItem} keyboardShouldPersistTaps="handled" testID={`${testID}-list`} />}
    </CallModalFrame>
  );
};

const styles = StyleSheet.create({
  search: { paddingHorizontal: 16, paddingVertical: 8 },
  rowText: { flex: 1 },
});
