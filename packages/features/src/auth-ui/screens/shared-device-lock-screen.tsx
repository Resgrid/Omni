import {
  afterSharedUnlock,
  applySharedSessionStatus,
  beginUnlockSso,
  cancelUnlockApproval,
  completeUnlock,
  type CompleteUnlockInput,
  endSharedShift,
  getCurrentSession,
  getPasskeyAssertion,
  getUnlockApprovalStatus,
  getUnlockOptions,
  isPasskeyCeremonyError,
  lockSession,
  markSharedSessionLocked,
  passkeysSupported,
  requestUnlockApproval,
  resetSharedSession,
  runSsoRoundTrip,
  toMfaProblem,
  type UnlockOptionsData,
  useAuthStore,
  waitForApproval,
} from '@resgrid/auth';
import { useCapability } from '@resgrid/config';
import { useTranslation } from '@resgrid/i18n';
import { Box, Button, ButtonSpinner, ButtonText, Heading, Input, InputField, ScrollView, Spinner, Text, useThemeColors, VStack } from '@resgrid/ui';
import { Lock } from 'lucide-react-native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { InlineError } from '../components/inline-error';
import { authUiApi } from '../lib/api-context';
import { mfaErrorText } from '../lib/auth-errors';
import { ApprovalPanel } from '../mfa/approval-panel';

type Phase = 'loading' | 'ready' | 'unavailable';

/** A refusal with a code the server put in the problem `type` (as the auth errors read it). */
const refusal = (code: string): Error => Object.assign(new Error(code), { response: { status: 400, data: { type: code } } });

/** Passkey refusals after which the server has spent the ceremony. */
const needsNewCeremony = (problem: string): boolean => problem.startsWith('passkey_') || problem === 'challenge_consumed' || problem === 'challenge_expired';

/**
 * The shared-device lock screen (passkey plan section 10.5; Unit controller + IC store; `capabilities.auth.sharedDevice`).
 * ShellGate shows it while the server says this session is locked. The locked operator unlocks the same session with their
 * own second factor; anyone can end the shift or hand over to the next operator. It asks the server to lock first
 * (idempotent), so a lock that never reached the server cannot be skipped, and it never starts a passkey prompt by itself.
 */
