import { Pressable, Text } from '@resgrid/ui';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { responseCodeChipColors } from '../lib/run-card-conditions';

export interface ResponseCodeChipProps {
  /** Short code shown on the chip ("C3"). Nothing renders without one. */
  code: string | null | undefined;
  /** Full name ("Lights and siren"), read out by screen readers. */
  name?: string | null;
  /** Badge colour from the department's catalog (hex); a plain outlined chip without one. */
  color?: string | null;
  /** Makes the chip a button (e.g. to open the code picker). */
  onPress?: () => void;
  /** Ring for the picked option in a picker. */
  isSelected?: boolean;
  testID?: string;
}

/**
 * A response code (conditional run cards) as a small chip in the department's colour for it, so a dispatcher reads "C3"
 * at a glance wherever a unit carries one: the proposal, the awaiting list, the call's requirements.
 */
export const ResponseCodeChip: React.FC<ResponseCodeChipProps> = ({ code, name, color, onPress, isSelected = false, testID }) => {
  if (!code) return null;
  const colors = responseCodeChipColors(color);

  const chip = (
    <View style={StyleSheet.flatten([styles.chip, isSelected ? styles.selected : null, colors ? { backgroundColor: colors.backgroundColor } : null])} testID={testID}>
      <Text className={colors ? 'text-xs font-bold' : 'text-xs font-bold text-typography-700'} style={colors ? { color: colors.color } : undefined}>
        {code}
      </Text>
    </View>
  );

  if (!onPress) return chip;

  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={name ? `${code} ${name}` : code} testID={testID ? `${testID}-button` : undefined}>
      {chip}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  chip: { borderRadius: 4, borderWidth: 1, borderColor: 'rgba(0,0,0,0.2)', paddingHorizontal: 6, paddingVertical: 2 },
  selected: { borderWidth: 2, borderColor: '#3b82f6' },
});
