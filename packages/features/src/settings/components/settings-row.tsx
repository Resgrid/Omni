import { Box, Heading, HStack, Pressable, Switch, Text, useThemeColors, VStack } from '@resgrid/ui';
import { ChevronRight } from 'lucide-react-native';
import React from 'react';
import { View } from 'react-native';

/** A titled card holding one settings section. */
export const SettingsCard: React.FC<{ title: string; children: React.ReactNode; testID?: string }> = ({ title, children, testID }) => (
  <Box className="mb-4 rounded-lg border border-outline-200 bg-background-0 p-4" testID={testID}>
    <Heading size="sm" className="mb-2" accessibilityRole="header">
      {title}
    </Heading>
    <VStack space="xs">{children}</VStack>
  </Box>
);

export interface SettingsRowProps {
  label: string;
  value?: string | null;
  /** Secondary line under the label (connection state, a hint). */
  description?: string | null;
  onPress?: () => void;
  tone?: 'default' | 'link' | 'danger';
  isDisabled?: boolean;
  /** A count badge (pending changes). */
  badge?: string | null;
  testID?: string;
}

/** One row: a label, an optional value and, when it does something, a chevron and the button role. */
export const SettingsRow: React.FC<SettingsRowProps> = ({ label, value, description, onPress, tone = onPress ? 'link' : 'default', isDisabled = false, badge, testID }) => {
  const colors = useThemeColors();
  const labelClass = tone === 'danger' ? 'text-error-600' : tone === 'link' ? 'text-info-600' : 'text-typography-900';
  const content = (
    <HStack className="items-center justify-between py-2" space="md">
      <VStack className="flex-1">
        <Text className={labelClass}>{label}</Text>
        {description ? (
          <Text size="xs" className="text-typography-500">
            {description}
          </Text>
        ) : null}
      </VStack>
      <HStack className="max-w-[55%] items-center" space="xs">
        {badge ? (
          <Box className="rounded-full bg-warning-500 px-2 py-0.5">
            <Text size="xs" className="font-semibold text-typography-0">
              {badge}
            </Text>
          </Box>
        ) : null}
        {value ? (
          <Text className="text-right text-typography-600" numberOfLines={1}>
            {value}
          </Text>
        ) : null}
        {onPress ? (
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <ChevronRight size={16} color={colors.textSubtle} />
          </View>
        ) : null}
      </HStack>
    </HStack>
  );
  const accessibilityLabel = [label, value, description, badge].filter(Boolean).join(', ');
  return onPress ? (
    <Pressable onPress={onPress} disabled={isDisabled} accessibilityRole="button" accessibilityLabel={accessibilityLabel} accessibilityState={{ disabled: isDisabled }} testID={testID} className="px-1">
      {content}
    </Pressable>
  ) : (
    <View accessible accessibilityLabel={accessibilityLabel} testID={testID} className="px-1">
      {content}
    </View>
  );
};

export interface ToggleRowProps {
  label: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  /** Shown while the switch is on (what it does, the battery or privacy cost). */
  note?: string | null;
  isDisabled?: boolean;
  testID?: string;
}

/** A switch row with an explanatory note while it is on (Responder/Unit geolocation and keep-alive items). */
export const ToggleRow: React.FC<ToggleRowProps> = ({ label, value, onValueChange, note, isDisabled = false, testID }) => (
  <VStack space="xs" className="px-1 py-1">
    <HStack className="items-center justify-between" space="md">
      <Text className="flex-1">{label}</Text>
      <Switch value={value} onValueChange={onValueChange} disabled={isDisabled} accessibilityLabel={label} aria-label={label} testID={testID} />
    </HStack>
    {value && note ? (
      <Text size="xs" className="rounded-md bg-background-50 p-2 text-typography-600" testID={testID ? `${testID}-note` : undefined}>
        {note}
      </Text>
    ) : null}
  </VStack>
);
