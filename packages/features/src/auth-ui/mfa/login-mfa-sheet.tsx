import { type MfaMethod, passkeysSupported, type TotpSetupData, useAuthStore } from '@resgrid/auth';
import { useCapability } from '@resgrid/config';
import { useTranslation } from '@resgrid/i18n';
import { Button, ButtonSpinner, ButtonText, CustomBottomSheet, Heading, Input, InputField, Pressable, Text, VStack } from '@resgrid/ui';
import * as Linking from 'expo-linking';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { InlineError } from '../components/inline-error';
import { mfaErrorText } from '../lib/auth-errors';
import { ApprovalPanel } from './approval-panel';

export interface LoginMfaSheetProps {
  isOpen: boolean;
  /** "I lost my authenticator": start the restricted recovery with a recovery code. */
  onLostFactor: () => void;
}

type Mode = 'choose' | 'recovery';

/**
 * The second step of signing in on a login transaction (passkey plan section 7.5): the methods this sign-in accepts that
 * the member has, as equal choices with their last one first, plus the authenticator setup a department requires (6.2).
 * Merged from R/U/I/D: every attempt clears its spinner in `finally` (U/I/D left it spinning when a step threw), and
 * cancelling drops the transaction (`cancelLoginMfa`). Codes live only in local state; nothing here is logged or stored.
 */
