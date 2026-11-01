import { useAuthStore } from '@resgrid/auth';
import { useCapability } from '@resgrid/config';
import { LoginForm, type LoginFormValues, pushRoute, ServerUrlSheet, useLoginServer } from '@resgrid/features/auth-ui';
import { useTranslation } from '@resgrid/i18n';
import { CustomBottomSheet, Heading, Text, VStack } from '@resgrid/ui';
import React, { useCallback, useState } from 'react';

import { SettingsRow } from '../components/settings-row';
import { settingsRoutes } from '../routes';

/** Responder's "Login Info": sign in again (as yourself after a password change, or as someone else). */
const LoginInfoSheet: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const { t } = useTranslation();
  const login = useAuthStore((state) => state.login);
  const status = useAuthStore((state) => state.status);
  const submit = useCallback(
    async (values: LoginFormValues) => {
      await login({ username: values.username, password: values.password });
      onClose();
    },
    [login, onClose]
  );
  return (
    <CustomBottomSheet isOpen={isOpen} onClose={onClose} snapPoints={[70]} testID="login-info-sheet">
      <VStack space="md" className="w-full">
        <Heading size="md" accessibilityRole="header">
          {t('settings.login_info')}
        </Heading>
        <Text size="sm" className="text-typography-500">
          {t('settings.login_info_description')}
        </Text>
        <LoginForm onSubmit={submit} isLoading={status === 'loading'} />
      </VStack>
    </CustomBottomSheet>
  );
};

/** Account: server, login info, sign-in and security, shared device, approving sign-ins (Responder `settings`, Unit additions). */
export const AccountSection: React.FC = () => {
  const { t } = useTranslation();
  const auth = useCapability('auth');
  const push = useCapability('push');
  const server = useLoginServer();
  const profileName = useAuthStore((state) => state.profile?.name ?? null);
  const [serverOpen, setServerOpen] = useState(false);
  const [loginInfoOpen, setLoginInfoOpen] = useState(false);

  return (
    <>
      <SettingsRow label={t('settings.server')} value={server.name} description={server.kind === 'custom' ? server.host : null} onPress={() => setServerOpen(true)} testID="settings-server" />
      <SettingsRow label={t('settings.login_info')} value={profileName} onPress={() => setLoginInfoOpen(true)} testID="settings-login-info" />
      {auth.mfa || auth.passkeys ? <SettingsRow label={t('mfa.account.title')} onPress={() => pushRoute(settingsRoutes.accountSecurity())} testID="settings-account-security" /> : null}
      {auth.sharedDevice ? <SettingsRow label={t('shared_session.device_title')} onPress={() => pushRoute(settingsRoutes.sharedDevice())} testID="settings-shared-device" /> : null}
      {push.approveSignIns ? <SettingsRow label={t('mfa.approve.title')} onPress={() => pushRoute(settingsRoutes.approveSignIn())} testID="settings-approve-sign-in" /> : null}
      <ServerUrlSheet isOpen={serverOpen} onClose={() => setServerOpen(false)} />
      <LoginInfoSheet isOpen={loginInfoOpen} onClose={() => setLoginInfoOpen(false)} />
    </>
  );
};
