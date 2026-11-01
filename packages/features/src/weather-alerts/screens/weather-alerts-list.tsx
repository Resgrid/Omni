import { useCapability } from '@resgrid/config';
import { sortWeatherAlerts, useWeatherAlertsStore, type WeatherAlertSort } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import { type WeatherAlertResultData } from '@resgrid/models';
import { Button, ButtonText, FlatList, HStack, Input, InputField, InputIcon, InputSlot, Loading, Pressable, RefreshControl, Text, View, ZeroState } from '@resgrid/ui';
import { router } from 'expo-router';
import { CloudSun, Search, Settings2, X } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { SeverityFilterTabs } from '../components/severity-filter-tabs';
import { WeatherAlertCard } from '../components/weather-alert-card';
import { useWeatherAlertsRealtime } from '../hooks/use-weather-alerts-realtime';
import { type SeverityTab } from '../lib/weather-alert-format';
import { weatherAlertsRoutes } from '../routes';

const SORTS: { id: WeatherAlertSort; key: string }[] = [
  { id: 'severity', key: 'weather_alerts.sort.severity' },
  { id: 'newest', key: 'weather_alerts.sort.newest' },
  { id: 'expiring', key: 'weather_alerts.sort.expires' },
];

/**
 * Active weather alerts (Responder components + U/I severity tabs): severity tabs with counts, search, sort, live
 * updates, and — only where the variant has `capabilities.weatherAlerts.admin` (Dispatch) — the settings entry.
 */
export default function WeatherAlertsListScreen() {
  const { t } = useTranslation();
  const { admin } = useCapability('weatherAlerts');
  const alerts = useWeatherAlertsStore((state) => state.alerts);
  const isLoading = useWeatherAlertsStore((state) => state.loading.alerts === true);
  const [tab, setTab] = useState<SeverityTab>('all');
  const [sort, setSort] = useState<WeatherAlertSort>('severity');
  const [query, setQuery] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);

  useWeatherAlertsRealtime();

  useEffect(() => {
    void useWeatherAlertsStore.getState().fetchActiveAlerts();
  }, []);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await useWeatherAlertsStore.getState().fetchActiveAlerts({ bypassCache: true });
    setIsRefreshing(false);
  }, []);

  const counts = useMemo(() => {
    const result: Record<string, number> = { all: alerts.length };
    alerts.forEach((alert) => {
      result[String(alert.Severity)] = (result[String(alert.Severity)] ?? 0) + 1;
    });
    return result;
  }, [alerts]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = alerts.filter(
      (alert) => (tab === 'all' || alert.Severity === tab) && (!needle || [alert.Event, alert.Headline, alert.AreaDescription, alert.Sender].some((value) => (value ?? '').toLowerCase().includes(needle)))
    );
    return sortWeatherAlerts(filtered, sort);
  }, [alerts, query, sort, tab]);

  const open = useCallback((alert: WeatherAlertResultData) => router.push(weatherAlertsRoutes.detail(alert.WeatherAlertId)), []);

  return (
    <View className="flex-1 bg-background-50 px-4 pt-4" testID="weather-alerts-list-screen">
      <HStack space="sm" className="mb-2 items-center">
        <Input className="flex-1 bg-background-0" size="md" variant="outline">
          <InputSlot className="pl-3">
            <InputIcon as={Search} />
          </InputSlot>
          <InputField testID="weather-alerts-search" placeholder={t('weather_alerts.search')} value={query} onChangeText={setQuery} accessibilityLabel={t('weather_alerts.search')} />
          {query ? (
            <InputSlot className="pr-3" onPress={() => setQuery('')} accessibilityRole="button" accessibilityLabel={t('common.clear_search')}>
              <InputIcon as={X} />
            </InputSlot>
          ) : null}
        </Input>
        {admin ? (
          <Button
            variant="outline"
            className="h-10 bg-background-0"
            onPress={() => router.push(weatherAlertsRoutes.settings())}
            testID="weather-alerts-settings-button"
            accessibilityLabel={t('weather_alerts.settings_title')}
          >
            <Settings2 size={18} color="#6b7280" />
          </Button>
        ) : null}
      </HStack>
      <SeverityFilterTabs value={tab} onChange={setTab} counts={counts} />
      <HStack space="sm" className="mb-2">
        {SORTS.map((option) => (
          <Pressable key={option.id} testID={`weather-sort-${option.id}`} onPress={() => setSort(option.id)} accessibilityRole="button" accessibilityState={{ selected: sort === option.id }}>
            <Text className={`text-xs ${sort === option.id ? 'font-bold text-primary-600' : 'text-typography-500'}`}>{t(option.key)}</Text>
          </Pressable>
        ))}
      </HStack>
      {isLoading && !isRefreshing && alerts.length === 0 ? (
        <Loading text={t('weather_alerts.loading')} />
      ) : visible.length === 0 ? (
        <ZeroState icon={CloudSun} heading={t('weather_alerts.no_alerts')} description={t('weather_alerts.no_alerts_description')} testID="weather-alerts-empty">
          {admin ? (
            <Button variant="link" onPress={() => router.push(weatherAlertsRoutes.settings())}>
              <ButtonText>{t('weather_alerts.settings_title')}</ButtonText>
            </Button>
          ) : null}
        </ZeroState>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(alert) => alert.WeatherAlertId}
          renderItem={({ item }) => <WeatherAlertCard alert={item} onPress={open} />}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />}
          contentContainerStyle={{ paddingBottom: 96 }}
          testID="weather-alerts-list"
        />
      )}
    </View>
  );
}
