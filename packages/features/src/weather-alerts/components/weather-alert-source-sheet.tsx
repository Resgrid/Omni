import { useWeatherAlertsStore } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import { type WeatherAlertSourceResultData, WeatherAlertSourceType } from '@resgrid/models';
import { Button, ButtonText, CustomBottomSheet, HStack, Input, InputField, Pressable, ScrollView, Switch, Text, useToast, VStack } from '@resgrid/ui';
import React, { useEffect, useState } from 'react';

export interface WeatherAlertSourceSheetProps {
  isOpen: boolean;
  onClose: () => void;
  /** Edit this source; null/undefined adds one. */
  source?: WeatherAlertSourceResultData | null;
}

const SOURCE_TYPES: { value: WeatherAlertSourceType; key: string }[] = [
  { value: WeatherAlertSourceType.NationalWeatherService, key: 'weather_alerts.settings.source_type_nws' },
  { value: WeatherAlertSourceType.EnvironmentCanada, key: 'weather_alerts.settings.source_type_environment_canada' },
  { value: WeatherAlertSourceType.MeteoAlarm, key: 'weather_alerts.settings.source_type_meteoalarm' },
];

/** Add or edit a weather alert feed (Dispatch admin sheet). The API key is never returned; blank keeps the stored one. */
export const WeatherAlertSourceSheet: React.FC<WeatherAlertSourceSheetProps> = ({ isOpen, onClose, source }) => {
  const { t } = useTranslation();
  const toast = useToast();
  const [name, setName] = useState('');
  const [sourceType, setSourceType] = useState<number>(WeatherAlertSourceType.NationalWeatherService);
  const [areaFilter, setAreaFilter] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [customEndpoint, setCustomEndpoint] = useState('');
  const [pollInterval, setPollInterval] = useState('15');
  const [active, setActive] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setName(source?.Name ?? '');
    setSourceType(source ? source.SourceType : WeatherAlertSourceType.NationalWeatherService);
    setAreaFilter(source?.AreaFilter ?? '');
    setApiKey('');
    setCustomEndpoint(source?.CustomEndpoint ?? '');
    setPollInterval(source ? String(source.PollIntervalMinutes) : '15');
    setActive(source ? source.Active : true);
    setError(null);
  }, [isOpen, source]);

  const submit = async () => {
    if (!name.trim()) {
      setError(t('weather_alerts.settings.name_required'));
      return;
    }
    setBusy(true);
    const ok = await useWeatherAlertsStore.getState().saveSource({
      WeatherAlertSourceId: source?.WeatherAlertSourceId || undefined,
      Name: name.trim(),
      SourceType: sourceType,
      AreaFilter: areaFilter.trim(),
      ApiKey: apiKey.trim(),
      CustomEndpoint: customEndpoint.trim(),
      PollIntervalMinutes: Math.max(1, parseInt(pollInterval, 10) || 15),
      Active: active,
    });
    setBusy(false);
    if (!ok) {
      setError(t('weather_alerts.settings.save_error'));
      return;
    }
    toast.success(t('weather_alerts.settings.saved'));
    onClose();
  };

  return (
    <CustomBottomSheet isOpen={isOpen} onClose={onClose} isLoading={busy} snapPoints={[85]} testID="weather-source-sheet">
      <VStack space="md" className="w-full flex-1">
        <Text className="text-lg font-semibold text-typography-900">{source ? t('weather_alerts.settings.edit_source') : t('weather_alerts.settings.add_source')}</Text>
        <ScrollView className="flex-1" keyboardShouldPersistTaps="handled">
          <VStack space="sm">
            <Text className="text-sm text-typography-600">{t('weather_alerts.settings.source_name')}</Text>
            <Input>
              <InputField testID="weather-source-name" value={name} onChangeText={setName} accessibilityLabel={t('weather_alerts.settings.source_name')} />
            </Input>
            <Text className="text-sm text-typography-600">{t('weather_alerts.settings.source_type')}</Text>
            <HStack space="sm" className="flex-wrap">
              {SOURCE_TYPES.map((option) => (
                <Pressable
                  key={option.value}
                  testID={`weather-source-type-${option.value}`}
                  onPress={() => setSourceType(option.value)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: sourceType === option.value }}
                  className={`mb-1 rounded-full px-3 py-1.5 ${sourceType === option.value ? 'bg-primary-500' : 'bg-background-100'}`}
                >
                  <Text className={`text-sm ${sourceType === option.value ? 'text-typography-0' : 'text-typography-700'}`}>{t(option.key)}</Text>
                </Pressable>
              ))}
            </HStack>
            <Text className="text-sm text-typography-600">{t('weather_alerts.settings.area_filter')}</Text>
            <Input>
              <InputField testID="weather-source-area" value={areaFilter} onChangeText={setAreaFilter} accessibilityLabel={t('weather_alerts.settings.area_filter')} />
            </Input>
            <Text className="text-sm text-typography-600">{source?.HasApiKey ? t('weather_alerts.settings.api_key_keep') : t('weather_alerts.settings.api_key')}</Text>
            <Input>
              <InputField testID="weather-source-api-key" value={apiKey} onChangeText={setApiKey} secureTextEntry autoCapitalize="none" autoCorrect={false} accessibilityLabel={t('weather_alerts.settings.api_key')} />
            </Input>
            <Text className="text-sm text-typography-600">{t('weather_alerts.settings.custom_endpoint')}</Text>
            <Input>
              <InputField
                testID="weather-source-endpoint"
                value={customEndpoint}
                onChangeText={setCustomEndpoint}
                autoCapitalize="none"
                keyboardType="url"
                accessibilityLabel={t('weather_alerts.settings.custom_endpoint')}
              />
            </Input>
            <Text className="text-sm text-typography-600">{t('weather_alerts.settings.poll_interval')}</Text>
            <Input>
              <InputField testID="weather-source-poll" value={pollInterval} onChangeText={setPollInterval} keyboardType="number-pad" accessibilityLabel={t('weather_alerts.settings.poll_interval')} />
            </Input>
            <HStack className="items-center justify-between py-2">
              <Text className="text-sm text-typography-900">{t('weather_alerts.settings.active')}</Text>
              <Switch value={active} onValueChange={setActive} testID="weather-source-active" />
            </HStack>
          </VStack>
        </ScrollView>
        {error ? (
          <Text className="text-center text-sm text-error-600" testID="weather-source-error" accessibilityRole="alert">
            {error}
          </Text>
        ) : null}
        <HStack space="md">
          <Button variant="outline" action="secondary" className="flex-1" onPress={onClose} isDisabled={busy}>
            <ButtonText>{t('common.cancel')}</ButtonText>
          </Button>
          <Button className="flex-1" onPress={() => void submit()} isDisabled={busy} testID="weather-source-save">
            <ButtonText>{t('common.save')}</ButtonText>
          </Button>
        </HStack>
      </VStack>
    </CustomBottomSheet>
  );
};
