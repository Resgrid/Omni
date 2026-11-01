import { useAuth, useAuthStore, useSharedInstallation } from '@resgrid/auth';
import { useCapability } from '@resgrid/config';
import { logger } from '@resgrid/core';
import { useTranslation } from '@resgrid/i18n';
import { Button, ButtonText, Heading, HStack, Text, VStack } from '@resgrid/ui';
import React, { useCallback, useEffect, useState } from 'react';

import { AuthLayout } from '../components/auth-layout';
import { ConfirmDialog } from '../components/confirm-dialog';
import { LanguagePicker } from '../components/language-picker';
import { LoginForm, type LoginFormValues } from '../components/login-form';
import { LoginServerBadge } from '../components/login-server-badge';
import { ServerUrlSheet } from '../components/server-url-sheet';
import { SharedDeviceSetup } from '../components/shared-device-setup';
import { SsoSignIn } from '../components/sso-sign-in';
import { describeAuthError } from '../lib/auth-errors';
import { useLoginServer } from '../lib/login-server';
import { homeHref, replaceRoute } from '../lib/navigation';
import { LegacyOtpSheet } from '../mfa/legacy-otp-sheet';
import { LoginMfaSheet } from '../mfa/login-mfa-sheet';
import { FactorRecovery } from './recovery-screen';

export type LoginView = 'form' | 'sso' | 'recovery' | 'shared-device';

export interface LoginScreenProps {
  /** Called once signed in. Default: replace the navigation with the variant's home route (never push). */
  onSignedIn?: () => void;
  initialView?: LoginView;
}

/**
 * Sign-in for every variant (omni-plan §7.3): Responder's screen (replace navigation, `describeLoginFailure`, language
 * picker) + Unit's shared-device entry, `shift_ended` message and password toggle. The server badge and sheet, SSO,
 * the second factor (transaction methods, recovery code, legacy authenticator prompt) and factor recovery all live here,
 * so ShellGate can render it in place of the navigator. Wide web windows get Dispatch's layout through AuthLayout.
 */
