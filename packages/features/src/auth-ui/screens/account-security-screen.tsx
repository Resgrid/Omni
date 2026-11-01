import {
  type AccountMethodsData,
  completePasskeyRegistration,
  createPasskeyCredential,
  getAccountMethods,
  getPasskeyRegistrationOptions,
  isPasskeyCeremonyError,
  parseUtc,
  type PasskeyData,
  passkeysSupported,
  renamePasskey,
  reportActivity,
  revokePasskey,
  setPasskeyApproval,
  stopApprovalInstallations,
  toMfaProblem,
  useAuthStore,
} from '@resgrid/auth';
import { useActiveVariant, useCapability } from '@resgrid/config';
import { useTranslation } from '@resgrid/i18n';
import { Box, Button, ButtonSpinner, ButtonText, Heading, HStack, Input, InputField, RefreshControl, ScrollView, Spinner, Switch, Text, VStack } from '@resgrid/ui';
import React, { useCallback, useEffect, useRef, useState } from 'react';

import { InlineError } from '../components/inline-error';
import { authUiApi } from '../lib/api-context';
import { mfaErrorText } from '../lib/auth-errors';
import { type AccountProof, AccountVerifySheet } from '../mfa/account-verify-sheet';

const APP_NAMES: Record<string, string> = { web: 'Resgrid Web', responder: 'Resgrid Responder', unit: 'Resgrid Unit', dispatch: 'Resgrid Dispatch', ic: 'Resgrid Command', bigboard: 'Resgrid BigBoard' };

/** A change, and at most two retries after the proof the server asks for. */
const MAX_ROUNDS = 3;

const when = (value: string | null | undefined): string => {
  const parsed = parseUtc(value);
  return parsed ? new Date(parsed).toLocaleString() : '';
};

/**
 * Sign-in and security (passkey plan section 6.5; Responder, now every variant with `capabilities.auth.mfa`): the
 * authenticator app and recovery codes left, passkeys for this app (add, rename, remove, approvals) and where the others
 * are, the Responder installations that approve sign-ins, linked organization sign-in, and 30 days of verifications with
 * "This wasn't me". Every change asks for the proof the server requires first. Authenticator enrolment and turning it off
 * stay on Resgrid web (the account API has no endpoint for them).
 */
