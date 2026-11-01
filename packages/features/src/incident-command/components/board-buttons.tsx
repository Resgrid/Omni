import { Button, ButtonText, Pressable } from '@resgrid/ui';
import type { LucideIcon } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, View } from 'react-native';

export interface BoardButtonProps {
  label: string;
  onPress: () => void;
  icon?: LucideIcon;
  variant?: 'solid' | 'outline' | 'link';
  action?: 'primary' | 'secondary' | 'positive' | 'negative';
  size?: 'xs' | 'sm' | 'md';
  /** Hide the text (icon-only on narrow headers); the label stays the accessible name. */
  iconOnly?: boolean;
  isDisabled?: boolean;
  testID?: string;
}

/** A labelled board action (header and section buttons). Lucide icons sit inside a View (web/Electron-safe). */
export const BoardButton: React.FC<BoardButtonProps> = ({ label, onPress, icon: Icon, variant = 'outline', action = 'primary', size = 'xs', iconOnly = false, isDisabled = false, testID }) => (
  <Button size={size} variant={variant} action={action} onPress={onPress} isDisabled={isDisabled} accessibilityLabel={label} testID={testID}>
    {Icon ? (
      <View style={iconOnly ? undefined : styles.iconGap}>
        <Icon size={size === 'md' ? 18 : 14} color={variant === 'solid' ? '#ffffff' : action === 'negative' ? '#dc2626' : '#2563eb'} />
      </View>
    ) : null}
    {iconOnly ? null : <ButtonText>{label}</ButtonText>}
  </Button>
);

export interface IconPressProps {
  label: string;
  icon: LucideIcon;
  onPress: () => void;
  color?: string;
  testID?: string;
}

/** A 44pt icon-only touch target with an accessible name (lane and row actions). */
export const IconPress: React.FC<IconPressProps> = ({ label, icon: Icon, onPress, color = '#4b5563', testID }) => (
  <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={8} style={styles.iconPress} testID={testID}>
    <View>
      <Icon size={18} color={color} />
    </View>
  </Pressable>
);

const styles = StyleSheet.create({
  iconGap: { marginRight: 4 },
  iconPress: { padding: 10, alignItems: 'center', justifyContent: 'center' },
});
