import { HStack, Pressable, Text, useThemeColors, VStack } from '@resgrid/ui';
import { CheckSquare, Circle, CircleDot, Square } from 'lucide-react-native';
import React from 'react';
import { View } from 'react-native';

export interface ShiftSelectRowProps {
  id: string;
  title: string;
  subtitle?: string;
  trailing?: string;
  selected: boolean;
  /** `radio` for a single choice, `checkbox` for several. */
  mode: 'radio' | 'checkbox';
  disabled?: boolean;
  onToggle: (id: string) => void;
  testID?: string;
}

/** A selectable row for team, candidate, person and swap-back choices inside the shift sheets (no native picker). */
export const ShiftSelectRow: React.FC<ShiftSelectRowProps> = React.memo(({ id, title, subtitle, trailing, selected, mode, disabled = false, onToggle, testID }) => {
  const colors = useThemeColors();
  const iconColor = selected ? colors.primary : colors.icon;
  const Icon = mode === 'radio' ? (selected ? CircleDot : Circle) : selected ? CheckSquare : Square;
  return (
    <Pressable
      onPress={() => onToggle(id)}
      disabled={disabled}
      accessibilityRole={mode}
      accessibilityState={mode === 'radio' ? { selected, disabled } : { checked: selected, disabled }}
      accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
      testID={testID}
      className={`rounded-lg border px-3 py-3 ${selected ? 'border-primary-500 bg-primary-50' : 'border-outline-200 bg-background-0'} ${disabled ? 'opacity-50' : ''}`}
    >
      <HStack space="sm" className="items-center">
        <View>
          <Icon size={20} color={iconColor} />
        </View>
        <VStack className="flex-1">
          <Text size="sm" className="font-medium text-typography-900">
            {title}
          </Text>
          {subtitle ? (
            <Text size="xs" className="text-typography-600">
              {subtitle}
            </Text>
          ) : null}
        </VStack>
        {trailing ? (
          <Text size="xs" className="font-medium text-typography-700">
            {trailing}
          </Text>
        ) : null}
      </HStack>
    </Pressable>
  );
});

ShiftSelectRow.displayName = 'ShiftSelectRow';
