import { sortWeatherAlerts, useWeatherAlertsStore } from '@resgrid/data';
import { alertTimes, SeverityBadge, severityColor, weatherAlertsRoutes } from '@resgrid/features/weather-alerts';
import { useTranslation } from '@resgrid/i18n';
import { WeatherAlertCategory, type WeatherAlertResultData, WeatherAlertSeverity } from '@resgrid/models';
import { HStack, Pressable, ScrollView, Text, View, VStack } from '@resgrid/ui';
import { router } from 'expo-router';
import React, { useMemo } from 'react';
import { StyleSheet } from 'react-native';

import { useNow } from '../../hooks/use-now';
import { useStale } from '../../hooks/use-stale';
import { useWidgetSettings } from '../../hooks/use-widget-settings-store';
import { useWidgetTitle } from '../../hooks/use-widget-title';
import type { WeatherAlertsWidgetSettings } from '../../lib/widget-settings';
import { WidgetTypes } from '../../lib/widget-types';
import { WidgetContainer, WidgetLoading, WidgetMessage } from '../widget-container';
import type { WidgetProps } from './types';

const severityVisible = (severity: number, settings: WeatherAlertsWidgetSettings): boolean => {
  switch (severity) {
    case WeatherAlertSeverity.Extreme:
      return settings.showExtreme;
    case WeatherAlertSeverity.Severe:
      return settings.showSevere;
    case WeatherAlertSeverity.Moderate:
      return settings.showModerate;
    case WeatherAlertSeverity.Minor:
      return settings.showMinor;
    default:
      return settings.showUnknown;
  }
};

const categoryVisible = (category: number, settings: WeatherAlertsWidgetSettings): boolean => {
  switch (category) {
    case WeatherAlertCategory.Met:
      return settings.showCategoryMet;
    case WeatherAlertCategory.Fire:
      return settings.showCategoryFire;
    case WeatherAlertCategory.Health:
      return settings.showCategoryHealth;
    case WeatherAlertCategory.Env:
      return settings.showCategoryEnv;
    default:
      return settings.showCategoryOther;
  }
};

/** Active alerts the board shows: the configured severities and categories, most severe first, capped. */
export function selectWidgetAlerts(alerts: readonly WeatherAlertResultData[], settings: WeatherAlertsWidgetSettings): WeatherAlertResultData[] {
  return sortWeatherAlerts(alerts.filter((alert) => severityVisible(alert.Severity, settings) && categoryVisible(alert.AlertCategory, settings))).slice(0, settings.maxAlertsInWidget);
}

/** Time left until an alert expires ("2h 15m remaining", "Expired"); '' when unknown. */
const useRemaining = (): ((expires: number | null, now: number) => string) => {
  const { t } = useTranslation();
  return (expires, now) => {
    if (expires === null) return '';
    const diff = expires - now;
    if (diff <= 0) return t('weather_alerts.expired');
    const hours = Math.floor(diff / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    const value =
      hours >= 24
        ? t('weather_alerts.time_days_hours', { days: Math.floor(hours / 24), hours: hours % 24 })
        : hours > 0
          ? t('weather_alerts.time_hours_minutes', { hours, minutes })
          : t('weather_alerts.time_minutes', { minutes });
    return `${value} ${t('weather_alerts.remaining')}`;
  };
};

/** Active weather alerts (the weather-alerts feature's badge and colours), each opening the canonical alert page. */
export const WeatherAlertsWidget: React.FC<WidgetProps> = ({ isEditMode, onRemove, onConfigure }) => {
  const { t } = useTranslation();
  const title = useWidgetTitle(WidgetTypes.WEATHER_ALERTS);
  const alerts = useWeatherAlertsStore((state) => state.alerts);
  const isLoading = useWeatherAlertsStore((state) => state.loading.alerts === true);
  const hasError = useWeatherAlertsStore((state) => !!state.errors.alerts);
  const settings = useWidgetSettings('weatherAlerts');
  const now = useNow(60000, settings.showExpiry);
  const remaining = useRemaining();
  const visible = useMemo(() => selectWidgetAlerts(alerts, settings), [alerts, settings]);
  const stale = useStale(alerts.length > 0, hasError);
  const { fontSize } = settings;

  return (
    <WidgetContainer title={title} testID="weather-alerts-widget" isEditMode={isEditMode} onRemove={onRemove} onConfigure={onConfigure} stale={stale}>
      {isLoading && alerts.length === 0 ? (
        <WidgetLoading testID="weather-alerts-widget-loading" />
      ) : hasError && alerts.length === 0 ? (
        <WidgetMessage message={t('weather_alerts.errorLoading')} tone="error" testID="weather-alerts-widget-error" />
      ) : visible.length === 0 ? (
        <WidgetMessage message={t('weather_alerts.noActiveAlerts')} testID="weather-alerts-widget-empty" />
      ) : (
        <ScrollView style={styles.fill} nestedScrollEnabled>
          {visible.map((alert) => (
            <Pressable
              key={alert.WeatherAlertId}
              disabled={isEditMode}
              onPress={() => router.push(weatherAlertsRoutes.detail(alert.WeatherAlertId))}
              accessibilityRole="button"
              accessibilityLabel={alert.Event}
              testID={`weather-alerts-widget-alert-${alert.WeatherAlertId}`}
            >
              <HStack className="mb-1.5 overflow-hidden rounded bg-background-50">
                <View style={StyleSheet.flatten([styles.bar, { backgroundColor: severityColor(alert.Severity) }])} />
                <VStack className="flex-1 px-2 py-1.5" space="xs">
                  <HStack className="items-center" space="sm">
                    <Text className="flex-1 font-semibold text-typography-900" style={{ fontSize }} numberOfLines={1}>
                      {alert.Event}
                    </Text>
                    <SeverityBadge severity={alert.Severity} />
                  </HStack>
                  {settings.showHeadline && alert.Headline ? (
                    <Text className="text-typography-700" style={{ fontSize: Math.max(8, fontSize - 1) }} numberOfLines={2}>
                      {alert.Headline}
                    </Text>
                  ) : null}
                  {settings.showArea && alert.AreaDescription ? (
                    <Text className="text-typography-600" style={{ fontSize: Math.max(8, fontSize - 2) }} numberOfLines={1}>
                      {alert.AreaDescription}
                    </Text>
                  ) : null}
                  {settings.showExpiry ? (
                    <Text className="text-typography-500" style={{ fontSize: Math.max(8, fontSize - 2) }}>
                      {remaining(alertTimes(alert).expires, now)}
                    </Text>
                  ) : null}
                </VStack>
              </HStack>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </WidgetContainer>
  );
};

const styles = StyleSheet.create({
  fill: { flex: 1 },
  bar: { width: 4 },
});
