import { useCapability } from '@resgrid/config';
import { logger } from '@resgrid/core';
import { ConfirmDialog } from '@resgrid/features/auth-ui';
import { useTranslation } from '@resgrid/i18n';
import { getLocationPermissionRationale, getLocationTransmitter } from '@resgrid/location';
import { useRealtimeStore } from '@resgrid/realtime';
import { Text, VStack } from '@resgrid/ui';
import React, { useCallback, useState } from 'react';
import { Platform } from 'react-native';

import { ToggleRow } from '../components/settings-row';
import { getLocationPreferences, setBackgroundGeolocationPreference, setRealtimeGeolocationPreference, usePreferencesVersion } from '../lib/preferences';

/**
 * Location (Responder/Unit geolocation items; `capabilities.location`). Realtime Geolocation sends this person's or unit's
 * position while the app is open and joins the geolocation hub for everyone else's; Background Geolocation keeps sending
 * with the app in the background and needs "always" permission, asked for only when the member turns it on. Turning it on
 * first shows Google Play's prominent disclosure (what is collected, for which feature, even when the app is closed); the
 * OS prompt follows only when the member accepts it. The location transmitter re-reads these switches
 * (`subscribePreferences`).
 */
export const LocationSection: React.FC = () => {
  const { t } = useTranslation();
  const location = useCapability('location');
  usePreferencesVersion();
  const preferences = getLocationPreferences();
  const hubJoined = useRealtimeStore((state) => state.hubs.geolocation.joined);
  const [message, setMessage] = useState<string | null>(null);
  const [disclosureOpen, setDisclosureOpen] = useState(false);
  const backgroundAvailable = location.background && (Platform.OS === 'ios' || Platform.OS === 'android');

  const toggleRealtime = useCallback(async (enabled: boolean) => {
    setRealtimeGeolocationPreference(enabled);
    try {
      const realtime = useRealtimeStore.getState();
      await (enabled ? realtime.connectGeolocationHub() : realtime.disconnectGeolocationHub());
    } catch {
      logger.warn({ message: 'Geolocation hub could not follow the Realtime Geolocation switch' });
    }
  }, []);

  const toggleBackground = useCallback((enabled: boolean) => {
    setMessage(null);
    if (!enabled) {
      setBackgroundGeolocationPreference(false);
      return;
    }
    setDisclosureOpen(true);
  }, []);

  // The member accepted the disclosure: now the OS prompt. The switch only stays on when "always" is granted;
  // otherwise the OS setting is the way forward.
  const acceptDisclosure = useCallback(async () => {
    setDisclosureOpen(false);
    const transmitter = getLocationTransmitter();
    const result = transmitter ? await transmitter.requestBackgroundTracking().catch(() => null) : null;
    if (!result || result.outcome === 'granted') {
      setBackgroundGeolocationPreference(true);
      return;
    }
    setMessage(result.outcome === 'blocked' ? t('location.permission_blocked_message') : t('settings.background_geolocation_denied'));
  }, [t]);

  const disclosure = getLocationPermissionRationale('background', { target: location.transmission });

  return (
    <VStack space="sm">
      <ToggleRow
        label={t('settings.realtime_geolocation')}
        value={preferences.realtimeGeolocation}
        note={`${t('settings.realtime_geolocation_warning')} ${hubJoined ? t('settings.geolocation_hub_connected') : t('settings.geolocation_hub_connecting')}`}
        onValueChange={(enabled) => void toggleRealtime(enabled)}
        testID="settings-realtime-geolocation"
      />
      {backgroundAvailable ? (
        <ToggleRow
          label={t('settings.background_geolocation')}
          value={preferences.backgroundGeolocation}
          note={t('settings.background_geolocation_warning')}
          onValueChange={toggleBackground}
          testID="settings-background-geolocation"
        />
      ) : null}
      <ConfirmDialog
        isOpen={disclosureOpen}
        title={disclosure.title}
        message={disclosure.message}
        confirmLabel={disclosure.confirmLabel}
        cancelLabel={disclosure.cancelLabel}
        onConfirm={() => void acceptDisclosure()}
        onCancel={() => setDisclosureOpen(false)}
        testID="settings-background-disclosure"
      />
      {message ? (
        <Text size="sm" className="px-1 text-warning-700" accessibilityLiveRegion="polite" testID="settings-location-message">
          {message}
        </Text>
      ) : null}
    </VStack>
  );
};
