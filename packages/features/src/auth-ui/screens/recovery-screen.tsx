import { abandonFactorRecovery, finishFactorRecovery, hasLoginTransaction, type PasskeyData, recoveryReplacementKey, type TotpSetupData, useAuthStore } from '@resgrid/auth';
import { useTranslation } from '@resgrid/i18n';
import { Button, ButtonSpinner, ButtonText, Checkbox, CheckboxIndicator, CheckboxLabel, Heading, Input, InputField, Spinner, Text, VStack } from '@resgrid/ui';
import * as Linking from 'expo-linking';
import React, { useCallback, useEffect, useState } from 'react';

import { AuthLayout } from '../components/auth-layout';
import { InlineError } from '../components/inline-error';
import { mfaErrorText } from '../lib/auth-errors';
import { replaceRoute } from '../lib/navigation';
import { RecoveryCodes } from '../mfa/recovery-codes';
import { authRoutes } from '../routes';

type Step = 'code' | 'replace' | 'done' | 'help';

/**
 * "I lost my authenticator" (passkey plan sections 5.4 and 6.3; identical in R/U/I/D). A recovery code, after the password
 * or single sign-on, opens a restricted recovery: a new authenticator is staged and activated only when a code from it
 * verifies, lost passkeys can be removed, and every session ends. Without a recovery code it says who can help; nothing
 * here waives MFA.
 */
