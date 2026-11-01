import { selectSevereAlerts, useWeatherAlertsStore } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import { HStack, Pressable, Text, View } from '@resgrid/ui';
import { router } from 'expo-router';
import { AlertTriangle, ChevronRight } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { StyleSheet } from 'react-native';

import { severityColor } from '../lib/weather-alert-format';
import { weatherAlertsRoutes } from '../routes';

/** Home banner for active severe/extreme alerts (Responder): the most severe one, "+N more", opens the list or the alert. */
export const WeatherAlertBanner: React.FC = () => {
  const { t } = useTranslation();
  const alerts = useWeatherAlertsStore((state) => state.alerts);
  const severe = useMemo(() => selectSevereAlerts({ alerts }), [alerts]);
  if (severe.length === 0) return null;
  const top = severe[0];

  return (
    <Pressable
      testID="weather-alert-banner"
      onPress={() => router.push(severe.length === 1 ? weatherAlertsRoutes.detail(top.WeatherAlertId) : weatherAlertsRoutes.list())}
      accessibilityRole="button"
      style={StyleSheet.flatten([styles.banner, { backgroundColor: severityColor(top.Severity) }])}
    >
      <HStack space="sm" className="items-center">
        <AlertTriangle size={18} color="#ffffff" />
        <View style={styles.text}>
          <Text style={styles.title} numberOfLines={1}>
            {top.Event}
          </Text>
          {severe.length > 1 ? <Text style={styles.more}>{t('weather_alerts.banner.more_alerts', { count: severe.length - 1 })}</Text> : null}
        </View>
        <ChevronRight size={18} color="#ffffff" />
      </HStack>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  banner: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, marginHorizontal: 16, marginVertical: 8 },
  text: { flex: 1 },
  title: { color: '#FFFFFF', fontWeight: '700' },
  more: { color: '#FFFFFF', fontSize: 12 },
});
