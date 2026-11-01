import { useTranslation } from '@resgrid/i18n';
import { HStack, Text } from '@resgrid/ui';
import React from 'react';
import { StyleSheet, View } from 'react-native';

/** A 0–100 progress bar with its value (objectives, need fulfilment). */
export const PercentBar: React.FC<{ percent: number; color?: string; testID?: string }> = ({ percent, color = '#3b82f6', testID }) => {
  const { t } = useTranslation();
  const clamped = Math.min(100, Math.max(0, Math.round(Number.isFinite(percent) ? percent : 0)));
  return (
    <HStack className="mt-1 items-center" space="sm" testID={testID}>
      <View style={styles.track} className="bg-background-200" accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: clamped }}>
        <View style={StyleSheet.flatten([styles.fill, { width: `${clamped}%`, backgroundColor: color }])} />
      </View>
      <Text className="text-xs text-typography-500">{t('incident_command.percent', { percent: clamped })}</Text>
    </HStack>
  );
};

const styles = StyleSheet.create({
  track: { flex: 1, height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
});