export const LoginMfaSheet: React.FC<LoginMfaSheetProps> = ({ isOpen, onLostFactor }) => {
  const { t } = useTranslation();
  const auth = useCapability('auth');
  const challenge = useAuthStore((state) => state.mfaChallenge);
  const [mode, setMode] = useState<Mode>('choose');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [approval, setApproval] = useState<{ id: string; number: string } | null>(null);
  const [setup, setSetup] = useState<TotpSetupData | null>(null);
  const approvalAbort = useRef<AbortController | null>(null);

  const isSetup = challenge?.kind === 'setup';
  const methods = useMemo<MfaMethod[]>(() => {
    // The accepted methods the member has (Core Web): a server that sends no member list keeps the full one.
    const enrolled = challenge?.enrolled ?? [];
    const usable = (challenge?.methods ?? []).filter((method) => enrolled.length === 0 || enrolled.includes(method));
    const available = usable.filter((method) => method !== 'passkey' || (auth.passkeys && passkeysSupported()));
    const preferred = challenge?.preferred;
    return preferred && available.includes(preferred) ? [preferred, ...available.filter((method) => method !== preferred)] : available;
  }, [auth.passkeys, challenge]);
  const recoveryAvailable = !isSetup && (challenge?.enrolled ?? []).includes('totp');

  const stopApproval = useCallback(() => {
    approvalAbort.current?.abort();
    approvalAbort.current = null;
  }, []);

  useEffect(() => {
    if (!isOpen) {
      stopApproval();
      setMode('choose');
      setCode('');
      setErrorCode(null);
      setApproval(null);
      setSetup(null);
      setBusy(false);
    }
  }, [isOpen, stopApproval]);

  useEffect(() => stopApproval, [stopApproval]);

  // Setting up the required authenticator: a new key, activated only when a code from it verifies.
  useEffect(() => {
    if (!isOpen || !isSetup || setup) {
      return;
    }
    let cancelled = false;
    void useAuthStore
      .getState()
      .loginSetupOptions()
      .then((result) => {
        if (cancelled) {
          return;
        }
        if ('SharedKey' in result) {
          setSetup(result);
        } else {
          setErrorCode(result.code);
        }
      })
      .catch(() => (cancelled ? undefined : setErrorCode('unknown_error')));
    return () => {
      cancelled = true;
    };
  }, [isOpen, isSetup, setup]);

  const run = useCallback(async (action: () => Promise<{ ok: true } | { ok: false; code: string }>) => {
    setBusy(true);
    setErrorCode(null);
    try {
      const result = await action();
      if (!result.ok) {
        setErrorCode(result.code);
      }
    } catch {
      setErrorCode('unknown_error');
    } finally {
      setBusy(false);
    }
  }, []);

  const submitCode = useCallback(() => {
    const submitted = code.trim();
    if (submitted.length === 0) {
      return;
    }
    setCode('');
    const method = isSetup ? 'setup' : mode === 'recovery' ? 'recovery_code' : 'totp';
    void run(async () => {
      const result = await useAuthStore.getState().verifyLoginMfa({ method, code: submitted });
      return result.ok ? { ok: true } : { ok: false, code: result.code };
    });
  }, [code, isSetup, mode, run]);

  const verifyWith = useCallback(
    (method: 'passkey' | 'federated') =>
      void run(async () => {
        const result = await useAuthStore.getState().verifyLoginMfa({ method });
        return result.ok ? { ok: true } : { ok: false, code: result.code };
      }),
    [run]
  );

  const verifyWithApproval = useCallback(async () => {
    setBusy(true);
    setErrorCode(null);
    const controller = new AbortController();
    try {
      const store = useAuthStore.getState();
      const started = await store.requestLoginApproval();
      if (!('ApprovalRequestId' in started)) {
        setErrorCode(started.code);
        return;
      }
      setApproval({ id: started.ApprovalRequestId, number: started.MatchNumber });
      approvalAbort.current = controller;
      const decided = await store.waitForLoginApproval(started.ApprovalRequestId, controller.signal);
      if (decided === 'aborted') {
        return;
      }
      setApproval(null);
      if (decided !== 'approved') {
        setErrorCode(decided === 'denied' ? 'approval_denied' : decided === 'unavailable' ? 'service_unavailable' : 'approval_expired');
        return;
      }
      const result = await store.verifyLoginMfa({ method: 'passkey_approval', approvalRequestId: started.ApprovalRequestId });
      if (!result.ok) {
        setErrorCode(result.code);
      }
    } catch {
      setApproval(null);
      setErrorCode('unknown_error');
    } finally {
      if (approvalAbort.current === controller) {
        approvalAbort.current = null;
      }
      setBusy(false);
    }
  }, []);

  const cancelApproval = useCallback(() => {
    const current = approval;
    stopApproval();
    setApproval(null);
    setBusy(false);
    if (current) {
      void useAuthStore
        .getState()
        .cancelLoginApproval(current.id)
        .catch(() => undefined);
    }
  }, [approval, stopApproval]);

  const cancelSignIn = useCallback(() => {
    cancelApproval();
    useAuthStore.getState().cancelLoginMfa();
  }, [cancelApproval]);

  const showsCodeInput = isSetup ? !!setup : mode === 'recovery' || methods.includes('totp');
  const choosing = !approval && !isSetup && mode === 'choose';
  // Cancelling stays possible while waiting for an approval (it stops the wait), not while a code is being checked.
  const cancelDisabled = busy && !approval;
  const codeLabel = mode === 'recovery' ? t('mfa.login.recovery_placeholder') : t('mfa.login.code_placeholder');

  return (
    <CustomBottomSheet isOpen={isOpen} onClose={cancelSignIn} snapPoints={[75]} testID="login-mfa-sheet">
      <VStack space="md" className="w-full">
        <Heading size="md" accessibilityRole="header">
          {isSetup ? t('mfa.setup.title') : t('mfa.login.title')}
        </Heading>
        <Text size="sm">{isSetup ? t('mfa.setup.body') : mode === 'recovery' ? t('mfa.login.recovery_body') : t('mfa.login.body')}</Text>

        {isSetup && setup ? (
          <VStack space="sm" testID="mfa-setup-key">
            <Text size="sm" className="font-semibold">
              {t('mfa.setup.key_label')}
            </Text>
            <Text selectable className="font-mono text-lg" testID="mfa-setup-shared-key">
              {setup.SharedKey}
            </Text>
            <Button variant="outline" action="secondary" size="sm" onPress={() => void Linking.openURL(setup.AuthenticatorUri)} accessibilityLabel={t('mfa.setup.open_app')} testID="mfa-setup-open-app">
              <ButtonText>{t('mfa.setup.open_app')}</ButtonText>
            </Button>
          </VStack>
        ) : null}

        {approval ? <ApprovalPanel matchNumber={approval.number} onCancel={cancelApproval} /> : null}

        {!approval && showsCodeInput ? (
          <>
            <Input variant="outline" size="lg" isDisabled={busy}>
              <InputField
                testID="login-mfa-code"
                value={code}
                onChangeText={setCode}
                placeholder={codeLabel}
                keyboardType={mode === 'recovery' ? 'default' : 'number-pad'}
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={mode === 'recovery' ? 32 : 8}
                autoComplete={mode === 'recovery' ? 'off' : 'one-time-code'}
                textContentType={mode === 'recovery' ? 'none' : 'oneTimeCode'}
                onSubmitEditing={submitCode}
                accessibilityLabel={codeLabel}
                aria-label={codeLabel}
              />
            </Input>
            <Button action="primary" onPress={submitCode} isDisabled={busy || code.trim().length === 0} accessibilityLabel={t('mfa.login.verify')} testID="login-mfa-submit">
              {busy ? <ButtonSpinner /> : <ButtonText>{t('mfa.login.verify')}</ButtonText>}
            </Button>
          </>
        ) : null}

        {choosing && methods.includes('passkey') ? (
          <Button variant="outline" action="secondary" onPress={() => verifyWith('passkey')} isDisabled={busy} accessibilityLabel={t('mfa.login.use_passkey')} testID="login-mfa-passkey">
            <ButtonText>{t('mfa.login.use_passkey')}</ButtonText>
          </Button>
        ) : null}
        {choosing && methods.includes('passkey_approval') ? (
          <Button variant="outline" action="secondary" onPress={() => void verifyWithApproval()} isDisabled={busy} accessibilityLabel={t('mfa.login.use_approval')} testID="login-mfa-approval">
            <ButtonText>{t('mfa.login.use_approval')}</ButtonText>
          </Button>
        ) : null}
        {choosing && methods.includes('federated') ? (
          <Button variant="outline" action="secondary" onPress={() => verifyWith('federated')} isDisabled={busy} accessibilityLabel={t('mfa.login.use_provider')} testID="login-mfa-provider">
            <ButtonText>{t('mfa.login.use_provider')}</ButtonText>
          </Button>
        ) : null}

        <InlineError message={errorCode ? mfaErrorText(t, errorCode) : null} testID="login-mfa-error" />

        {!approval && recoveryAvailable ? (
          <Pressable onPress={() => setMode(mode === 'recovery' ? 'choose' : 'recovery')} accessibilityRole="button" testID="login-mfa-recovery-toggle">
            <Text size="sm" className="text-primary-600">
              {mode === 'recovery' ? t('mfa.login.use_other_method') : t('mfa.login.use_recovery_code')}
            </Text>
          </Pressable>
        ) : null}
        {!approval && !isSetup ? (
          <Pressable onPress={onLostFactor} accessibilityRole="button" testID="login-mfa-lost">
            <Text size="sm" className="text-primary-600">
              {t('mfa.login.lost_factor')}
            </Text>
          </Pressable>
        ) : null}

        <Button variant="outline" action="secondary" onPress={cancelSignIn} isDisabled={cancelDisabled} accessibilityLabel={t('common.cancel')} testID="login-mfa-cancel">
          <ButtonText>{t('common.cancel')}</ButtonText>
        </Button>
      </VStack>
    </CustomBottomSheet>
  );
};