export function SharedDeviceLockScreen() {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const auth = useCapability('auth');
  const [phase, setPhase] = useState<Phase>('loading');
  const [options, setOptions] = useState<UnlockOptionsData | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [approval, setApproval] = useState<{ id: string; number: string } | null>(null);
  const approvalAbort = useRef<AbortController | null>(null);

  const stopApproval = useCallback(() => {
    approvalAbort.current?.abort();
    approvalAbort.current = null;
  }, []);

  /** Refusals that mean the session itself is gone, or was never shared: nothing is left to unlock here. */
  const ended = useCallback(async (problem: string): Promise<boolean> => {
    if (problem === 'session_revoked' || problem === 'session_required') {
      await useAuthStore.getState().logout(undefined, 'shift-ended');
      return true;
    }
    if (problem === 'not_shared_session') {
      resetSharedSession();
      return true;
    }
    return false;
  }, []);

  const load = useCallback(async () => {
    stopApproval();
    setApproval(null);
    setPhase('loading');
    setCode('');
    try {
      const lock = await lockSession(authUiApi());
      markSharedSessionLocked(lock.LockVersion);
      setOptions(await getUnlockOptions(authUiApi(), lock.LockVersion));
      setPhase('ready');
    } catch (error) {
      const problem = toMfaProblem(error).code;
      if (await ended(problem)) {
        return;
      }
      setErrorCode(problem);
      setPhase('unavailable');
    }
  }, [ended, stopApproval]);

  useEffect(() => {
    setErrorCode(null);
    void load();
    return stopApproval;
  }, [load, stopApproval]);

  const unlock = useCallback(
    async (input: () => Promise<CompleteUnlockInput | null>) => {
      if (!options) {
        return;
      }
      setBusy(true);
      setErrorCode(null);
      try {
        const proof = await input();
        if (!proof) {
          return;
        }
        applySharedSessionStatus(await completeUnlock(authUiApi(), options.LockVersion, proof));
        await afterSharedUnlock();
      } catch (error) {
        const problem = isPasskeyCeremonyError(error) ? `passkey_${error.reason}` : toMfaProblem(error).code;
        if (await ended(problem)) {
          return;
        }
        setErrorCode(problem);
        if (problem === 'shared_session_lock_changed') {
          // Locked again since the options came: start over on the current lock.
          await load();
          setErrorCode(problem);
        } else if (problem === 'shared_session_not_locked') {
          // Already unlocked (a second tap that crossed the first): follow the server.
          const session = await getCurrentSession(authUiApi()).catch(() => null);
          if (session && !session.Locked) {
            applySharedSessionStatus(session);
            await afterSharedUnlock();
          } else {
            await load();
          }
        } else if (needsNewCeremony(problem)) {
          setOptions(await getUnlockOptions(authUiApi(), options.LockVersion).catch(() => options));
        }
      } finally {
        setCode('');
        setBusy(false);
      }
    },
    [ended, load, options]
  );

  const unlockWithCode = () => void unlock(async () => ({ Method: 'totp', Code: code.trim() }));

  const unlockWithPasskey = () =>
    void unlock(async () => {
      const ceremony = options?.Passkey;
      if (!ceremony) {
        throw refusal('passkeys_unavailable');
      }
      const credential = await getPasskeyAssertion(ceremony.Options);
      return { Method: 'passkey', RequestId: ceremony.RequestId, Credential: credential };
    });

  const unlockWithProvider = () =>
    void unlock(async () => {
      if (!options) {
        return null;
      }
      // Always a fresh provider sign-in on a shared device: no cookies are kept for the next operator.
      const trip = await runSsoRoundTrip((secrets) => beginUnlockSso(authUiApi(), options.LockVersion, secrets), true);
      if (!trip.ok) {
        throw refusal(trip.code ?? `sso_${trip.reason}`);
      }
      return { Method: 'federated', SsoTransactionId: trip.trip.ssoTransactionId, SsoCode: trip.trip.ssoCode, CodeVerifier: trip.trip.codeVerifier };
    });

  const unlockWithApproval = async () => {
    if (!options) {
      return;
    }
    setErrorCode(null);
    setBusy(true);
    let started: { ApprovalRequestId: string; MatchNumber: string };
    try {
      started = await requestUnlockApproval(authUiApi(), options.LockVersion);
    } catch (error) {
      setErrorCode(toMfaProblem(error).code);
      return;
    } finally {
      setBusy(false);
    }
    setApproval({ id: started.ApprovalRequestId, number: started.MatchNumber });
    const abort = new AbortController();
    approvalAbort.current = abort;
    const result = await waitForApproval(() => getUnlockApprovalStatus(authUiApi(), started.ApprovalRequestId), abort.signal);
    if (abort.signal.aborted) {
      return;
    }
    approvalAbort.current = null;
    setApproval(null);
    if (result === 'approved') {
      await unlock(async () => ({ Method: 'passkey_approval', ApprovalRequestId: started.ApprovalRequestId }));
    } else if (result === 'denied') {
      setErrorCode('approval_denied');
    } else if (result === 'canceled') {
      // The session locked again while waiting: the request belonged to the earlier lock.
      await load();
    } else {
      setErrorCode(result === 'unavailable' ? 'network_error' : 'approval_expired');
    }
  };

  const cancelApproval = () => {
    const pending = approval;
    stopApproval();
    setApproval(null);
    if (pending) {
      void cancelUnlockApproval(authUiApi(), pending.id).catch(() => undefined);
    }
  };

  const finishShift = (switchOperator: boolean) => {
    cancelApproval();
    setBusy(true);
    void endSharedShift(switchOperator).finally(() => setBusy(false));
  };

  const methods = options?.Methods ?? [];
  const offersCode = methods.includes('totp');
  const offersPasskey = methods.includes('passkey') && !!options?.Passkey && auth.passkeys && passkeysSupported();
  const offersApproval = methods.includes('passkey_approval');
  const offersProvider = methods.includes('federated');

  return (
    <ScrollView className="flex-1 bg-background-0" contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }} keyboardShouldPersistTaps="handled" testID="shared-lock-screen">
      <Box className="w-full max-w-lg self-center">
        <VStack space="md">
          <VStack space="xs" className="items-center">
            <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <Lock size={40} color={colors.icon} />
            </View>
            <Heading size="lg" className="text-center" accessibilityRole="header">
              {t('shared_session.locked_title')}
            </Heading>
            {options?.Operator ? (
              <Text className="text-center" testID="shared-lock-operator">
                {t('shared_session.locked_operator', { operator: options.Operator })}
              </Text>
            ) : null}
          </VStack>

          {phase === 'loading' ? <Spinner size="large" /> : null}

          {phase === 'ready' && !approval ? (
            <>
              <Text size="sm" className="text-center" testID={methods.length === 0 ? 'shared-lock-no-methods' : 'shared-lock-body'}>
                {methods.length === 0 ? t('shared_session.no_unlock') : t('shared_session.locked_body')}
              </Text>
              {offersCode ? (
                <>
                  <Input variant="outline" size="lg" isDisabled={busy}>
                    <InputField
                      testID="shared-lock-code"
                      value={code}
                      onChangeText={setCode}
                      keyboardType="number-pad"
                      autoComplete="one-time-code"
                      maxLength={6}
                      placeholder={t('mfa.login.code_placeholder')}
                      accessibilityLabel={t('mfa.login.code_placeholder')}
                      aria-label={t('mfa.login.code_placeholder')}
                    />
                  </Input>
                  <Button action="primary" onPress={unlockWithCode} isDisabled={busy || code.trim().length === 0} accessibilityLabel={t('shared_session.unlock')} testID="shared-lock-unlock">
                    {busy ? <ButtonSpinner /> : <ButtonText>{t('shared_session.unlock')}</ButtonText>}
                  </Button>
                </>
              ) : null}
              {offersPasskey ? (
                <Button variant="outline" action="secondary" onPress={unlockWithPasskey} isDisabled={busy} accessibilityLabel={t('mfa.login.use_passkey')} testID="shared-lock-passkey">
                  <ButtonText>{t('mfa.login.use_passkey')}</ButtonText>
                </Button>
              ) : null}
              {offersApproval ? (
                <Button variant="outline" action="secondary" onPress={() => void unlockWithApproval()} isDisabled={busy} accessibilityLabel={t('mfa.login.use_approval')} testID="shared-lock-approval">
                  <ButtonText>{t('mfa.login.use_approval')}</ButtonText>
                </Button>
              ) : null}
              {offersProvider ? (
                <Button variant="outline" action="secondary" onPress={unlockWithProvider} isDisabled={busy} accessibilityLabel={t('mfa.login.use_provider')} testID="shared-lock-provider">
                  <ButtonText>{t('mfa.login.use_provider')}</ButtonText>
                </Button>
              ) : null}
            </>
          ) : null}

          {approval ? <ApprovalPanel matchNumber={approval.number} onCancel={cancelApproval} /> : null}

          {phase === 'unavailable' ? (
            <Button variant="outline" action="secondary" onPress={() => void load()} isDisabled={busy} accessibilityLabel={t('shared_session.retry')} testID="shared-lock-retry">
              <ButtonText>{t('shared_session.retry')}</ButtonText>
            </Button>
          ) : null}

          <InlineError message={errorCode ? mfaErrorText(t, errorCode) : null} testID="shared-lock-error" className="text-center" />

          <VStack space="sm" className="mt-4">
            <Button variant="outline" action="secondary" onPress={() => finishShift(true)} isDisabled={busy} accessibilityLabel={t('shared_session.switch_operator')} testID="shared-lock-switch">
              <ButtonText>{t('shared_session.switch_operator')}</ButtonText>
            </Button>
            <Button variant="outline" action="negative" onPress={() => finishShift(false)} isDisabled={busy} accessibilityLabel={t('shared_session.end_shift')} testID="shared-lock-end-shift">
              <ButtonText>{t('shared_session.end_shift')}</ButtonText>
            </Button>
          </VStack>
        </VStack>
      </Box>
    </ScrollView>
  );
}

export default SharedDeviceLockScreen;
