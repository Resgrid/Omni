import {
  cancelStepUpApprovalRequest,
  closeStepUpPrompt,
  completeStepUpWithApproval,
  dataProtectionStore,
  loadStepUpMethods,
  mfaErrorKey,
  requestStepUpApprovalNumber,
  useIsStepUpPromptOpen,
  verifyStepUpFederated,
  verifyStepUpOtp,
  verifyStepUpWithPasskey,
  waitForStepUpApproval,
} from '@resgrid/auth';
import { useTranslation } from '@resgrid/i18n';
import { Button, ButtonText, Heading, Input, InputField, Modal, ModalBackdrop, ModalBody, ModalContent, ModalFooter, ModalHeader, Spinner, Text, VStack } from '@resgrid/ui';
import React, { useCallback, useEffect, useRef, useState } from 'react';

export interface StepUpPromptProps {
  isOpen: boolean;
  onClose: () => void;
  /** After a successful verification, before the prompt closes. */
  onVerified?: () => void;
}

const ERROR_KEYS: Record<string, string> = {
  invalid_totp: 'data_protection.step_up_invalid_code',
  mfa_not_enrolled: 'data_protection.step_up_not_enrolled',
  too_many_attempts: 'data_protection.step_up_too_many_attempts',
  grants_not_configured: 'data_protection.step_up_unavailable',
  unknown: 'data_protection.step_up_failed',
};

/**
 * The step-up prompt for protected data: authenticator code, passkey, approval from Responder or the department's
 * identity provider — whichever the member has and the department accepts. The code lives only in local state, is
 * cleared on every close and submit, and is never logged.
 */
export const StepUpPrompt: React.FC<StepUpPromptProps> = ({ isOpen, onClose, onVerified }) => {
  const { t } = useTranslation();
  const [code, setCode] = useState('');
  const [approval, setApproval] = useState<{ id: string; number: string } | null>(null);
  const approvalAbort = useRef<AbortController | null>(null);
  const isVerifying = dataProtectionStore((state) => state.isVerifying);
  const lastError = dataProtectionStore((state) => state.lastError);
  const methods = dataProtectionStore((state) => state.stepUpMethods);

  useEffect(() => {
    if (isOpen) {
      void loadStepUpMethods();
      return;
    }
    setCode('');
    approvalAbort.current?.abort();
    approvalAbort.current = null;
    setApproval(null);
  }, [isOpen]);

  const finished = useCallback(
    (ok: boolean) => {
      if (!ok) return;
      onVerified?.();
      onClose();
    },
    [onClose, onVerified]
  );

  const handleVerify = useCallback(async () => {
    const submitted = code.trim();
    if (!submitted) return;
    const ok = await verifyStepUpOtp(submitted);
    setCode('');
    finished(ok);
  }, [code, finished]);

  const handleApproval = useCallback(async () => {
    const started = await requestStepUpApprovalNumber();
    if (!started) return;
    setApproval(started);
    const controller = new AbortController();
    approvalAbort.current = controller;
    const decided = await waitForStepUpApproval(started.id, controller.signal);
    if (decided === 'aborted') return;
    setApproval(null);
    if (decided !== 'approved') {
      dataProtectionStore.setState({ lastError: decided === 'denied' ? 'approval_denied' : 'approval_expired' });
      return;
    }
    finished(await completeStepUpWithApproval(started.id));
  }, [finished]);

  const cancelApproval = useCallback(() => {
    const current = approval;
    approvalAbort.current?.abort();
    approvalAbort.current = null;
    setApproval(null);
    if (current) void cancelStepUpApprovalRequest(current.id);
  }, [approval]);

  const offersCode = methods == null || methods.includes('totp');
  const errorText = lastError ? t(ERROR_KEYS[lastError] ?? mfaErrorKey(lastError)) : null;

  return (
    // A native window (useRNModal): a reveal can start inside a bottom sheet, which is its own window above the app.
    <Modal isOpen={isOpen} onClose={onClose} useRNModal testID="step-up-prompt">
      <ModalBackdrop />
      <ModalContent>
        <ModalHeader>
          <Heading size="md">{t('data_protection.step_up_title')}</Heading>
        </ModalHeader>
        <ModalBody>
          <VStack space="md">
            <Text size="sm">{t('data_protection.step_up_body')}</Text>
            {approval ? (
              <VStack space="sm" className="items-center rounded-lg bg-background-50 p-4" testID="step-up-approval-panel">
                <Text className="text-4xl font-bold text-typography-900">{approval.number}</Text>
                <Button variant="link" onPress={cancelApproval} testID="step-up-approval-cancel">
                  <ButtonText>{t('common.cancel')}</ButtonText>
                </Button>
              </VStack>
            ) : null}
            {!approval && offersCode ? (
              <Input variant="outline" size="lg" isDisabled={isVerifying}>
                <InputField
                  testID="step-up-code-input"
                  value={code}
                  onChangeText={setCode}
                  placeholder={t('data_protection.step_up_placeholder')}
                  keyboardType="number-pad"
                  maxLength={8}
                  autoComplete="one-time-code"
                  textContentType="oneTimeCode"
                  onSubmitEditing={() => void handleVerify()}
                  accessibilityLabel={t('data_protection.step_up_placeholder')}
                />
              </Input>
            ) : null}
            {!approval && methods?.includes('passkey') ? (
              <Button variant="outline" action="secondary" onPress={async () => finished(await verifyStepUpWithPasskey())} isDisabled={isVerifying} testID="step-up-passkey">
                <ButtonText>{t('mfa.login.use_passkey')}</ButtonText>
              </Button>
            ) : null}
            {!approval && methods?.includes('passkey_approval') ? (
              <Button variant="outline" action="secondary" onPress={() => void handleApproval()} isDisabled={isVerifying} testID="step-up-approval">
                <ButtonText>{t('mfa.login.use_approval')}</ButtonText>
              </Button>
            ) : null}
            {!approval && methods?.includes('federated') ? (
              <Button variant="outline" action="secondary" onPress={async () => finished(await verifyStepUpFederated())} isDisabled={isVerifying} testID="step-up-provider">
                <ButtonText>{t('mfa.login.use_provider')}</ButtonText>
              </Button>
            ) : null}
            {errorText ? (
              <Text size="sm" className="text-error-600" testID="step-up-error" accessibilityLiveRegion="polite" accessibilityRole="alert">
                {errorText}
              </Text>
            ) : null}
          </VStack>
        </ModalBody>
        <ModalFooter>
          <Button variant="outline" action="secondary" onPress={onClose} isDisabled={isVerifying} testID="step-up-cancel">
            <ButtonText>{t('common.cancel')}</ButtonText>
          </Button>
          {offersCode && !approval ? (
            <Button onPress={() => void handleVerify()} isDisabled={isVerifying || code.trim().length === 0} testID="step-up-submit">
              {isVerifying ? <Spinner size="small" /> : <ButtonText>{t('data_protection.step_up_verify')}</ButtonText>}
            </Button>
          ) : null}
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

/** Mounted once in the app shell: the single step-up prompt every reveal bar opens through the grant store. */
export const StepUpPromptHost: React.FC = () => {
  const isOpen = useIsStepUpPromptOpen();
  return <StepUpPrompt isOpen={isOpen} onClose={closeStepUpPrompt} />;
};
