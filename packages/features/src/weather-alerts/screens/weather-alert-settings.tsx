import { useCapability } from '@resgrid/config';
import { useWeatherAlertsStore } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import { type WeatherAlertSourceResultData, WeatherAlertSourceType, type WeatherAlertZoneResultData } from '@resgrid/models';
import { Box, Button, ButtonText, Heading, HStack, Pressable, ScreenHeader, ScrollView, Switch, Text, Textarea, TextareaInput, useToast, View, VStack, ZeroState } from '@resgrid/ui';
import { router } from 'expo-router';
import { Lock } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';

import { WeatherAlertSourceSheet } from '../components/weather-alert-source-sheet';
import { WeatherAlertZoneSheet } from '../components/weather-alert-zone-sheet';
import { SEVERITY_TABS, severityKey } from '../lib/weather-alert-format';

const SEVERITY_OPTIONS = SEVERITY_TABS.filter((tab): tab is Exclude<typeof tab, 'all'> => tab !== 'all');

const SOURCE_TYPE_KEYS: Record<number, string> = {
  [WeatherAlertSourceType.NationalWeatherService]: 'weather_alerts.settings.source_type_nws',
  [WeatherAlertSourceType.EnvironmentCanada]: 'weather_alerts.settings.source_type_environment_canada',
  [WeatherAlertSourceType.MeteoAlarm]: 'weather_alerts.settings.source_type_meteoalarm',
};

const SeverityPicker: React.FC<{ value: number; onChange: (value: number) => void; testID: string }> = ({ value, onChange, testID }) => {
  const { t } = useTranslation();
  return (
    <HStack space="sm" className="flex-wrap">
      {SEVERITY_OPTIONS.map((severity) => (
        <Pressable
          key={severity}
          testID={`${testID}-${severity}`}
          onPress={() => onChange(severity)}
          accessibilityRole="radio"
          accessibilityState={{ selected: value === severity }}
          className={`mb-1 rounded-full px-3 py-1.5 ${value === severity ? 'bg-primary-500' : 'bg-background-100'}`}
        >
          <Text className={`text-sm ${value === severity ? 'text-typography-0' : 'text-typography-700'}`}>{t(severityKey(severity))}</Text>
        </Pressable>
      ))}
    </HStack>
  );
};

/** Two-tap delete: the first tap asks, the second confirms (works the same on native, web and Electron). */
const DeleteButton: React.FC<{ onConfirm: () => void; testID: string }> = ({ onConfirm, testID }) => {
  const { t } = useTranslation();
  const [armed, setArmed] = useState(false);
  return armed ? (
    <HStack space="xs">
      <Button size="xs" action="negative" onPress={onConfirm} testID={`${testID}-confirm`}>
        <ButtonText>{t('common.delete')}</ButtonText>
      </Button>
      <Button size="xs" variant="outline" action="secondary" onPress={() => setArmed(false)}>
        <ButtonText>{t('common.cancel')}</ButtonText>
      </Button>
    </HStack>
  ) : (
    <Button size="xs" variant="outline" action="negative" onPress={() => setArmed(true)} testID={testID}>
      <ButtonText>{t('common.delete')}</ButtonText>
    </Button>
  );
};

/**
 * Department weather alert administration (Dispatch settings screen + admin sheets): delivery settings, monitored
 * zones and feed sources. Only for variants with `capabilities.weatherAlerts.admin`; elsewhere it shows "not
 * available" and never calls the admin endpoints (the store refuses them locally as well).
 */
