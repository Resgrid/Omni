import { Text } from '@resgrid/ui';
import React from 'react';
import { View } from 'react-native';

export type PillTone = 'success' | 'warning' | 'error' | 'info' | 'muted';

const TONE_CLASSES: Record<PillTone, { box: string; text: string }> = {
  success: { box: 'border-success-300 bg-success-50', text: 'text-success-800' },
  warning: { box: 'border-warning-300 bg-warning-50', text: 'text-warning-800' },
  error: { box: 'border-error-300 bg-error-50', text: 'text-error-800' },
  info: { box: 'border-info-300 bg-info-50', text: 'text-info-800' },
  muted: { box: 'border-outline-200 bg-background-100', text: 'text-typography-700' },
};

/** A small labelled pill (status, mode, kind) in one of the theme's tones. */
export const StatusPill: React.FC<{ label: string; tone: PillTone; testID?: string }> = ({ label, tone, testID }) => (
  <View className={`mb-1 mr-1.5 self-start rounded-full border px-2 py-0.5 ${TONE_CLASSES[tone].box}`} testID={testID}>
    <Text size="xs" className={`font-semibold ${TONE_CLASSES[tone].text}`} numberOfLines={1}>
      {label}
    </Text>
  </View>
);
