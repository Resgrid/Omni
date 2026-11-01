import { useTranslation } from '@resgrid/i18n';
import { CustomBottomSheet, Heading, HStack, Pressable, Text, useThemeColors, VStack } from '@resgrid/ui';
import { Check } from 'lucide-react-native';
import React from 'react';
import { View } from 'react-native';

export interface SheetOption<T extends string> {
  value: T;
  label: string;
  description?: string;
}

export interface OptionSheetProps<T extends string> {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  options: readonly SheetOption<T>[];
  selected: T | null;
  onSelect: (value: T) => void;
  testID?: string;
}

/**
 * A single-choice list in a bottom sheet (language, theme, navigation app, server…). Rows are radio buttons for assistive
 * technology; selecting one closes the sheet. Used instead of gluestack Select so it works inside other sheets and on web.
 */
export function OptionSheet<T extends string>({ isOpen, onClose, title, options, selected, onSelect, testID = 'option-sheet' }: OptionSheetProps<T>) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  return (
    <CustomBottomSheet isOpen={isOpen} onClose={onClose} snapPoints={[60]} testID={testID}>
      <VStack space="sm" className="w-full" accessibilityRole="radiogroup" accessibilityLabel={title}>
        <Heading size="md" accessibilityRole="header">
          {title}
        </Heading>
        {options.map((option) => {
          const isSelected = option.value === selected;
          return (
            <Pressable
              key={option.value}
              onPress={() => {
                onSelect(option.value);
                onClose();
              }}
              accessibilityRole="radio"
              accessibilityState={{ checked: isSelected, selected: isSelected }}
              accessibilityLabel={option.description ? `${option.label}, ${option.description}` : option.label}
              testID={`${testID}-option-${option.value}`}
              className={`rounded-lg px-3 py-3 ${isSelected ? 'bg-background-100' : ''}`}
            >
              <HStack className="items-center justify-between">
                <VStack className="flex-1">
                  <Text className={isSelected ? 'font-semibold' : ''}>{option.label}</Text>
                  {option.description ? (
                    <Text size="xs" className="text-typography-500">
                      {option.description}
                    </Text>
                  ) : null}
                </VStack>
                {isSelected ? (
                  <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                    <Check size={20} color={colors.primary} />
                  </View>
                ) : null}
              </HStack>
            </Pressable>
          );
        })}
        {options.length === 0 ? <Text className="text-typography-500">{t('common.no_results_found')}</Text> : null}
      </VStack>
    </CustomBottomSheet>
  );
}
