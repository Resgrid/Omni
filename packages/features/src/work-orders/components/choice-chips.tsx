import { Pressable, Text } from '@resgrid/ui';
import React from 'react';
import { StyleSheet, View } from 'react-native';

export interface WorkOrderChoiceOption {
  value: string;
  label: string;
}

export interface WorkOrderChoiceChipsProps {
  options: readonly WorkOrderChoiceOption[];
  value: string;
  onChange: (value: string) => void;
  accessibilityLabel?: string;
  testID: string;
}

/** Single-choice chips for kind, priority, apparatus, station, equipment and the next status (no native picker; works in sheets and on web). */
export const WorkOrderChoiceChips: React.FC<WorkOrderChoiceChipsProps> = ({ options, value, onChange, accessibilityLabel, testID }) => (
  <View style={styles.wrap} accessibilityRole="radiogroup" accessibilityLabel={accessibilityLabel} testID={testID}>
    {options.map((option) => {
      const isSelected = option.value === value;
      return (
        <Pressable
          key={option.value || '__none'}
          onPress={() => onChange(option.value)}
          accessibilityRole="radio"
          accessibilityState={{ selected: isSelected }}
          accessibilityLabel={option.label}
          testID={`${testID}-${option.value || 'none'}`}
          className={`mb-2 mr-2 rounded-full border px-3 py-1.5 ${isSelected ? 'border-primary-600 bg-primary-100' : 'border-outline-300 bg-background-0'}`}
        >
          <Text size="sm" className={isSelected ? 'font-semibold text-primary-800' : 'text-typography-700'}>
            {option.label}
          </Text>
        </Pressable>
      );
    })}
  </View>
);

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
});
