import { X } from 'lucide-react-native';
import React, { type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useMapTheme } from '../provider/context';

/** Small RN building blocks for the map sheets (the map package cannot use `@resgrid/ui`, see `overlay-types.ts`). */

export const SheetHeader: React.FC<{ title: string; onClose?: () => void; closeLabel: string; testID?: string }> = ({ title, onClose, closeLabel, testID }) => {
  const { colors } = useMapTheme();
  return (
    <View style={styles.header}>
      <Text style={StyleSheet.flatten([styles.title, { color: colors.text }])} accessibilityRole="header" numberOfLines={2}>
        {title}
      </Text>
      {onClose ? (
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={closeLabel} hitSlop={12} testID={testID ? `${testID}-close` : undefined}>
          <View>
            <X size={22} color={colors.text} />
          </View>
        </Pressable>
      ) : null}
    </View>
  );
};

export const SheetButton: React.FC<{ label: string; onPress: () => void; variant?: 'solid' | 'outline'; icon?: ReactNode; disabled?: boolean; testID?: string }> = ({
  label,
  onPress,
  variant = 'outline',
  icon,
  disabled = false,
  testID,
}) => {
  const { colors } = useMapTheme();
  const solid = variant === 'solid';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      style={StyleSheet.flatten([styles.button, { borderColor: colors.primary, backgroundColor: solid ? colors.primary : 'transparent', opacity: disabled ? 0.5 : 1 }])}
      testID={testID}
    >
      {icon ? <View style={styles.buttonIcon}>{icon}</View> : null}
      <Text style={StyleSheet.flatten([styles.buttonText, { color: solid ? colors.onPrimary : colors.primary }])}>{label}</Text>
    </Pressable>
  );
};

export const SheetRow: React.FC<{ label: string; value: string; testID?: string }> = ({ label, value, testID }) => {
  const { colors } = useMapTheme();
  return (
    <View style={styles.row} testID={testID}>
      <Text style={StyleSheet.flatten([styles.rowLabel, { color: colors.text }])}>{label}</Text>
      <Text style={StyleSheet.flatten([styles.rowValue, { color: colors.mutedText }])}>{value}</Text>
    </View>
  );
};

export const sheetStyles = StyleSheet.create({
  section: {
    marginTop: 12,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 12,
  },
  muted: {
    fontSize: 13,
  },
});

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  title: {
    flex: 1,
    marginRight: 12,
    fontSize: 18,
    fontWeight: '700',
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    marginTop: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
  },
  buttonIcon: {
    marginRight: 8,
  },
  buttonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  row: {
    marginTop: 8,
  },
  rowLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  rowValue: {
    fontSize: 13,
  },
});