export default function WeatherAlertSettingsScreen() {
  const { t } = useTranslation();
  const toast = useToast();
  const { admin } = useCapability('weatherAlerts');
  const settings = useWeatherAlertsStore((state) => state.settings);
  const sources = useWeatherAlertsStore((state) => state.sources);
  const zones = useWeatherAlertsStore((state) => state.zones);
  const adminError = useWeatherAlertsStore((state) => state.adminError);
  const [enabled, setEnabled] = useState(true);
  const [minimumSeverity, setMinimumSeverity] = useState(2);
  const [autoMessageSeverity, setAutoMessageSeverity] = useState(1);
  const [callIntegration, setCallIntegration] = useState(false);
  const [excludedEvents, setExcludedEvents] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [sourceSheet, setSourceSheet] = useState<{ open: boolean; source: WeatherAlertSourceResultData | null }>({ open: false, source: null });
  const [zoneSheet, setZoneSheet] = useState<{ open: boolean; zone: WeatherAlertZoneResultData | null }>({ open: false, zone: null });

  useEffect(() => {
    if (!admin) return;
    const store = useWeatherAlertsStore.getState();
    void store.fetchSettings();
    void store.fetchSources();
    void store.fetchZones();
  }, [admin]);

  useEffect(() => {
    if (!settings) return;
    setEnabled(settings.WeatherAlertsEnabled);
    setMinimumSeverity(settings.MinimumSeverity);
    setAutoMessageSeverity(settings.AutoMessageSeverity);
    setCallIntegration(settings.CallIntegrationEnabled);
    setExcludedEvents(settings.ExcludedEvents ?? '');
  }, [settings]);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/weather-alerts'));

  if (!admin) {
    return (
      <View className="flex-1 bg-background-50" testID="weather-alert-settings-screen">
        <ScreenHeader title={t('weather_alerts.settings_title')} onBack={back} />
        <ZeroState icon={Lock} heading={t('weather_alerts.settings.not_available')} testID="weather-alert-settings-unavailable" />
      </View>
    );
  }

  const save = async () => {
    setIsSaving(true);
    const ok = await useWeatherAlertsStore.getState().saveSettings({
      WeatherAlertsEnabled: enabled,
      MinimumSeverity: minimumSeverity,
      AutoMessageSeverity: autoMessageSeverity,
      CallIntegrationEnabled: callIntegration,
      AutoMessageSchedule: settings?.AutoMessageSchedule ?? [],
      ExcludedEvents: excludedEvents.trim(),
    });
    setIsSaving(false);
    if (ok) toast.success(t('weather_alerts.settings.saved'));
    else toast.error(t('weather_alerts.settings.save_error'));
  };

  const remove = async (action: Promise<boolean>) => {
    if (await action) toast.success(t('weather_alerts.settings.saved'));
    else toast.error(t('weather_alerts.settings.save_error'));
  };

  return (
    <View className="flex-1 bg-background-50" testID="weather-alert-settings-screen">
      <ScreenHeader title={t('weather_alerts.settings_title')} onBack={back} />
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
        {adminError ? (
          <Text className="mx-4 mt-3 rounded-lg bg-error-50 p-2 text-sm text-error-600" testID="weather-alert-settings-error">
            {t('weather_alerts.settings.load_error')}
          </Text>
        ) : null}

        <Box className="mx-4 mt-4 rounded-xl border border-outline-200 bg-background-0 p-4">
          <Heading size="sm" className="mb-2 text-typography-900">
            {t('weather_alerts.settings.general')}
          </Heading>
          <HStack className="items-center justify-between py-2">
            <Text className="flex-1 text-sm text-typography-900">{t('weather_alerts.settings.enabled')}</Text>
            <Switch value={enabled} onValueChange={setEnabled} testID="weather-settings-enabled" />
          </HStack>
          <Text className="mb-1 mt-2 text-sm text-typography-500">{t('weather_alerts.settings.minimum_severity')}</Text>
          <SeverityPicker value={minimumSeverity} onChange={setMinimumSeverity} testID="weather-settings-minimum" />
          <Text className="mb-1 mt-2 text-sm text-typography-500">{t('weather_alerts.settings.auto_message_severity')}</Text>
          <SeverityPicker value={autoMessageSeverity} onChange={setAutoMessageSeverity} testID="weather-settings-auto-message" />
          <HStack className="items-center justify-between py-2">
            <Text className="flex-1 pr-2 text-sm text-typography-900">{t('weather_alerts.settings.call_integration')}</Text>
            <Switch value={callIntegration} onValueChange={setCallIntegration} testID="weather-settings-call-integration" />
          </HStack>
          <Text className="mb-1 mt-2 text-sm text-typography-500">{t('weather_alerts.settings.excluded_events')}</Text>
          <Textarea size="sm">
            <TextareaInput testID="weather-settings-excluded" value={excludedEvents} onChangeText={setExcludedEvents} placeholder={t('weather_alerts.settings.excluded_events_placeholder')} />
          </Textarea>
          <Button className="mt-3" onPress={() => void save()} isDisabled={isSaving} testID="weather-settings-save">
            <ButtonText>{t('common.save')}</ButtonText>
          </Button>
        </Box>

        <Box className="mx-4 mt-4 rounded-xl border border-outline-200 bg-background-0 p-4" testID="weather-settings-zones">
          <HStack className="mb-2 items-center justify-between">
            <Heading size="sm" className="text-typography-900">
              {t('weather_alerts.settings.zones')}
            </Heading>
            <Button size="xs" variant="outline" onPress={() => setZoneSheet({ open: true, zone: null })} testID="weather-settings-add-zone">
              <ButtonText>{t('weather_alerts.settings.add_zone')}</ButtonText>
            </Button>
          </HStack>
          {zones.length === 0 ? <Text className="text-sm text-typography-500">{t('weather_alerts.settings.no_zones')}</Text> : null}
          {zones.map((zone) => (
            <HStack key={zone.WeatherAlertZoneId} space="sm" className="items-center border-b border-outline-100 py-2" testID={`weather-zone-${zone.WeatherAlertZoneId}`}>
              <Pressable className="flex-1" onPress={() => setZoneSheet({ open: true, zone })} accessibilityRole="button">
                <VStack>
                  <Text className="text-sm font-medium text-typography-900">{zone.IsPrimary ? `${zone.Name} (${t('weather_alerts.settings.primary')})` : zone.Name}</Text>
                  <Text className="text-xs text-typography-500">{`${zone.ZoneCode || '—'} · ${zone.RadiusMiles} mi · ${zone.IsActive ? t('weather_alerts.settings.active') : t('weather_alerts.settings.inactive')}`}</Text>
                </VStack>
              </Pressable>
              <DeleteButton onConfirm={() => void remove(useWeatherAlertsStore.getState().deleteZone(zone.WeatherAlertZoneId))} testID={`weather-zone-${zone.WeatherAlertZoneId}-delete`} />
            </HStack>
          ))}
        </Box>

        <Box className="mx-4 mt-4 rounded-xl border border-outline-200 bg-background-0 p-4" testID="weather-settings-sources">
          <HStack className="mb-2 items-center justify-between">
            <Heading size="sm" className="text-typography-900">
              {t('weather_alerts.settings.sources')}
            </Heading>
            <Button size="xs" variant="outline" onPress={() => setSourceSheet({ open: true, source: null })} testID="weather-settings-add-source">
              <ButtonText>{t('weather_alerts.settings.add_source')}</ButtonText>
            </Button>
          </HStack>
          {sources.length === 0 ? <Text className="text-sm text-typography-500">{t('weather_alerts.settings.no_sources')}</Text> : null}
          {sources.map((source) => (
            <HStack key={source.WeatherAlertSourceId} space="sm" className="items-center border-b border-outline-100 py-2" testID={`weather-source-${source.WeatherAlertSourceId}`}>
              <Pressable className="flex-1" onPress={() => setSourceSheet({ open: true, source })} accessibilityRole="button">
                <VStack>
                  <Text className="text-sm font-medium text-typography-900">{source.Name}</Text>
                  <Text className="text-xs text-typography-500">{`${t(SOURCE_TYPE_KEYS[source.SourceType] ?? 'weather_alerts.settings.source_type_nws')} · ${source.Active ? t('weather_alerts.settings.active') : t('weather_alerts.settings.inactive')}`}</Text>
                  {source.IsFailure && source.ErrorMessage ? <Text className="text-xs text-error-600">{source.ErrorMessage}</Text> : null}
                </VStack>
              </Pressable>
              <DeleteButton onConfirm={() => void remove(useWeatherAlertsStore.getState().deleteSource(source.WeatherAlertSourceId))} testID={`weather-source-${source.WeatherAlertSourceId}-delete`} />
            </HStack>
          ))}
        </Box>
      </ScrollView>

      <WeatherAlertSourceSheet isOpen={sourceSheet.open} onClose={() => setSourceSheet({ open: false, source: null })} source={sourceSheet.source} />
      <WeatherAlertZoneSheet isOpen={zoneSheet.open} onClose={() => setZoneSheet({ open: false, zone: null })} zone={zoneSheet.zone} />
    </View>
  );
}
