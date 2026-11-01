import { useTranslation } from '@resgrid/i18n';
import { type WeatherAlertResultData } from '@resgrid/models';
import { HStack, Pressable, Text, View, VStack } from '@resgrid/ui';
import { CloudLightning } from 'lucide-react-native';
import React from 'react';
import { StyleSheet } from 'react-native';

import { categoryKey, severityColor, severityKey } from '../lib/weather-alert-format';

export const SeverityBadge: React.FC<{ severity: number; testID?: string }> = ({ severity, testID }) => {
  const { t } = useTranslation();
  return (
    <View style={StyleSheet.flatten([styles.badge, { backgroundColor: severityColor(severity) }])} testID={testID}>
      <Text style={styles.badgeText}>{t(severityKey(severity))}</Text>
    </View>
  );
};

export interface WeatherAlertCardProps {
  alert: WeatherAlertResultData;
  onPress?: (alert: WeatherAlertResultData) => void;
}

/** An alert row (Responder card + severity colour bar): event, severity, category, headline and area. */
export const WeatherAlertCard: React.FC<WeatherAlertCardProps> = React.memo(({ alert, onPress }) => {
  const { t } = useTranslation();
  return (
    <Pressable
      testID={`weather-alert-card-${alert.WeatherAlertId}`}
      onPress={onPress ? () => onPress(alert) : undefined}
      accessibilityRole="button"
      className="mb-2 overflow-hidden rounded-xl border border-outline-200 bg-background-0"
    >
      <HStack>
        <View style={StyleSheet.flatten([styles.bar, { backgroundColor: severityColor(alert.Severity) }])} />
        <VStack className="flex-1 p-3" space="xs">
          <HStack space="sm" className="items-center">
            <CloudLightning size={16} color={severityColor(alert.Severity)} />
            <Text className="flex-1 font-semibold text-typography-900" numberOfLines={1}>
              {alert.Event}
            </Text>
            <SeverityBadge severity={alert.Severity} />
          </HStack>
          {alert.Headline ? (
            <Text className="text-sm text-typography-700" numberOfLines={2}>
              {alert.Headline}
            </Text>
          ) : null}
          <Text className="text-xs text-typography-500" numberOfLines={1}>
            {[t(categoryKey(alert.AlertCategory)), alert.AreaDescription].filter((part) => !!part).join(' • ')}
          </Text>
        </VStack>
      </HStack>
    </Pressable>
  );
});

WeatherAlertCard.displayName = 'WeatherAlertCard';

const styles = StyleSheet.create({
  bar: { width: 5 },
  badge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
});
