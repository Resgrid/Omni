import { safeFormatDate } from '@resgrid/core/utils/dates';
import { isSafeRouteId } from '@resgrid/core/utils/route-ids';
import { isWeatherAlertActive, useWeatherAlertsStore } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import { type WeatherAlertResultData } from '@resgrid/models';
import { Box, Heading, HStack, Loading, ScreenHeader, ScrollView, Text, View, VStack, ZeroState } from '@resgrid/ui';
import { router, useLocalSearchParams } from 'expo-router';
import { CloudSun } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';

import { SeverityBadge } from '../components/weather-alert-card';
import { alertCenter, alertStatusKey, alertTimes, categoryKey, certaintyKey, urgencyKey } from '../lib/weather-alert-format';

export interface WeatherAlertDetailScreenProps {
  alertId?: string;
  /** Map slot (U/I detail map; MapLibre via @resgrid/maps): the alert polygon or centre, supplied by the app. */
  renderMap?: (alert: WeatherAlertResultData, center: { latitude: number; longitude: number } | null) => React.ReactNode;
}

const Field: React.FC<{ label: string; value?: string | null }> = ({ label, value }) =>
  value ? (
    <VStack className="mb-3">
      <Text className="text-xs font-semibold uppercase text-typography-500">{label}</Text>
      <Text className="text-sm text-typography-900">{value}</Text>
    </VStack>
  ) : null;

const formatMs = (ms: number | null): string | null => (ms === null ? null : safeFormatDate(new Date(ms).toISOString(), 'MMM d, yyyy h:mm a'));

/** One weather alert at the canonical `/weather-alerts/[id]` (U/I detail + map slot): severity, timing, area, text and instructions. */
export default function WeatherAlertDetailScreen({ alertId: alertIdProp, renderMap }: WeatherAlertDetailScreenProps) {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const rawId = alertIdProp ?? (Array.isArray(params.id) ? params.id[0] : params.id);
  const alertId = isSafeRouteId(rawId) ? rawId : null;
  const cached = useWeatherAlertsStore((state) => (alertId ? (state.alertDetailsById[alertId] ?? state.alerts.find((alert) => alert.WeatherAlertId === alertId)) : undefined));
  const [alert, setAlert] = useState<WeatherAlertResultData | null | undefined>(cached);
  const [isLoading, setIsLoading] = useState(!!alertId && !cached);

  useEffect(() => {
    if (!alertId) return;
    let active = true;
    void useWeatherAlertsStore
      .getState()
      .fetchAlertDetail(alertId)
      .then((result) => {
        if (active) setAlert(result);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [alertId]);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/weather-alerts'));
  const current = alert ?? cached;

  if (!current) {
    return (
      <View className="flex-1 bg-background-50" testID="weather-alert-detail-screen">
        <ScreenHeader title={t('weather_alerts.title')} onBack={back} />
        {isLoading ? <Loading text={t('weather_alerts.loading')} /> : <ZeroState icon={CloudSun} heading={t('weather_alerts.not_found')} testID="weather-alert-detail-missing" />}
      </View>
    );
  }

  const times = alertTimes(current);
  const center = alertCenter(current);
  const active = isWeatherAlertActive(current);

  return (
    <View className="flex-1 bg-background-50" testID="weather-alert-detail-screen">
      <ScreenHeader title={current.Event} onBack={back} />
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        <Box className="mx-4 mt-4 rounded-xl border border-outline-200 bg-background-0 p-4">
          <HStack space="sm" className="mb-2 flex-wrap items-center">
            <SeverityBadge severity={current.Severity} testID="weather-alert-detail-severity" />
            <Text className="text-xs text-typography-500">{t(categoryKey(current.AlertCategory))}</Text>
            <Text className={`text-xs ${active ? 'text-success-600' : 'text-typography-500'}`} testID="weather-alert-detail-status">
              {active ? t(alertStatusKey(current.Status)) : t('weather_alerts.status.expired')}
            </Text>
          </HStack>
          <Heading size="md" className="text-typography-900">
            {current.Event}
          </Heading>
          {current.Headline ? <Text className="mt-1 text-sm text-typography-700">{current.Headline}</Text> : null}
        </Box>

        {renderMap && (center || current.Polygon) ? <VStack className="mx-4 mt-4 h-56 overflow-hidden rounded-xl">{renderMap(current, center)}</VStack> : null}

        <Box className="mx-4 mt-4 rounded-xl border border-outline-200 bg-background-0 p-4">
          <Field label={t('weather_alerts.detail.effective')} value={formatMs(times.effective)} />
          <Field label={t('weather_alerts.detail.onset')} value={formatMs(times.onset)} />
          <Field label={t('weather_alerts.detail.expires')} value={formatMs(times.expires)} />
          <Field label={t('weather_alerts.detail.urgency')} value={t(urgencyKey(current.Urgency))} />
          <Field label={t('weather_alerts.detail.certainty')} value={t(certaintyKey(current.Certainty))} />
          <Field label={t('weather_alerts.detail.area')} value={current.AreaDescription} />
          <Field label={t('weather_alerts.detail.sender')} value={current.Sender} />
        </Box>

        <Box className="mx-4 mt-4 rounded-xl border border-outline-200 bg-background-0 p-4">
          <Field label={t('weather_alerts.detail.description')} value={current.Description} />
          <Field label={t('weather_alerts.detail.instructions')} value={current.Instruction} />
        </Box>
      </ScrollView>
    </View>
  );
}
