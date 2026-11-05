import { useTranslation } from '@resgrid/i18n';
import { Input, InputField, InputIcon, InputSlot, Pressable, ScrollRow, Text } from '@resgrid/ui';
import { Search, X } from 'lucide-react-native';
import React from 'react';
import { StyleSheet } from 'react-native';

export interface ChecklistSearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  testID?: string;
}

/** The checklists screen's search box: one query shared by every tab, so switching tabs keeps what was typed. */
export const ChecklistSearchField: React.FC<ChecklistSearchFieldProps> = ({ value, onChange, testID = 'checklists-search' }) => {
  const { t } = useTranslation();
  return (
    <Input className="bg-background-0" size="md" variant="outline">
      <InputSlot className="pl-3">
        <InputIcon as={Search} />
      </InputSlot>
      <InputField value={value} onChangeText={onChange} placeholder={t('checklists.ui.search')} accessibilityLabel={t('checklists.ui.search')} returnKeyType="search" autoCorrect={false} testID={testID} />
      {value ? (
        <Pressable onPress={() => onChange('')} accessibilityRole="button" accessibilityLabel={t('common.clear_search')} className="justify-center px-3" testID={`${testID}-clear`}>
          <InputIcon as={X} />
        </Pressable>
      ) : null}
    </Input>
  );
};

export interface ChecklistFilterOption<V extends string> {
  value: V;
  label: string;
}

export interface ChecklistFilterChipsProps<V extends string> {
  options: readonly ChecklistFilterOption<V>[];
  value: V;
  onChange: (value: V) => void;
  testID: string;
}

/** One-choice filter chips in a single scrolling row (web/Electron-safe, no native picker). */
export function ChecklistFilterChips<V extends string>({ options, value, onChange, testID }: ChecklistFilterChipsProps<V>) {
  const { t } = useTranslation();
  return (
    <ScrollRow contentContainerStyle={styles.row} accessibilityRole="radiogroup" accessibilityLabel={t('checklists.ui.filters')} testID={testID}>
      {options.map((option) => {
        const isSelected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected: isSelected }}
            accessibilityLabel={option.label}
            testID={`${testID}-${option.value}`}
            className={`mr-2 rounded-full border px-3 py-1.5 ${isSelected ? 'border-primary-600 bg-primary-600' : 'border-outline-300 bg-background-0'}`}
          >
            <Text size="sm" className={isSelected ? 'font-semibold text-typography-0' : 'text-typography-700'}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollRow>
  );
}

const styles = StyleSheet.create({
  row: { paddingTop: 8 },
});
