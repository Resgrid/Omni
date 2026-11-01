import { readSharedInstallation, saveSharedInstallation, useIsAuthenticated } from '@resgrid/auth';
import { useTranslation } from '@resgrid/i18n';
import { Button, ButtonText, Heading, HStack, Input, InputField, Switch, Text, VStack } from '@resgrid/ui';
import React, { useState } from 'react';

/**
 * The shared device setting for this installation (passkey plan section 10.5, Unit). A shared installation asks for a
 * shared session at every sign-in: it locks when idle, the next operator unlocks with their own second factor or ends the
 * shift, and nothing is remembered between operators. It only ever tightens; the department can make sessions shared
 * without it.
 */
export const SharedDeviceSetup: React.FC<{ onDone: () => void }> = ({ onDone }) => {
  const { t } = useTranslation();
  const signedIn = useIsAuthenticated();
  const [initial] = useState(readSharedInstallation);
  // Shared is the suggested choice for a device nobody has set up yet (plan section 12.5.2); personal stays one tap away.
  const [shared, setShared] = useState(initial.configured ? initial.shared : true);
  const [label, setLabel] = useState(initial.label ?? '');

  const save = () => {
    saveSharedInstallation({ shared, label: shared ? label : null });
    onDone();
  };

  return (
    <VStack space="md" className="w-full" testID="shared-device-setup">
      <Heading size="lg" accessibilityRole="header">
        {t('shared_session.device_title')}
      </Heading>
      <Text size="sm">{t('shared_session.device_body')}</Text>
      <HStack space="md" className="items-center justify-between">
        <Text className="flex-1">{t('shared_session.device_toggle')}</Text>
        <Switch value={shared} onValueChange={setShared} accessibilityLabel={t('shared_session.device_toggle')} aria-label={t('shared_session.device_toggle')} testID="shared-device-toggle" />
      </HStack>
      {shared ? (
        <VStack space="xs">
          <Text size="sm">{t('shared_session.device_label')}</Text>
          <Input variant="outline" size="lg">
            <InputField
              testID="shared-device-label"
              value={label}
              onChangeText={setLabel}
              maxLength={64}
              autoCapitalize="words"
              placeholder={t('shared_session.device_label_placeholder')}
              accessibilityLabel={t('shared_session.device_label')}
              aria-label={t('shared_session.device_label')}
            />
          </Input>
          <Text size="xs" className="text-typography-500">
            {t('shared_session.device_label_hint')}
          </Text>
        </VStack>
      ) : null}
      {signedIn ? (
        <Text size="sm" className="text-typography-500" testID="shared-device-next-sign-in">
          {t('shared_session.device_next_sign_in')}
        </Text>
      ) : null}
      <Button action="primary" onPress={save} accessibilityLabel={t('shared_session.save')} testID="shared-device-save">
        <ButtonText>{t('shared_session.save')}</ButtonText>
      </Button>
      <Button variant="link" action="secondary" onPress={onDone} accessibilityLabel={t('common.cancel')} testID="shared-device-cancel">
        <ButtonText>{t('common.cancel')}</ButtonText>
      </Button>
    </VStack>
  );
};
