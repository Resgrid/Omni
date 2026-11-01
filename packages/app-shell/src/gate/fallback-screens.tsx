import { unlockPersonalSession, useAuth, useAuthStore } from '@resgrid/auth';
import { Button, ButtonText, Heading, Input, InputField, Loading, Text, VStack } from '@resgrid/ui';
import React, { type ReactNode, useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { useShellTranslation } from '../i18n';
import type { ShellGateScreenProps, ShellScreens } from '../runtime/slots';

/**
 * Minimal built-in gate screens, used only until `@resgrid/features/auth-ui` registers the real ones
 * (`registerShellScreens`). They keep every variant usable and testable in the meantime: plain sign-in (no MFA/SSO),
 * onboarding continue, maintenance notice, personal unlock, shared-lock notice and the app-access denial.
 */
function GateFrame({ testID, appName, title, children }: { testID: string; appName: string; title?: string; children?: ReactNode }) {
  return (
    <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" testID={testID}>
      <VStack space="lg" className="w-full max-w-md self-center">
        <Heading size="2xl" testID="shell-app-name">
          {appName}
        </Heading>
        {title ? <Heading size="lg">{title}</Heading> : null}
        {children}
      </VStack>
    </ScrollView>
  );
}

export function FallbackLoading({ appName }: ShellGateScreenProps) {
  const { t } = useShellTranslation();
  return (
    <View style={styles.center} testID="shell-gate-loading">
      <Loading text={t('shell.starting', { appName })} />
    </View>
  );
}

export function FallbackLogin({ appName }: ShellGateScreenProps) {
  const { t } = useShellTranslation();
  const { login, status } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const busy = status === 'loading';

  const submit = useCallback(() => {
    if (busy || !username.trim() || !password) {
      return;
    }
    void login({ username: username.trim(), password });
  }, [busy, login, password, username]);

  return (
    <GateFrame testID="shell-gate-login" appName={appName} title={t('shell.gate.login_title')}>
      <Input>
        <InputField value={username} onChangeText={setUsername} placeholder={t('shell.gate.username')} autoCapitalize="none" autoCorrect={false} textContentType="username" testID="shell-login-username" />
      </Input>
      <Input>
        <InputField value={password} onChangeText={setPassword} placeholder={t('shell.gate.password')} secureTextEntry textContentType="password" onSubmitEditing={submit} testID="shell-login-password" />
      </Input>
      {status === 'error' ? <Text className="text-error-600">{t('shell.gate.login_failed')}</Text> : null}
      {status === 'mfaRequired' ? <Text className="text-warning-700">{t('shell.gate.mfa_unsupported')}</Text> : null}
      <Button onPress={submit} isDisabled={busy} testID="shell-login-submit">
        <ButtonText>{t('shell.gate.sign_in')}</ButtonText>
      </Button>
    </GateFrame>
  );
}

export function FallbackOnboarding({ appName, onComplete }: ShellGateScreenProps) {
  const { t } = useShellTranslation();
  return (
    <GateFrame testID="shell-gate-onboarding" appName={appName} title={t('shell.gate.onboarding_title', { appName })}>
      <Text>{t('shell.gate.onboarding_message')}</Text>
      <Button onPress={onComplete} testID="shell-onboarding-continue">
        <ButtonText>{t('shell.gate.onboarding_continue')}</ButtonText>
      </Button>
    </GateFrame>
  );
}

export function FallbackMaintenance({ appName }: ShellGateScreenProps) {
  const { tk } = useShellTranslation();
  return (
    <GateFrame testID="shell-gate-maintenance" appName={appName} title={tk('maintenance.title', 'Site is Under Maintenance')}>
      <Text>{tk('maintenance.message', 'Please check back in sometime.')}</Text>
    </GateFrame>
  );
}

const signOut = (): void => {
  void useAuthStore.getState().logout();
};

export function FallbackPersonalLock({ appName }: ShellGateScreenProps) {
  const { t } = useShellTranslation();
  const [password, setPassword] = useState('');
  const [problem, setProblem] = useState<'wrong_password' | 'no_verifier' | null>(null);
  const [busy, setBusy] = useState(false);

  const unlock = useCallback(async () => {
    if (!password || busy) {
      return;
    }
    setBusy(true);
    try {
      const result = await unlockPersonalSession(password);
      setProblem(result === 'unlocked' ? null : result);
      if (result === 'unlocked') {
        setPassword('');
      }
    } finally {
      setBusy(false);
    }
  }, [busy, password]);

  return (
    <GateFrame testID="shell-gate-personal-lock" appName={appName} title={t('shell.gate.personal_lock_title', { appName })}>
      <Text>{t('shell.gate.personal_lock_message')}</Text>
      {problem === 'no_verifier' ? (
        <Text className="text-warning-700">{t('shell.gate.unlock_unavailable')}</Text>
      ) : (
        <Input>
          <InputField value={password} onChangeText={setPassword} placeholder={t('shell.gate.password')} secureTextEntry onSubmitEditing={() => void unlock()} testID="shell-unlock-password" />
        </Input>
      )}
      {problem === 'wrong_password' ? <Text className="text-error-600">{t('shell.gate.unlock_failed')}</Text> : null}
      {problem === 'no_verifier' ? null : (
        <Button onPress={() => void unlock()} isDisabled={busy} testID="shell-unlock-submit">
          <ButtonText>{t('shell.gate.unlock')}</ButtonText>
        </Button>
      )}
      <Button variant="outline" onPress={signOut} testID="shell-gate-sign-out">
        <ButtonText>{t('shell.sign_out')}</ButtonText>
      </Button>
    </GateFrame>
  );
}

export function FallbackSharedDeviceLock({ appName }: ShellGateScreenProps) {
  const { t } = useShellTranslation();
  return (
    <GateFrame testID="shell-gate-shared-lock" appName={appName} title={t('shell.gate.shared_lock_title')}>
      <Text>{t('shell.gate.shared_lock_message')}</Text>
      <Button variant="outline" onPress={signOut} testID="shell-gate-sign-out">
        <ButtonText>{t('shell.sign_out')}</ButtonText>
      </Button>
    </GateFrame>
  );
}

export function FallbackAccessDenied({ appName, onComplete }: ShellGateScreenProps) {
  const { t } = useShellTranslation();
  return (
    <GateFrame testID="shell-gate-access-denied" appName={appName} title={t('shell.gate.access_denied_title', { appName })}>
      <Text>{t('shell.gate.access_denied_message')}</Text>
      <Button onPress={onComplete} testID="shell-access-denied-continue">
        <ButtonText>{t('shell.gate.back_to_sign_in')}</ButtonText>
      </Button>
    </GateFrame>
  );
}

export const FALLBACK_SCREENS: ShellScreens = {
  Loading: FallbackLoading,
  Login: FallbackLogin,
  Onboarding: FallbackOnboarding,
  Maintenance: FallbackMaintenance,
  PersonalLock: FallbackPersonalLock,
  SharedDeviceLock: FallbackSharedDeviceLock,
  AccessDenied: FallbackAccessDenied,
};

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
