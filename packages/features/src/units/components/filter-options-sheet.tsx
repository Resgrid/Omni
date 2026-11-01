import { useTranslation } from '@resgrid/i18n';
import { type FilterResultData } from '@resgrid/models';
import { Button, ButtonText, CustomBottomSheet, HStack, Pressable, ScrollView, Text, View, VStack } from '@resgrid/ui';
import { Check } from 'lucide-react-native';
import React, { useMemo } from 'react';

export interface FilterOptionsSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  options: readonly FilterResultData[];
  selected: readonly string[];
  onToggle: (filterId: string) => void;
  onClear: () => void;
  isLoading?: boolean;
  testID?: string;
}

/** The server's filter options (groups, unit types, roles…) grouped by type, multi-select (Responder units/personnel sheets). */
export const FilterOptionsSheet: React.FC<FilterOptionsSheetProps> = ({ isOpen, onClose, title, options, selected, onToggle, onClear, isLoading = false, testID = 'filter-options-sheet' }) => {
  const { t } = useTranslation();
  const groups = useMemo(() => {
    const byType = new Map<string, FilterResultData[]>();
    options.forEach((option) => byType.set(option.Type || '', [...(byType.get(option.Type || '') ?? []), option]));
    return [...byType.entries()];
  }, [options]);

  const showLoading = isLoading && options.length === 0;

  return (
    <CustomBottomSheet isOpen={isOpen} onClose={onClose} isLoading={showLoading} snapPoints={[70]} testID={testID}>
      <VStack space="md" className="w-full flex-1">
        <HStack className="items-center justify-between">
          <Text className="text-lg font-bold text-typography-900">{title}</Text>
          {selected.length > 0 ? (
            <Button variant="link" size="sm" onPress={onClear} testID={`${testID}-clear`}>
              <ButtonText>{t('units.clear_filters')}</ButtonText>
            </Button>
          ) : null}
        </HStack>
        <ScrollView className="flex-1">
          {options.length === 0 ? <Text className="py-4 text-center text-typography-500">{t('units.no_filters_available')}</Text> : null}
          {groups.map(([type, items]) => (
            <VStack key={type || 'other'} space="xs" className="mb-3">
              {type ? <Text className="text-xs font-semibold uppercase text-typography-500">{type}</Text> : null}
              {items.map((item) => {
                const isSelected = selected.includes(item.Id);
                return (
                  <Pressable
                    key={item.Id}
                    testID={`${testID}-option-${item.Id}`}
                    onPress={() => onToggle(item.Id)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: isSelected }}
                    className="rounded-lg px-2 py-2.5"
                  >
                    <HStack space="sm" className="items-center">
                      <View className={`size-5 items-center justify-center rounded border-2 ${isSelected ? 'border-primary-500 bg-primary-500' : 'border-outline-300'}`}>
                        {isSelected ? <Check size={12} color="#ffffff" /> : null}
                      </View>
                      <Text className="flex-1 text-typography-900">{item.Name}</Text>
                    </HStack>
                  </Pressable>
                );
              })}
            </VStack>
          ))}
        </ScrollView>
        <Button onPress={onClose} testID={`${testID}-done`}>
          <ButtonText>{t('common.done')}</ButtonText>
        </Button>
      </VStack>
    </CustomBottomSheet>
  );
};
