import { Button, ButtonSpinner, ButtonText, useThemeColors } from '@resgrid/ui';
import type { LucideIcon } from 'lucide-react-native';
import React from 'react';
import { type GestureResponderEvent, View } from 'react-native';

export type ActionButtonTone = 'primary' | 'secondary' | 'negative';

export interface ActionButtonProps {
  label: string;
  icon: LucideIcon;
  onPress: () => void;
  tone?: ActionButtonTone;
  isBusy?: boolean;
  isDisabled?: boolean;
  accessibilityLabel?: string;
  testID: string;
}

/** A compact row or card action: its press never also opens the row it sits on. */
export const ActionButton: React.FC<ActionButtonProps> = ({ label, icon: Icon, onPress, tone = 'primary', isBusy = false, isDisabled = false, accessibilityLabel, testID }) => {
  const colors = useThemeColors();
  const iconColor = tone === 'primary' ? colors.textInverse : tone === 'negative' ? colors.token('error-600') : colors.icon;

  return (
    <Button
      size="xs"
      action={tone === 'negative' ? 'negative' : tone === 'secondary' ? 'secondary' : 'primary'}
      variant={tone === 'primary' ? 'solid' : 'outline'}
      onPress={(event?: GestureResponderEvent) => {
        event?.stopPropagation?.();
        onPress();
      }}
      isDisabled={isBusy || isDisabled}
      accessibilityLabel={accessibilityLabel ?? label}
      className="mb-1 ml-2"
      testID={testID}
    >
      {isBusy ? (
        <ButtonSpinner />
      ) : (
        <View>
          <Icon size={14} color={iconColor} />
        </View>
      )}
      <ButtonText>{label}</ButtonText>
    </Button>
  );
};
