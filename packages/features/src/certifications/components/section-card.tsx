import { HStack, Text, useThemeColors, View, VStack } from '@resgrid/ui';
import type { LucideIcon } from 'lucide-react-native';
import React from 'react';

export interface SectionCardProps {
  title?: string;
  icon?: LucideIcon;
  /** One line under the title that says what the section is for. */
  description?: string;
  /** Trailing header content (a value or a small button). */
  action?: React.ReactNode;
  children: React.ReactNode;
  testID?: string;
}

/** A titled white card on the screen's grey background, as the call form and contact detail lay out their sections. */
export const SectionCard: React.FC<SectionCardProps> = ({ title, icon: Icon, description, action, children, testID }) => {
  const colors = useThemeColors();
  return (
    <View className="mb-3 rounded-xl border border-outline-200 bg-background-0 p-4" testID={testID}>
      {title ? (
        <VStack space="xs" className="mb-3">
          <HStack space="sm" className="items-center">
            {Icon ? (
              <View>
                <Icon size={18} color={colors.icon} />
              </View>
            ) : null}
            <Text className="flex-1 font-semibold text-typography-900" accessibilityRole="header">
              {title}
            </Text>
            {action ?? null}
          </HStack>
          {description ? (
            <Text size="sm" className="text-typography-600">
              {description}
            </Text>
          ) : null}
        </VStack>
      ) : null}
      {children}
    </View>
  );
};
