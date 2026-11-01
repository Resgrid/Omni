import { useTranslation } from '@resgrid/i18n';
import { HStack, Pressable, Text, View } from '@resgrid/ui';
import { Check } from 'lucide-react-native';
import React, { useCallback } from 'react';
import { StyleSheet } from 'react-native';

import { readableColors } from '../lib/readable-colors';
import { type StatusOption } from '../lib/status-flow';
import { HoldToConfirmButton } from './hold-to-confirm-button';

/** The outline that marks the subject's current status (crews asked for it to be unmistakable). */
const CURRENT_OUTLINE = '#dc2626';

export interface StatusOptionRowProps {
  option: StatusOption;
  isSelected: boolean;
  isCurrent: boolean;
  isHoldMode: boolean;
  isDisabled?: boolean;
  onSelect: (option: StatusOption) => void;
  onHold?: (option: StatusOption) => void;
  onHoldTap?: () => void;
  testIDPrefix: string;
}

const CurrentPill: React.FC = () => {
  const { t } = useTranslation();
  return (
    <View style={styles.pill}>
      <Text style={styles.pillText}>{t('status.current')}</Text>
    </View>
  );
};

/** One status or staffing option: a tap-to-select row, or a hold-to-confirm button in the department's hold mode. */
export const StatusOptionRow: React.FC<StatusOptionRowProps> = React.memo(({ option, isSelected, isCurrent, isHoldMode, isDisabled = false, onSelect, onHold, onHoldTap, testIDPrefix }) => {
  const { t } = useTranslation();
  const { backgroundColor, textColor } = readableColors(option.BColor);
  const handleSelect = useCallback(() => onSelect(option), [onSelect, option]);
  const handleHold = useCallback(() => onHold?.(option), [onHold, option]);
  const label = isCurrent ? `${option.Text}, ${t('status.current')}` : option.Text;

  if (isHoldMode && onHold) {
    return (
      <View className="mb-3">
        <HoldToConfirmButton
          testID={`${testIDPrefix}-hold-${option.Id}`}
          onConfirm={handleHold}
          onTap={onHoldTap}
          disabled={isDisabled}
          backgroundColor={backgroundColor}
          foregroundColor={textColor}
          style={isCurrent ? styles.currentOutline : undefined}
          accessibilityLabel={label}
          accessibilityHint={t('status.hold_to_set_hint')}
        >
          <HStack space="sm" className="items-center">
            <Text className="flex-1 font-bold" style={{ color: textColor }}>
              {option.Text}
            </Text>
            {isCurrent ? <CurrentPill /> : null}
          </HStack>
        </HoldToConfirmButton>
      </View>
    );
  }

  return (
    <Pressable
      testID={`${testIDPrefix}-option-${option.Id}`}
      onPress={handleSelect}
      disabled={isDisabled}
      accessibilityRole="radio"
      accessibilityState={{ selected: isSelected, disabled: isDisabled }}
      accessibilityLabel={label}
      className={`mb-3 rounded-lg border-2 p-3 ${isSelected ? 'border-primary-500' : 'border-transparent'}`}
      style={StyleSheet.flatten([{ backgroundColor }, isCurrent && !isSelected ? styles.currentOutline : null])}
    >
      <HStack space="sm" className="items-center">
        <View style={StyleSheet.flatten([styles.checkbox, { borderColor: textColor, backgroundColor: isSelected ? textColor : 'transparent' }])}>{isSelected ? <Check size={12} color={backgroundColor} /> : null}</View>
        <Text className="flex-1 font-bold" style={{ color: textColor }}>
          {option.Text}
        </Text>
        {isCurrent ? <CurrentPill /> : null}
      </HStack>
    </Pressable>
  );
});

StatusOptionRow.displayName = 'StatusOptionRow';

const styles = StyleSheet.create({
  currentOutline: { borderWidth: 3, borderColor: CURRENT_OUTLINE, borderRadius: 8 },
  checkbox: { width: 20, height: 20, borderRadius: 4, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  pill: { backgroundColor: CURRENT_OUTLINE, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  pillText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
});