export function AccountSecurityScreen() {
  const { t } = useTranslation();
  const auth = useCapability('auth');
  const variant = useActiveVariant();
  const [methods, setMethods] = useState<AccountMethodsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [proof, setProof] = useState<AccountProof | null>(null);
  const proofResult = useRef<((verified: boolean) => void) | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setMethods(await getAccountMethods(authUiApi()));
      setErrorCode(null);
    } catch (error) {
      setErrorCode(toMfaProblem(error).code);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const prove = useCallback(
    (kind: AccountProof) =>
      new Promise<boolean>((resolve) => {
        proofResult.current = resolve;
        setProof(kind);
      }),
    []
  );

  const onProofDone = useCallback((verified: boolean) => {
    setProof(null);
    proofResult.current?.(verified);
    proofResult.current = null;
  }, []);

  /** Runs a change; when the server asks for fresh proof first, asks for it and tries again (at most twice). */
  const change = useCallback(
    async (action: () => Promise<unknown>, done?: string) => {
      setBusy(true);
      setErrorCode(null);
      setNotice(null);
      try {
        for (let round = 0; round < MAX_ROUNDS; round++) {
          try {
            const result = await action();
            if ((result as { CurrentSessionEnded?: boolean; SessionEnded?: boolean } | undefined)?.CurrentSessionEnded) {
              await useAuthStore.getState().logout('Sign-in methods changed');
              return;
            }
            if (done) {
              setNotice(done);
            }
            await load();
            return;
          } catch (error) {
            if (isPasskeyCeremonyError(error)) {
              setErrorCode(`passkey_${error.reason}`);
              return;
            }
            const code = toMfaProblem(error).code;
            const needed: AccountProof | null = code === 'reauthentication_required' ? 'reauthenticate' : code === 'step_up_required' ? 'step_up' : null;
            // No retry is left after the last round, so asking for proof again would verify the member for nothing.
            if (!needed || round === MAX_ROUNDS - 1) {
              setErrorCode(code);
              return;
            }
            if (!(await prove(needed))) {
              return;
            }
          }
        }
      } finally {
        setBusy(false);
      }
    },
    [load, prove]
  );

  const addPasskey = () =>
    void change(async () => {
      const ceremony = await getPasskeyRegistrationOptions(authUiApi());
      const credential = await createPasskeyCredential(ceremony.Options);
      return completePasskeyRegistration(authUiApi(), ceremony.RequestId, credential, '');
    }, t('mfa.account.passkey_added'));

  const ownClient = methods?.CurrentClient ?? variant.identity.clientId;
  const ownGroup = methods?.PasskeyGroups.find((group) => group.Client === ownClient);
  const otherGroups = (methods?.PasskeyGroups ?? []).filter((group) => group !== ownGroup && group.Passkeys.length > 0);
  const canAddPasskey = !!ownGroup?.RegistrationAvailable && auth.passkeys && passkeysSupported();

  const renderPasskey = (passkey: PasskeyData) => (
    <Box key={passkey.PasskeyId} className="rounded-lg border border-outline-200 p-3" testID={`passkey-${passkey.PasskeyId}`}>
      <VStack space="xs">
        <Text className="font-semibold">{passkey.DisplayName}</Text>
        <Text size="sm">{t('mfa.account.passkey_created', { time: when(passkey.CreatedOn) })}</Text>
        {passkey.LastUsedOn ? <Text size="sm">{t('mfa.account.passkey_last_used', { time: when(passkey.LastUsedOn) })}</Text> : null}
        {passkey.ApprovalEnabled !== null ? (
          <HStack space="sm" className="items-center">
            <Switch
              value={!!passkey.ApprovalEnabled}
              onValueChange={(enabled) => void change(() => setPasskeyApproval(authUiApi(), passkey.PasskeyId, enabled))}
              disabled={busy}
              accessibilityLabel={t('mfa.account.passkey_approves')}
              testID={`passkey-approval-${passkey.PasskeyId}`}
            />
            <Text size="sm">{t('mfa.account.passkey_approves')}</Text>
          </HStack>
        ) : null}
        <HStack space="sm">
          <Button
            size="xs"
            variant="outline"
            action="secondary"
            isDisabled={busy}
            onPress={() => setRenaming({ id: passkey.PasskeyId, name: passkey.DisplayName })}
            accessibilityLabel={t('mfa.account.rename')}
            testID={`passkey-rename-${passkey.PasskeyId}`}
          >
            <ButtonText>{t('mfa.account.rename')}</ButtonText>
          </Button>
          <Button
            size="xs"
            variant="outline"
            action="negative"
            isDisabled={busy}
            onPress={() => void change(() => revokePasskey(authUiApi(), passkey.PasskeyId), t('mfa.account.passkey_removed'))}
            accessibilityLabel={t('mfa.account.remove')}
            testID={`passkey-remove-${passkey.PasskeyId}`}
          >
            <ButtonText>{t('mfa.account.remove')}</ButtonText>
          </Button>
        </HStack>
      </VStack>
    </Box>
  );

  return (
    <>
      <ScrollView className="flex-1 bg-background-0" contentContainerStyle={{ padding: 16 }} refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />} testID="account-security-screen">
        <VStack space="lg" className="w-full max-w-3xl self-center">
          <Heading size="xl" accessibilityRole="header">
            {t('mfa.account.title')}
          </Heading>
          {notice ? (
            <Text size="sm" className="text-success-600" testID="account-notice" accessibilityLiveRegion="polite">
              {notice}
            </Text>
          ) : null}
          <InlineError message={errorCode ? mfaErrorText(t, errorCode) : null} testID="account-error" />

          {methods ? (
            <>
              <VStack space="sm" testID="account-totp">
                <Heading size="md">{t('mfa.account.authenticator')}</Heading>
                <Text size="sm">{methods.Totp.Enrolled ? t('mfa.account.authenticator_on', { time: when(methods.Totp.EnrolledOn) }) : t('mfa.account.authenticator_off')}</Text>
                {methods.Totp.Enrolled ? (
                  <Text size="sm" className={methods.Totp.RecoveryCodeWarning ? 'text-warning-600' : ''} testID="account-recovery-codes">
                    {t('mfa.account.recovery_codes_left', { count: methods.Totp.RecoveryCodesRemaining })}
                  </Text>
                ) : null}
              </VStack>

              {auth.passkeys ? (
                <VStack space="sm" testID="account-passkeys">
                  <Heading size="md">{t('mfa.account.passkeys_here')}</Heading>
                  {ownGroup && ownGroup.Passkeys.length > 0 ? ownGroup.Passkeys.map(renderPasskey) : <Text size="sm">{t('mfa.account.no_passkeys')}</Text>}
                  {canAddPasskey ? (
                    <Button action="primary" onPress={addPasskey} isDisabled={busy} accessibilityLabel={t('mfa.account.add_passkey')} testID="account-add-passkey">
                      {busy ? <ButtonSpinner /> : <ButtonText>{t('mfa.account.add_passkey')}</ButtonText>}
                    </Button>
                  ) : null}
                  {otherGroups.map((group) => (
                    <Text key={group.Client} size="sm" testID={`account-passkeys-${group.Client}`}>
                      {t('mfa.account.passkeys_elsewhere', { app: APP_NAMES[group.Client] ?? group.Client, count: group.Passkeys.length })}
                    </Text>
                  ))}
                </VStack>
              ) : null}

              {methods.ApprovalInstallations.length > 0 ? (
                <VStack space="sm" testID="account-approvals">
                  <Heading size="md">{t('mfa.account.approvals')}</Heading>
                  {methods.ApprovalInstallations.map((installation) => (
                    <HStack key={installation.InstallationId} space="sm" className="items-center justify-between">
                      <VStack className="flex-1">
                        <Text size="sm" className="font-semibold">
                          {installation.Label ?? installation.Platform ?? t('mfa.account.this_device')}
                          {installation.IsCurrent ? ` · ${t('mfa.account.this_device')}` : ''}
                        </Text>
                        <Text size="sm">{installation.ApprovalsOn ? t('mfa.account.approvals_on') : t('mfa.account.approvals_off')}</Text>
                      </VStack>
                      {installation.ApprovalsOn ? (
                        <Button
                          size="xs"
                          variant="outline"
                          action="negative"
                          isDisabled={busy}
                          onPress={() => void change(() => stopApprovalInstallations(authUiApi(), installation.InstallationId))}
                          accessibilityLabel={t('mfa.account.stop_approvals')}
                          testID={`approval-stop-${installation.InstallationId}`}
                        >
                          <ButtonText>{t('mfa.account.stop_approvals')}</ButtonText>
                        </Button>
                      ) : null}
                    </HStack>
                  ))}
                </VStack>
              ) : null}

              {methods.LinkedIdentities.length > 0 ? (
                <VStack space="sm" testID="account-linked">
                  <Heading size="md">{t('mfa.account.linked')}</Heading>
                  {methods.LinkedIdentities.map((link) => (
                    <Text key={link.DepartmentId} size="sm">
                      {link.DepartmentName ?? String(link.DepartmentId)}
                      {link.AcceptsProviderStepUp ? ` · ${t('mfa.account.linked_step_up')}` : ''}
                    </Text>
                  ))}
                </VStack>
              ) : null}

              <VStack space="sm" testID="account-activity">
                <Heading size="md">{t('mfa.account.activity')}</Heading>
                {methods.RecentActivity.length === 0 ? <Text size="sm">{t('mfa.account.no_activity')}</Text> : null}
                {methods.RecentActivity.map((activity) => (
                  <HStack key={activity.ActivityId} space="sm" className="items-center justify-between">
                    <VStack className="flex-1">
                      <Text size="sm" className="font-semibold">
                        {t(`mfa.account.activity_${activity.Successful ? 'ok' : 'failed'}`, {
                          method: t(`mfa.methods.${activity.Method}`, { defaultValue: activity.Method }),
                          app: (activity.Client ? APP_NAMES[activity.Client] : undefined) ?? '',
                        })}
                      </Text>
                      <Text size="sm">{when(activity.OccurredOn)}</Text>
                    </VStack>
                    {activity.Successful && !activity.ReportedOn ? (
                      <Button
                        size="xs"
                        variant="outline"
                        action="negative"
                        isDisabled={busy}
                        onPress={() => void change(() => reportActivity(authUiApi(), activity.ActivityId), t('mfa.account.reported'))}
                        accessibilityLabel={t('mfa.account.not_me')}
                        testID={`activity-report-${activity.ActivityId}`}
                      >
                        <ButtonText>{t('mfa.account.not_me')}</ButtonText>
                      </Button>
                    ) : null}
                  </HStack>
                ))}
              </VStack>
            </>
          ) : loading ? (
            <Spinner size="large" />
          ) : null}

          {renaming ? (
            <VStack space="sm" testID="account-rename">
              <Input variant="outline" size="md" isDisabled={busy}>
                <InputField
                  value={renaming.name}
                  onChangeText={(name) => setRenaming({ ...renaming, name })}
                  maxLength={100}
                  accessibilityLabel={t('mfa.account.rename')}
                  aria-label={t('mfa.account.rename')}
                  testID="account-rename-input"
                />
              </Input>
              <HStack space="sm">
                <Button size="sm" variant="outline" action="secondary" onPress={() => setRenaming(null)} accessibilityLabel={t('common.cancel')}>
                  <ButtonText>{t('common.cancel')}</ButtonText>
                </Button>
                <Button
                  size="sm"
                  action="primary"
                  isDisabled={busy || renaming.name.trim().length === 0}
                  onPress={() => {
                    const { id, name } = renaming;
                    setRenaming(null);
                    void change(() => renamePasskey(authUiApi(), id, name.trim()));
                  }}
                  accessibilityLabel={t('mfa.account.save')}
                  testID="account-rename-save"
                >
                  <ButtonText>{t('mfa.account.save')}</ButtonText>
                </Button>
              </HStack>
            </VStack>
          ) : null}
        </VStack>
      </ScrollView>
      <AccountVerifySheet proof={proof} onDone={onProofDone} />
    </>
  );
}

export default AccountSecurityScreen;
