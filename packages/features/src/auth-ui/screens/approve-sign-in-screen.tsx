import { approvePendingRequest, approverEnabled, denyPendingRequest, fetchPendingApproval, parseUtc, type PendingApprovalData } from '@resgrid/auth';
import { useCapability } from '@resgrid/config';
import { useTranslation } from '@resgrid/i18n';
import { Box, Button, ButtonSpinner, ButtonText, Heading, Input, InputField, ScrollView, Spinner, Text, VStack } from '@resgrid/ui';
import { useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';

import { InlineError } from '../components/inline-error';
import { mfaErrorText } from '../lib/auth-errors';
import { goBackOr, homeHref } from '../lib/navigation';

type Phase = 'loading' | 'review' | 'approved' | 'denied' | 'none';

const APP_NAMES: Record<string, string> = { web: 'Resgrid Web', unit: 'Resgrid Unit', dispatch: 'Resgrid Dispatch', ic: 'Resgrid Command', bigboard: 'Resgrid BigBoard' };

export interface ApproveSignInScreenProps {
  /** "Done". Default: back, or the home route. */
  onDone?: () => void;
}

/**
 * Approve with Responder, as the approver (passkey plan section 7.9; `capabilities.push.approveSignIns`). The request names
 * the app, installation, department, purpose and coarse origin; the member types the number shown on the other screen and
 * confirms with this app's passkey. The number is never pushed, so only someone who can see that screen can approve.
 * "This wasn't me" ends the other sign-in and pauses requests for a while.
 */
export function ApproveSignInScreen({ onDone }: ApproveSignInScreenProps) {
  const { t } = useTranslation();
  const push = useCapability('push');
  const params = useLocalSearchParams<{ id?: string }>();
  const [phase, setPhase] = useState<Phase>('loading');
  const [request, setRequest] = useState<PendingApprovalData | null>(null);
  const [number, setNumber] = useState('');
  const [busy, setBusy] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const enabled = push.approveSignIns && approverEnabled();

  const load = useCallback(async () => {
    const pending = await fetchPendingApproval();
    setRequest(pending);
    setPhase(pending ? 'review' : 'none');
  }, []);

  useEffect(() => {
    if (!enabled) {
      setPhase('none');
      return;
    }
    void load();
  }, [enabled, load, params.id]);

  const approve = useCallback(async () => {
    if (!request) {
      return;
    }
    setBusy(true);
    setErrorCode(null);
    try {
      const result = await approvePendingRequest(request.ApprovalRequestId, number.trim());
      if (result.ok) {
        setPhase('approved');
        return;
      }
      setErrorCode(result.code);
      if (result.code === 'approval_number_mismatch') {
        // The attempts left come from the server; a request that ran out is denied there.
        await load();
      } else if (result.code === 'approval_denied' || result.code === 'approval_expired') {
        setPhase('none');
      }
    } finally {
      setNumber('');
      setBusy(false);
    }
  }, [load, number, request]);

  const deny = useCallback(
    async (reason: 'declined' | 'not_me') => {
      if (!request) {
        return;
      }
      setBusy(true);
      setErrorCode(null);
      try {
        const result = await denyPendingRequest(request.ApprovalRequestId, reason);
        if (result.ok) {
          setPhase('denied');
        } else {
          setErrorCode(result.code);
        }
      } finally {
        setBusy(false);
      }
    },
    [request]
  );

  const done = useCallback(() => (onDone ? onDone() : goBackOr(homeHref())), [onDone]);
  const expiresAt = parseUtc(request?.ExpiresAt);
  const errorText = errorCode === 'approval_number_mismatch' && request ? t('mfa.approve.number_mismatch', { count: request.AttemptsRemaining }) : errorCode ? mfaErrorText(t, errorCode) : null;

  return (
    <ScrollView className="flex-1 bg-background-0" contentContainerStyle={{ padding: 24 }} keyboardShouldPersistTaps="handled" testID="approve-sign-in-screen">
      <VStack space="md" className="w-full max-w-lg self-center">
        <Heading size="lg" accessibilityRole="header">
          {t('mfa.approve.title')}
        </Heading>

        {phase === 'loading' ? <Spinner size="large" /> : null}

        {phase === 'review' && request ? (
          <>
            <Box className="rounded-lg bg-background-50 p-4" testID="approve-details">
              <VStack space="xs">
                <Text className="font-semibold">{t(`mfa.approve.purpose.${request.Purpose}`)}</Text>
                <Text size="sm">{t('mfa.approve.app', { app: (request.RequestingApp ? APP_NAMES[request.RequestingApp] : undefined) ?? t('mfa.approve.unknown_app') })}</Text>
                {request.InstallationLabel ? <Text size="sm">{t('mfa.approve.installation', { label: request.InstallationLabel })}</Text> : null}
                {request.Shared ? <Text size="sm">{t('mfa.approve.shared')}</Text> : null}
                {request.Department ? <Text size="sm">{t('mfa.approve.department', { department: request.Department })}</Text> : null}
                {request.OriginRegion ? <Text size="sm">{t('mfa.approve.origin', { origin: request.OriginRegion })}</Text> : null}
                {expiresAt ? <Text size="sm">{t('mfa.approve.expires', { time: new Date(expiresAt).toLocaleTimeString() })}</Text> : null}
              </VStack>
            </Box>
            <Text size="sm">{t('mfa.approve.number_body')}</Text>
            <Input variant="outline" size="lg" isDisabled={busy}>
              <InputField
                testID="approve-number"
                value={number}
                onChangeText={setNumber}
                placeholder={t('mfa.approve.number_placeholder')}
                keyboardType="number-pad"
                maxLength={2}
                accessibilityLabel={t('mfa.approve.number_placeholder')}
                aria-label={t('mfa.approve.number_placeholder')}
              />
            </Input>
            <Button action="primary" onPress={() => void approve()} isDisabled={busy || number.trim().length !== 2} accessibilityLabel={t('mfa.approve.approve')} testID="approve-confirm">
              {busy ? <ButtonSpinner /> : <ButtonText>{t('mfa.approve.approve')}</ButtonText>}
            </Button>
            <Button variant="outline" action="secondary" onPress={() => void deny('declined')} isDisabled={busy} accessibilityLabel={t('mfa.approve.deny')} testID="approve-deny">
              <ButtonText>{t('mfa.approve.deny')}</ButtonText>
            </Button>
            <Button variant="outline" action="negative" onPress={() => void deny('not_me')} isDisabled={busy} accessibilityLabel={t('mfa.approve.not_me')} testID="approve-not-me">
              <ButtonText>{t('mfa.approve.not_me')}</ButtonText>
            </Button>
          </>
        ) : null}

        {phase === 'approved' ? <Text testID="approve-approved">{t('mfa.approve.approved')}</Text> : null}
        {phase === 'denied' ? <Text testID="approve-denied">{t('mfa.approve.denied')}</Text> : null}
        {phase === 'none' ? <Text testID="approve-none">{t('mfa.approve.none')}</Text> : null}

        <InlineError message={errorText} testID="approve-error" />

        {phase !== 'review' && phase !== 'loading' ? (
          <Button action="primary" onPress={done} accessibilityLabel={t('mfa.approve.done')} testID="approve-done">
            <ButtonText>{t('mfa.approve.done')}</ButtonText>
          </Button>
        ) : null}
      </VStack>
    </ScrollView>
  );
}

export default ApproveSignInScreen;
