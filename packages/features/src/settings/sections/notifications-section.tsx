import { useTranslation } from '@resgrid/i18n';
import { type NotificationSound, notificationSoundService } from '@resgrid/notifications';
import { Button, ButtonText, HStack, Text, VStack } from '@resgrid/ui';
import React from 'react';
import { Linking, Platform } from 'react-native';

import { SettingsRow } from '../components/settings-row';

/** One test button per alert family the member is most likely to want to hear (omni-plan D17: modern sounds only). */
const TEST_SOUNDS: readonly { sound: NotificationSound; key: string }[] = [
  { sound: 'moderncallemergency', key: 'settings.sounds.call_emergency' },
  { sound: 'moderncallhigh', key: 'settings.sounds.call_high' },
  { sound: 'moderncallmedium', key: 'settings.sounds.call_medium' },
  { sound: 'moderncalllow', key: 'settings.sounds.call_low' },
  { sound: 'modernmessage', key: 'settings.sounds.message' },
  { sound: 'modernnotification', key: 'settings.sounds.notification' },
];

/**
 * Notifications and sounds (Unit/Dispatch sound items). Omni ships the modern sound set only — there is no classic toggle;
 * the member can play each alert tone and, on a phone, open the system notification settings (channels, volume, DND).
 */
export const NotificationsSection: React.FC = () => {
  const { t } = useTranslation();
  const isNative = Platform.OS === 'ios' || Platform.OS === 'android';
  return (
    <VStack space="sm">
      <Text size="sm" className="px-1 text-typography-600">
        {t('settings.sounds.modern_only')}
      </Text>
      <Text size="sm" className="px-1 font-medium">
        {t('settings.sounds.test_title')}
      </Text>
      <HStack className="flex-wrap px-1" space="sm">
        {TEST_SOUNDS.map(({ sound, key }) => (
          <Button
            key={sound}
            size="xs"
            variant="outline"
            action="secondary"
            className="mb-2"
            onPress={() => void notificationSoundService.play(sound)}
            accessibilityLabel={t('settings.sounds.play', { name: t(key) })}
            testID={`settings-sound-${sound}`}
          >
            <ButtonText>{t(key)}</ButtonText>
          </Button>
        ))}
      </HStack>
      {isNative ? <SettingsRow label={t('settings.notifications_open_system')} onPress={() => void Linking.openSettings()} testID="settings-notifications-system" /> : null}
    </VStack>
  );
};
