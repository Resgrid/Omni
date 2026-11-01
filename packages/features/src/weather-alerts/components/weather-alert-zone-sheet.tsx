import { useWeatherAlertsStore } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import { type WeatherAlertZoneResultData } from '@resgrid/models';
import { Button, ButtonText, CustomBottomSheet, HStack, Input, InputField, ScrollView, Switch, Text, useToast, VStack } from '@resgrid/ui';
import React, { useEffect, useState } from 'react';

export interface WeatherAlertZoneSheetProps {
  isOpen: boolean;
  onClose: () => void;
  zone?: WeatherAlertZoneResultData | null;
}

/** Add or edit a monitored zone (Dispatch admin sheet): name, zone code, centre "lat,lng", radius, active, primary. */
export const WeatherAlertZoneSheet: React.FC<WeatherAlertZoneSheetProps> = ({ isOpen, onClose, zone }) => {
  const { t } = useTranslation();
  const toast = useToast();
  const [name, setName] = useState('');
  const [zoneCode, setZoneCode] = useState('');
  const [center, setCenter] = useState('');
  const [radius, setRadius] = useState('25');
  const [isActive, setIsActive] = useState(true);
  const [isPrimary, setIsPrimary] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setName(zone?.Name ?? '');
    setZoneCode(zone?.ZoneCode ?? '');
    setCenter(zone?.CenterGeoLocation ?? '');
    setRadius(zone ? String(zone.RadiusMiles) : '25');
    setIsActive(zone ? zone.IsActive : true);
    setIsPrimary(zone ? zone.IsPrimary : false);
    setError(null);
  }, [isOpen, zone]);

  const submit = async () => {
    if (!name.trim()) {
      setError(t('weather_alerts.settings.name_required'));
      return;
    }
    setBusy(true);
    const ok = await useWeatherAlertsStore.getState().saveZone({
      WeatherAlertZoneId: zone?.WeatherAlertZoneId || undefined,
      Name: name.trim(),
      ZoneCode: zoneCode.trim(),
      CenterGeoLocation: center.trim(),
      RadiusMiles: Math.max(0, parseFloat(radius) || 0),
      IsActive: isActive,
      IsPrimary: isPrimary,
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
    <CustomBottomSheet isOpen={isOpen} onClose={onClose} isLoading={busy} snapPoints={[75]} testID="weather-zone-sheet">
      <VStack space="md" className="w-full flex-1">
        <Text className="text-lg font-semibold text-typography-900">{zone ? t('weather_alerts.settings.edit_zone') : t('weather_alerts.settings.add_zone')}</Text>
        <ScrollView className="flex-1" keyboardShouldPersistTaps="handled">
          <VStack space="sm">
            <Text className="text-sm text-typography-600">{t('weather_alerts.settings.zone_name')}</Text>
            <Input>
              <InputField testID="weather-zone-name" value={name} onChangeText={setName} accessibilityLabel={t('weather_alerts.settings.zone_name')} />
            </Input>
            <Text className="text-sm text-typography-600">{t('weather_alerts.settings.zone_code')}</Text>
            <Input>
              <InputField testID="weather-zone-code" value={zoneCode} onChangeText={setZoneCode} autoCapitalize="characters" accessibilityLabel={t('weather_alerts.settings.zone_code')} />
            </Input>
            <Text className="text-sm text-typography-600">{t('weather_alerts.settings.zone_center')}</Text>
            <Input>
              <InputField testID="weather-zone-center" value={center} onChangeText={setCenter} placeholder="39.7392,-104.9903" accessibilityLabel={t('weather_alerts.settings.zone_center')} />
            </Input>
            <Text className="text-sm text-typography-600">{t('weather_alerts.settings.zone_radius')}</Text>
            <Input>
              <InputField testID="weather-zone-radius" value={radius} onChangeText={setRadius} keyboardType="decimal-pad" accessibilityLabel={t('weather_alerts.settings.zone_radius')} />
            </Input>
            <HStack className="items-center justify-between py-2">
              <Text className="text-sm text-typography-900">{t('weather_alerts.settings.active')}</Text>
              <Switch value={isActive} onValueChange={setIsActive} testID="weather-zone-active" />
            </HStack>
            <HStack className="items-center justify-between py-2">
              <Text className="text-sm text-typography-900">{t('weather_alerts.settings.primary')}</Text>
              <Switch value={isPrimary} onValueChange={setIsPrimary} testID="weather-zone-primary" />
            </HStack>
          </VStack>
        </ScrollView>
        {error ? (
          <Text className="text-center text-sm text-error-600" testID="weather-zone-error" accessibilityRole="alert">
            {error}
          </Text>
        ) : null}
        <HStack space="md">
          <Button variant="outline" action="secondary" className="flex-1" onPress={onClose} isDisabled={busy}>
            <ButtonText>{t('common.cancel')}</ButtonText>
          </Button>
          <Button className="flex-1" onPress={() => void submit()} isDisabled={busy} testID="weather-zone-save">
            <ButtonText>{t('common.save')}</ButtonText>
          </Button>
        </HStack>
      </VStack>
    </CustomBottomSheet>
  );
};
