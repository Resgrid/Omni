import { Pressable, Text, useFormFactor } from '@resgrid/ui';
import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

/** Centres a screen's content and caps its width on tablets, desktop/Electron windows and wall boards. */
export const OperationsFrame: React.FC<{ children: React.ReactNode; maxWidth?: number }> = ({ children, maxWidth = 1024 }) => {
  const { isPhone } = useFormFactor();
  return <View style={isPhone ? styles.full : StyleSheet.flatten([styles.full, styles.centered, { maxWidth }])}>{children}</View>;
};

export interface SegmentOption<V extends string> {
  value: V;
  label: string;
  testID?: string;
}

/** A row of toggle buttons (sections, open/all, report scopes): radio semantics, web/Electron-safe. */
export function Segments<V extends string>({ options, value, onChange, accessibilityLabel }: { options: readonly SegmentOption<V>[]; value: V | null; onChange: (value: V) => void; accessibilityLabel?: string }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} accessibilityRole="radiogroup" accessibilityLabel={accessibilityLabel} contentContainerStyle={styles.segments}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={option.label}
            testID={option.testID}
            className={`mr-2 rounded-full border px-3 py-1.5 ${selected ? 'border-primary-600 bg-primary-600' : 'border-outline-300 bg-background-0'}`}
          >
            <Text size="sm" className={selected ? 'font-semibold text-typography-0' : 'text-typography-700'}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  full: { width: '100%' },
  centered: { alignSelf: 'center' },
  segments: { paddingVertical: 4 },
});
