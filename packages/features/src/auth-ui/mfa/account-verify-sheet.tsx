import {
  beginSsoReauthentication,
  getPasskeyAssertion,
  getStepUpOptions,
  isPasskeyCeremonyError,
  passkeysSupported,
  reauthenticateWithPassword,
  redeemSsoReauthentication,
  runSsoRoundTrip,
  type StepUpOptionsData,
  toMfaProblem,
  verifyAccountStepUp,
} from '@resgrid/auth';
import { useCapability } from '@resgrid/config';
import { useTranslation } from '@resgrid/i18n';
import { Button, ButtonSpinner, ButtonText, CustomBottomSheet, Heading, Input, InputField, Text, VStack } from '@resgrid/ui';
import React, { useCallback, useEffect, useState } from 'react';

import { InlineError } from '../components/inline-error';
import { authUiApi } from '../lib/api-context';
import { mfaErrorText } from '../lib/auth-errors';

/** What the server asked for before a change: the first factor again, or a fresh second factor for account security. */
export type AccountProof = 'reauthenticate' | 'step_up';

const STEP_UP_OPERATION = 'account_security';

const refusal = (code: string): Error => Object.assign(new Error(code), { response: { status: 400, data: { type: code } } });

/**
 * The fresh proof the server asks for before a sign-in method changes (passkey plan sections 6.2 and 7.6 row 14; Responder):
 * the password (or the department's identity provider, for a member who signs in there), or a code or passkey for this app.
 * Never approval or the provider's MFA for account changes. Secrets live only in local state.
 */
export const AccountVerifySheet: React.FC<{ proof: AccountProof | null; onDone: (verified: boolean) => void }> = ({ proof, onDone }) => {
  const { t } = useTranslation();
  const auth = useCapability('auth');
  const [secret, setSecret] = useState('');
  const [busy, setBusy] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [useProvider, setUseProvider] = useState(false);
  const [options, setOptions] = useState<StepUpOptionsData | null>(null);

  useEffect(() => {
    setSecret('');
    setErrorCode(null);
    setUseProvider(false);
    setOptions(null);
    if (proof === 'step_up') {
      void getStepUpOptions(authUiApi(), STEP_UP_OPERATION)
        .then(setOptions)
        .catch((error: unknown) => setErrorCode(toMfaProblem(error).code));
    }
  }, [proof]);

  const attempt = useCallback(
    async (action: () => Promise<unknown>) => {
      setBusy(true);
      setErrorCode(null);
      try {
        await action();
        onDone(true);
      } catch (error) {
        const code = isPasskeyCeremonyError(error) ? `passkey_${error.reason}` : toMfaProblem(error).code;
        if (code === 'sso_reauthentication_required') {
          setUseProvider(true);
        }
        setErrorCode(code);
      } finally {
        setSecret('');
        setBusy(false);
      }
    },
    [onDone]
  );

  const submitPassword = () => void attempt(() => reauthenticateWithPassword(authUiApi(), secret));

  const submitProvider = () =>
    void attempt(async () => {
      const trip = await runSsoRoundTrip((secrets) => beginSsoReauthentication(authUiApi(), secrets));
      if (!trip.ok) {
        throw refusal(trip.code ?? `sso_${trip.reason}`);
      }
      await redeemSsoReauthentication(authUiApi(), trip.trip.ssoTransactionId, trip.trip.ssoCode, trip.trip.codeVerifier);
    });

  const submitCode = () => void attempt(() => verifyAccountStepUp(authUiApi(), { Operation: STEP_UP_OPERATION, Method: 'totp', Code: secret.trim() }));

  const submitPasskey = () =>
    void attempt(async () => {
      // The ceremony the options started answers one attempt: whatever the outcome, a retry asks for a fresh one.
      const started = options?.Passkey ?? null;
      if (started) {
        setOptions((current) => (current ? { ...current, Passkey: null } : current));
      }
      const ceremony = started ?? (await getStepUpOptions(authUiApi(), STEP_UP_OPERATION)).Passkey;
      if (!ceremony) {
        throw refusal('passkeys_unavailable');
      }
      const credential = await getPasskeyAssertion(ceremony.Options);
      await verifyAccountStepUp(authUiApi(), { Operation: STEP_UP_OPERATION, Method: 'passkey', RequestId: ceremony.RequestId, Credential: credential });
    });

  const reauth = proof === 'reauthenticate';
  const offersCode = !reauth && (options?.Methods ?? ['totp']).includes('totp');
  const offersPasskey = !reauth && (options?.Methods ?? []).includes('passkey') && auth.passkeys && passkeysSupported();
  const showsSecret = (reauth && !useProvider) || offersCode;
  const secretLabel = reauth ? t('mfa.account.password_placeholder') : t('mfa.login.code_placeholder');

  return (
    <CustomBottomSheet isOpen={proof !== null} onClose={() => onDone(false)} snapPoints={[60]} testID="account-verify-sheet">
      <VStack space="md" className="w-full">
        <Heading size="md" accessibilityRole="header">
          {reauth ? t('mfa.account.reauth_title') : t('mfa.account.step_up_title')}
        </Heading>
        <Text size="sm">{reauth ? (useProvider ? t('mfa.account.reauth_provider_body') : t('mfa.account.reauth_body')) : t('mfa.account.step_up_body')}</Text>
        {showsSecret ? (
          <Input variant="outline" size="lg" isDisabled={busy}>
            <InputField
              testID="account-verify-secret"
              value={secret}
              onChangeText={setSecret}
              secureTextEntry={reauth}
              keyboardType={reauth ? 'default' : 'number-pad'}
              autoCapitalize="none"
              autoComplete={reauth ? 'current-password' : 'one-time-code'}
              placeholder={secretLabel}
              accessibilityLabel={secretLabel}
              aria-label={secretLabel}
            />
          </Input>
        ) : null}
        {offersPasskey ? (
          <Button variant="outline" action="secondary" onPress={submitPasskey} isDisabled={busy} accessibilityLabel={t('mfa.login.use_passkey')} testID="account-verify-passkey">
            <ButtonText>{t('mfa.login.use_passkey')}</ButtonText>
          </Button>
        ) : null}
        {reauth && useProvider ? (
          <Button variant="outline" action="secondary" onPress={submitProvider} isDisabled={busy} accessibilityLabel={t('mfa.login.use_provider')} testID="account-verify-provider">
            <ButtonText>{t('mfa.login.use_provider')}</ButtonText>
          </Button>
        ) : null}
        <InlineError message={errorCode ? mfaErrorText(t, errorCode) : null} testID="account-verify-error" />
        {showsSecret ? (
          <Button action="primary" onPress={reauth ? submitPassword : submitCode} isDisabled={busy || secret.trim().length === 0} accessibilityLabel={t('mfa.login.verify')} testID="account-verify-submit">
            {busy ? <ButtonSpinner /> : <ButtonText>{t('mfa.login.verify')}</ButtonText>}
          </Button>
        ) : null}
        <Button variant="outline" action="secondary" onPress={() => onDone(false)} isDisabled={busy} accessibilityLabel={t('common.cancel')} testID="account-verify-cancel">
          <ButtonText>{t('common.cancel')}</ButtonText>
        </Button>
      </VStack>
    </CustomBottomSheet>
  );
};
