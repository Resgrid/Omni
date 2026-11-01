import { Pressable, Text } from '@resgrid/ui';
import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

export interface ChipOption<V extends string | number> {
  value: V;
  label: string;
  /** Optional swatch (priority colour). */
  color?: string | null;
}

export interface OptionChipsProps<V extends string | number> {
  options: readonly ChipOption<V>[];
  selected: readonly V[];
  onToggle: (value: V) => void;
  /** Radio semantics (one value) or checkbox semantics (many). */
  mode?: 'single' | 'multiple';
  /** One scrolling row instead of wrapping. */
  scroll?: boolean;
  accessibilityLabel?: string;
  testID?: string;
}

/**
 * Small selectable chips used for priorities, call types, close types and check-in types: a web/Electron-safe
 * replacement for a native picker inside sheets (no portal, works inside NativeModal), with radio/checkbox roles.
 */
export function OptionChips<V extends string | number>({ options, selected, onToggle, mode = 'single', scroll = false, accessibilityLabel, testID = 'option-chips' }: OptionChipsProps<V>) {
  const chips = options.map((option) => {
    const isSelected = selected.includes(option.value);
    return (
      <Pressable
        key={String(option.value)}
        onPress={() => onToggle(option.value)}
        accessibilityRole={mode === 'single' ? 'radio' : 'checkbox'}
        accessibilityState={mode === 'single' ? { selected: isSelected } : { checked: isSelected }}
        accessibilityLabel={option.label}
        testID={`${testID}-${String(option.value)}`}
        className={`mb-2 mr-2 flex-row items-center rounded-full border px-3 py-1.5 ${isSelected ? 'border-primary-600 bg-primary-100' : 'border-outline-300 bg-background-0'}`}
      >
        {option.color ? <View style={StyleSheet.flatten([styles.swatch, { backgroundColor: option.color }])} /> : null}
        <Text size="sm" className={isSelected ? 'font-semibold text-primary-800' : 'text-typography-700'}>
          {option.label}
        </Text>
      </Pressable>
    );
  });

  return scroll ? (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} accessibilityRole={mode === 'single' ? 'radiogroup' : undefined} accessibilityLabel={accessibilityLabel} testID={testID}>
      {chips}
    </ScrollView>
  ) : (
    <View style={styles.wrap} accessibilityRole={mode === 'single' ? 'radiogroup' : undefined} accessibilityLabel={accessibilityLabel} testID={testID}>
      {chips}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
  swatch: { width: 10, height: 10, borderRadius: 5, marginRight: 6 },
});
