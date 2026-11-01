import { Pressable, Text } from '@resgrid/ui';
import React from 'react';
import { StyleSheet, View } from 'react-native';

export interface Choice<V extends string | number> {
  value: V;
  label: string;
  color?: string;
}

export interface ChoiceChipsProps<V extends string | number> {
  choices: readonly Choice<V>[];
  selected: V | null;
  onSelect: (value: V) => void;
  accessibilityLabel: string;
  testID: string;
}

/**
 * Single-choice chips for sheet forms (lane type, objective type, need category, role, timer interval). Own copy rather
 * than the calls feature's OptionChips: the calls detail screen registers this feature's tab, so importing calls here
 * would make a cycle.
 */
export function ChoiceChips<V extends string | number>({ choices, selected, onSelect, accessibilityLabel, testID }: ChoiceChipsProps<V>) {
  return (
    <View style={styles.wrap} accessibilityRole="radiogroup" accessibilityLabel={accessibilityLabel} testID={testID}>
      {choices.map((choice) => {
        const isSelected = choice.value === selected;
        return (
          <Pressable
            key={String(choice.value)}
            onPress={() => onSelect(choice.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected: isSelected }}
            accessibilityLabel={choice.label}
            testID={`${testID}-${String(choice.value)}`}
            className={`mb-2 mr-2 flex-row items-center rounded-full border px-3 py-1.5 ${isSelected ? 'border-primary-600 bg-primary-100' : 'border-outline-300 bg-background-0'}`}
          >
            {choice.color ? <View style={StyleSheet.flatten([styles.swatch, { backgroundColor: choice.color }])} /> : null}
            <Text size="sm" className={isSelected ? 'font-semibold text-primary-800' : 'text-typography-700'}>
              {choice.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
  swatch: { width: 12, height: 12, borderRadius: 6, marginRight: 6 },
});