export const FactorRecovery: React.FC<{ onFinished: () => void }> = ({ onFinished }) => {
  const { t } = useTranslation();
  const [step, setStep] = useState<Step>(() => (hasLoginTransaction() ? 'code' : 'help'));
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [passkeys, setPasskeys] = useState<PasskeyData[]>([]);
  const [remove, setRemove] = useState<string[]>([]);
  const [key, setKey] = useState<TotpSetupData | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);

  useEffect(() => {
    if (step !== 'replace' || key) {
      return;
    }
    let cancelled = false;
    void recoveryReplacementKey().then((result) => (cancelled ? undefined : 'SharedKey' in result ? setKey(result) : setErrorCode(result.code)));
    return () => {
      cancelled = true;
    };
  }, [step, key]);

  const begin = useCallback(async () => {
    setBusy(true);
    setErrorCode(null);
    try {
      const started = await useAuthStore.getState().beginFactorRecovery(code);
      if ('passkeys' in started) {
        setPasskeys(started.passkeys);
        setStep('replace');
      } else {
        setErrorCode(started.code);
        if (started.restart) {
          setStep('help');
        }
      }
    } catch {
      setErrorCode('unknown_error');
    } finally {
      setCode('');
      setBusy(false);
    }
  }, [code]);

  const finish = useCallback(async () => {
    setBusy(true);
    setErrorCode(null);
    try {
      const done = await finishFactorRecovery(code, remove);
      if ('recoveryCodes' in done) {
        setRecoveryCodes(done.recoveryCodes);
        setStep('done');
      } else {
        setErrorCode(done.code);
        if (done.ended) {
          setStep('help');
        }
      }
    } catch {
      setErrorCode('unknown_error');
    } finally {
      setCode('');
      setBusy(false);
    }
  }, [code, remove]);

  const cancel = useCallback(async () => {
    await abandonFactorRecovery();
    onFinished();
  }, [onFinished]);

  const togglePasskey = (id: string) => setRemove((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));

  return (
    <VStack space="md" className="w-full" testID="factor-recovery">
      <Heading size="lg" accessibilityRole="header">
        {t('mfa.recovery.title')}
      </Heading>

      {step === 'code' ? (
        <>
          <Text size="sm">{t('mfa.recovery.code_body')}</Text>
          <Input variant="outline" size="lg" isDisabled={busy}>
            <InputField
              testID="recovery-code-input"
              value={code}
              onChangeText={setCode}
              placeholder={t('mfa.login.recovery_placeholder')}
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel={t('mfa.login.recovery_placeholder')}
              aria-label={t('mfa.login.recovery_placeholder')}
            />
          </Input>
          <Button action="primary" onPress={() => void begin()} isDisabled={busy || code.trim().length === 0} accessibilityLabel={t('mfa.recovery.begin')} testID="recovery-begin">
            {busy ? <ButtonSpinner /> : <ButtonText>{t('mfa.recovery.begin')}</ButtonText>}
          </Button>
          <Button variant="link" action="secondary" onPress={() => setStep('help')} accessibilityLabel={t('mfa.recovery.no_code')} testID="recovery-no-code">
            <ButtonText>{t('mfa.recovery.no_code')}</ButtonText>
          </Button>
        </>
      ) : null}

      {step === 'replace' ? (
        <>
          <Text size="sm">{t('mfa.recovery.replace_body')}</Text>
          {key ? (
            <VStack space="sm">
              <Text selectable className="font-mono text-lg" testID="recovery-shared-key">
                {key.SharedKey}
              </Text>
              <Button variant="outline" action="secondary" size="sm" onPress={() => void Linking.openURL(key.AuthenticatorUri)} accessibilityLabel={t('mfa.setup.open_app')}>
                <ButtonText>{t('mfa.setup.open_app')}</ButtonText>
              </Button>
            </VStack>
          ) : (
            <Spinner size="small" />
          )}
          {passkeys.length > 0 ? (
            <VStack space="xs" testID="recovery-passkeys">
              <Text size="sm" className="font-semibold">
                {t('mfa.recovery.remove_passkeys')}
              </Text>
              {passkeys.map((passkey) => (
                <Checkbox
                  key={passkey.PasskeyId}
                  value={passkey.PasskeyId}
                  isChecked={remove.includes(passkey.PasskeyId)}
                  onChange={() => togglePasskey(passkey.PasskeyId)}
                  aria-label={passkey.DisplayName}
                  testID={`recovery-passkey-${passkey.PasskeyId}`}
                >
                  <CheckboxIndicator />
                  <CheckboxLabel>{passkey.DisplayName}</CheckboxLabel>
                </Checkbox>
              ))}
            </VStack>
          ) : null}
          <Input variant="outline" size="lg" isDisabled={busy}>
            <InputField
              testID="recovery-new-code"
              value={code}
              onChangeText={setCode}
              placeholder={t('mfa.login.code_placeholder')}
              keyboardType="number-pad"
              maxLength={8}
              autoComplete="one-time-code"
              textContentType="oneTimeCode"
              accessibilityLabel={t('mfa.login.code_placeholder')}
              aria-label={t('mfa.login.code_placeholder')}
            />
          </Input>
          <Button action="primary" onPress={() => void finish()} isDisabled={busy || !key || code.trim().length === 0} accessibilityLabel={t('mfa.recovery.finish')} testID="recovery-finish">
            {busy ? <ButtonSpinner /> : <ButtonText>{t('mfa.recovery.finish')}</ButtonText>}
          </Button>
          <Button variant="outline" action="secondary" onPress={() => void cancel()} isDisabled={busy} accessibilityLabel={t('mfa.recovery.cancel')} testID="recovery-cancel">
            <ButtonText>{t('mfa.recovery.cancel')}</ButtonText>
          </Button>
        </>
      ) : null}

      {step === 'done' ? (
        <>
          <Text size="sm">{t('mfa.recovery.done_body')}</Text>
          <RecoveryCodes codes={recoveryCodes} />
          <Button action="primary" onPress={onFinished} accessibilityLabel={t('mfa.recovery.sign_in')} testID="recovery-sign-in">
            <ButtonText>{t('mfa.recovery.sign_in')}</ButtonText>
          </Button>
        </>
      ) : null}

      {step === 'help' ? (
        <>
          <Text size="sm">{t('mfa.recovery.help_body')}</Text>
          <Button action="primary" onPress={onFinished} accessibilityLabel={t('mfa.recovery.back_to_sign_in')} testID="recovery-back">
            <ButtonText>{t('mfa.recovery.back_to_sign_in')}</ButtonText>
          </Button>
        </>
      ) : null}

      <InlineError message={errorCode ? mfaErrorText(t, errorCode) : null} testID="recovery-error" />
    </VStack>
  );
};

/** The `/login/recovery` route (deep links and the web); the login screen shows the same flow in place. */
export function RecoveryScreen() {
  return (
    <AuthLayout testID="recovery-screen">
      <FactorRecovery onFinished={() => replaceRoute(authRoutes.login())} />
    </AuthLayout>
  );
}

export default RecoveryScreen;
