import { useTranslation } from '@resgrid/i18n';
import { HStack, ScrollView, Text, View, VStack } from '@resgrid/ui';
import { Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudSnow, type LucideIcon, Sun, Wind } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { StyleSheet } from 'react-native';

import { useDashboardConfig, useDashboardConfigStore } from '../../hooks/use-department-config';
import { useWidgetSettings } from '../../hooks/use-widget-settings-store';
import type { OpenWeatherErrorKind } from '../../integrations/openweather/openweather-client';
import { useWeatherOutlook } from '../../integrations/openweather/use-weather-outlook';
import type { WeatherUnits } from '../../lib/widget-settings';
import { WIDGET_LABEL_KEYS, WidgetTypes } from '../../lib/widget-types';
import { WidgetContainer, WidgetLoading, WidgetMessage } from '../widget-container';
import type { WidgetProps } from './types';

/** An icon for OpenWeather's condition group. */
export const weatherIconFor = (condition: string): LucideIcon => {
  const value = condition.toLowerCase();
  if (value.includes('thunder')) return CloudLightning;
  if (value.includes('drizzle')) return CloudDrizzle;
  if (value.includes('rain')) return CloudRain;
  if (value.includes('snow')) return CloudSnow;
  if (value.includes('mist') || value.includes('fog') || value.includes('haze') || value.includes('smoke')) return CloudFog;
  if (value.includes('cloud')) return Cloud;
  if (value.includes('wind') || value.includes('squall') || value.includes('tornado')) return Wind;
  return Sun;
};

const TEMPERATURE_UNIT: Readonly<Record<WeatherUnits, string>> = { metric: '°C', imperial: '°F', standard: 'K' };
const WIND_UNIT: Readonly<Record<WeatherUnits, string>> = { metric: 'm/s', imperial: 'mph', standard: 'm/s' };

const ERROR_KEYS: Readonly<Record<OpenWeatherErrorKind, string>> = {
  missing_key: 'dashboard.weather.not_configured',
  missing_location: 'dashboard.weather.no_location',
  unauthorized: 'dashboard.weather.key_rejected',
  http: 'dashboard.weather.unavailable',
  network: 'dashboard.weather.unavailable',
  invalid_response: 'dashboard.weather.unavailable',
};

const ICON_COLOR = '#f59e0b';

/**
 * Current conditions and a 5-day outlook from OpenWeather for the widget's location (its own setting, else the
 * department's map centre — a wall board never asks the device for its position). No department key → "not configured".
 */
export const WeatherWidget: React.FC<WidgetProps> = ({ isEditMode, onRemove, onConfigure, width }) => {
  const { t, i18n } = useTranslation();
  const config = useDashboardConfig();
  const configFailed = useDashboardConfigStore((state) => state.hasError);
  const settings = useWidgetSettings('weather');
  const location = useMemo(() => {
    if (settings.latitude !== 0 || settings.longitude !== 0) return { latitude: settings.latitude, longitude: settings.longitude };
    const latitude = Number(config?.MapCenterLatitude ?? 0);
    const longitude = Number(config?.MapCenterLongitude ?? 0);
    return Number.isFinite(latitude) && Number.isFinite(longitude) && (latitude !== 0 || longitude !== 0) ? { latitude, longitude } : null;
  }, [config?.MapCenterLatitude, config?.MapCenterLongitude, settings.latitude, settings.longitude]);
  const { outlook, isLoading, isStale, errorKind } = useWeatherOutlook({ apiKey: config?.OpenWeatherApiKey, location, units: settings.units });
  const baseTitle = t(WIDGET_LABEL_KEYS[WidgetTypes.WEATHER]);
  const title = outlook?.location ? `${baseTitle} · ${outlook.location}` : baseTitle;
  const temperatureUnit = TEMPERATURE_UNIT[outlook?.units ?? settings.units];
  const windUnit = WIND_UNIT[outlook?.units ?? settings.units];
  const horizontal = width >= 500;

  const dayName = (dayMs: number): string => {
    try {
      return new Date(dayMs).toLocaleDateString(i18n.language, { weekday: 'short' });
    } catch {
      return '';
    }
  };

  const body = (() => {
    if (!config) return configFailed ? <WidgetMessage message={t('dashboard.weather.unavailable')} tone="error" testID="weather-widget-config-error" /> : <WidgetLoading testID="weather-widget-loading" />;
    if (!outlook) {
      if (isLoading) return <WidgetLoading testID="weather-widget-loading" />;
      return (
        <WidgetMessage message={t(ERROR_KEYS[errorKind ?? 'network'])} tone={errorKind === 'missing_key' || errorKind === 'missing_location' ? 'muted' : 'error'} testID={`weather-widget-${errorKind ?? 'network'}`} />
      );
    }
    const CurrentIcon = weatherIconFor(outlook.current.condition);
    return (
      <ScrollView style={styles.fill} nestedScrollEnabled testID="weather-widget-outlook">
        <VStack space="xs" className="items-center">
          <View>
            <CurrentIcon size={56} color={ICON_COLOR} />
          </View>
          <Text className="text-4xl font-bold text-typography-900" testID="weather-widget-temperature">{`${outlook.current.temperature}${temperatureUnit}`}</Text>
          <Text className="text-base capitalize text-typography-600">{outlook.current.description || outlook.current.condition}</Text>
          <HStack space="lg" className="mt-1">
            <VStack className="items-center">
              <Text className="text-xs text-typography-500">{t('dashboard.weather.humidity')}</Text>
              <Text className="text-sm font-semibold text-typography-900">{`${outlook.current.humidity}%`}</Text>
            </VStack>
            <VStack className="items-center">
              <Text className="text-xs text-typography-500">{t('dashboard.weather.wind')}</Text>
              <Text className="text-sm font-semibold text-typography-900">{`${outlook.current.windSpeed} ${windUnit}`}</Text>
            </VStack>
          </HStack>
        </VStack>
        {outlook.forecast.length > 0 ? (
          <VStack space="xs" className="mt-3">
            <Text className="text-sm font-semibold text-typography-600">{t('dashboard.weather.forecast')}</Text>
            <View style={horizontal ? styles.forecastRow : undefined}>
              {outlook.forecast.map((day) => {
                const DayIcon = weatherIconFor(day.condition);
                return (
                  <View key={day.date} className="mb-1 rounded-lg bg-background-50 p-2" style={horizontal ? styles.forecastTile : styles.forecastLine} testID={`weather-widget-day-${day.date}`}>
                    <Text className="text-sm font-semibold text-typography-900">{dayName(day.dayMs)}</Text>
                    <View>
                      <DayIcon size={28} color={ICON_COLOR} />
                    </View>
                    <Text className="text-sm text-typography-900">{`${day.tempHigh}° / ${day.tempLow}°`}</Text>
                  </View>
                );
              })}
            </View>
          </VStack>
        ) : null}
      </ScrollView>
    );
  })();

  return (
    <WidgetContainer title={title} testID="weather-widget" isEditMode={isEditMode} onRemove={onRemove} onConfigure={onConfigure} stale={isStale}>
      {body}
    </WidgetContainer>
  );
};

const styles = StyleSheet.create({
  fill: { flex: 1 },
  forecastRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  forecastTile: { alignItems: 'center', minWidth: 80, marginRight: 4 },
  forecastLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
