import { HStack, Text, useThemeColors, View, VStack } from '@resgrid/ui';
import { CircleAlert, CircleCheck, Info } from 'lucide-react-native';
import React from 'react';

export type FormAlertTone = 'error' | 'success' | 'info';

export interface FormAlertProps {
  tone: FormAlertTone;
  title?: string | null;
  message: string;
  testID?: string;
}

const BOX: Record<FormAlertTone, string> = {
  error: 'rounded-lg border border-error-300 bg-background-error p-3',
  success: 'rounded-lg border border-success-300 bg-background-success p-3',
  info: 'rounded-lg border border-info-300 bg-background-info p-3',
};

const TEXT: Record<FormAlertTone, string> = { error: 'text-error-800', success: 'text-success-800', info: 'text-info-800' };

/** An inline result banner: what failed (and what to do about it) or what was saved. Errors are announced. */
export const FormAlert: React.FC<FormAlertProps> = ({ tone, title, message, testID }) => {
  const colors = useThemeColors();
  const Icon = tone === 'error' ? CircleAlert : tone === 'success' ? CircleCheck : Info;
  const color = tone === 'error' ? colors.error : tone === 'success' ? colors.success : colors.info;
  return (
    <View className={BOX[tone]} accessibilityRole={tone === 'error' ? 'alert' : undefined} accessibilityLiveRegion="polite" testID={testID}>
      <HStack space="sm" className="items-start">
        <View className="pt-0.5">
          <Icon size={18} color={color} />
        </View>
        <VStack space="xs" className="flex-1">
          {title ? <Text className={`font-semibold ${TEXT[tone]}`}>{title}</Text> : null}
          <Text size="sm" className={TEXT[tone]}>
            {message}
          </Text>
        </VStack>
      </HStack>
    </View>
  );
};