export function LoginScreen({ onSignedIn, initialView = 'form' }: LoginScreenProps) {
  const { t } = useTranslation();
  const auth = useCapability('auth');
  const { login, status, error, loginFailure, isAuthenticated, mfaChallenge, isSsoMfaPending } = useAuth();
  const installation = useSharedInstallation();
  const { name: serverName } = useLoginServer();
  const [view, setView] = useState<LoginView>(initialView);
  const [serverSheetOpen, setServerSheetOpen] = useState(false);
  const [errorDialogOpen, setErrorDialogOpen] = useState(false);
  // Held only to resubmit with the authenticator code on a server without the login transaction; memory-only, cleared
  // with the component. Never logged.
  const [pendingCredentials, setPendingCredentials] = useState<LoginFormValues | null>(null);
  const [otpDismissed, setOtpDismissed] = useState(false);

  const failure = describeAuthError(t, error, loginFailure, serverName);

  useEffect(() => {
    if (status === 'signedIn' && isAuthenticated) {
      setPendingCredentials(null);
      if (onSignedIn) {
        onSignedIn();
      } else {
        replaceRoute(homeHref());
      }
    }
  }, [isAuthenticated, onSignedIn, status]);

  useEffect(() => {
    if (status === 'error') {
      // The code only: never the username, the server's text or the exception.
      logger.warn({ message: 'Sign-in failed', context: { code: error ?? 'unknown' } });
      setErrorDialogOpen(true);
    }
  }, [error, status]);

  useEffect(() => {
    if (status === 'mfaRequired' && isSsoMfaPending) {
      setOtpDismissed(false);
    }
  }, [isSsoMfaPending, status]);

  const submit = useCallback(
    async (values: LoginFormValues) => {
      setPendingCredentials(values);
      setOtpDismissed(false);
      await login({ username: values.username, password: values.password });
    },
    [login]
  );

  const submitOtp = useCallback(
    async (code: string) => {
      if (isSsoMfaPending) {
        await useAuthStore.getState().retrySsoWithOtp(code);
      } else if (pendingCredentials) {
        await login({ ...pendingCredentials, otpCode: code });
      }
    },
    [isSsoMfaPending, login, pendingCredentials]
  );

  const showForm = useCallback(() => setView('form'), []);
  const isLoading = status === 'loading';
  const errorOpen = errorDialogOpen && failure !== null;
  const mfaOpen = status === 'mfaRequired' && mfaChallenge !== null && mfaChallenge.kind !== 'legacy';
  const legacyOtpOpen = status === 'mfaRequired' && !otpDismissed && (isSsoMfaPending || (mfaChallenge?.kind === 'legacy' && pendingCredentials !== null));
  const sharedDeviceLabel = !installation.configured
    ? t('shared_session.device_setup')
    : installation.shared
      ? installation.label
        ? t('shared_session.device_on_label', { label: installation.label })
        : t('shared_session.device_on')
      : t('shared_session.device_settings');

  const header = (
    <VStack space="xs" className="mb-6 items-center">
      <Heading size="2xl" className="text-center" accessibilityRole="header">
        {t('login.page_title')}
      </Heading>
      <Text className="text-center text-typography-500">{t('login.page_subtitle')}</Text>
    </VStack>
  );

  return (
    <AuthLayout header={view === 'form' ? header : undefined} testID="login-screen">
      {view === 'form' ? (
        <VStack space="lg" className="w-full">
          <LoginServerBadge onPress={() => setServerSheetOpen(true)} />
          <LoginForm onSubmit={submit} isLoading={isLoading} error={status === 'error' && failure ? failure.message : null} sharedDevice={installation.shared} />
          <HStack space="sm" className="w-full">
            <Button variant="outline" action="secondary" size="sm" className="flex-1" onPress={() => setServerSheetOpen(true)} accessibilityLabel={t('login.change_server_url')} testID="login-server-button">
              <ButtonText>{t('login.change_server_url')}</ButtonText>
            </Button>
            <Button variant="outline" action="secondary" size="sm" className="flex-1" onPress={() => setView('sso')} accessibilityLabel={t('login.sso_button')} testID="login-sso-button">
              <ButtonText>{t('login.sso_button')}</ButtonText>
            </Button>
          </HStack>
          {auth.sharedDevice ? (
            <Button variant="link" action="secondary" size="sm" className="self-center" onPress={() => setView('shared-device')} accessibilityLabel={sharedDeviceLabel} testID="login-shared-device">
              <ButtonText>{sharedDeviceLabel}</ButtonText>
            </Button>
          ) : null}
          <LanguagePicker />
        </VStack>
      ) : null}
      {view === 'sso' ? <SsoSignIn onBack={showForm} isLoading={isLoading} /> : null}
      {view === 'recovery' ? <FactorRecovery onFinished={showForm} /> : null}
      {view === 'shared-device' ? <SharedDeviceSetup onDone={showForm} /> : null}

      <ServerUrlSheet isOpen={serverSheetOpen} onClose={() => setServerSheetOpen(false)} />
      <LoginMfaSheet isOpen={mfaOpen} onLostFactor={() => setView('recovery')} />
      <LegacyOtpSheet isOpen={legacyOtpOpen} isSubmitting={isLoading} invalidCode={error === 'invalid_totp'} onSubmit={(code) => void submitOtp(code)} onClose={() => setOtpDismissed(true)} />
      <ConfirmDialog
        isOpen={errorOpen}
        title={failure?.title ?? t('login.errorModal.title')}
        message={failure?.message ?? t('login.errorModal.message')}
        confirmLabel={t('login.errorModal.confirmButton')}
        onConfirm={() => setErrorDialogOpen(false)}
        testID="login-error-dialog"
      />
    </AuthLayout>
  );
}

export default LoginScreen;
