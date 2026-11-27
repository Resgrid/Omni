import {
  cancelStepUp,
  closeStepUpPrompt,
  isMfaErrorCode,
  mfaErrorKey,
  offeredMethods,
  requestStepUp,
  startStepUpApproval,
  type StepUpArea,
  type StepUpMethod,
  stepUpStore,
  useIsStepUpPromptOpen,
  useStepUpPending,
  verifyStepUpCode,
  verifyStepUpPasskey,
  verifyStepUpPassword,
  verifyStepUpProvider,
  verifyStepUpSso,
} from '@resgrid/auth';
import { useCapability } from '@resgrid/config';
import { pushRoutePath } from '@resgrid/core/navigation/route-paths';
import { useTranslation } from '@resgrid/i18n';
import { Button, ButtonSpinner, ButtonText, Heading, Input, InputField, Modal, ModalBackdrop, ModalBody, ModalContent, ModalFooter, ModalHeader, Spinner, Text, useThemeColors, VStack } from '@resgrid/ui';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';

/** Refusal codes from `StepUp/Verify` (and the sheet's own) that have their own message. */
const ERROR_KEYS = new Map<string, string>([
  ['invalid_totp', 'step_up.errors.invalid_code'],
  ['invalid_password', 'step_up.errors.invalid_password'],
  ['too_many_attempts', 'step_up.errors.too_many_attempts'],
  ['password_not_available', 'step_up.errors.password_not_available'],
  ['mfa_enrollment_required', 'step_up.errors.enrollment_required'],
  ['session_required', 'step_up.errors.session_required'],
  ['approval_pending', 'step_up.errors.approval_pending'],
  ['approval_denied', 'step_up.errors.approval_denied'],
  ['approval_expired', 'step_up.errors.approval_expired'],
  ['sso_reauthentication_not_satisfied', 'step_up.errors.sso_not_satisfied'],
  ['federated_mfa_not_satisfied', 'step_up.errors.provider_not_satisfied'],
  ['step_up_method_not_allowed', 'step_up.errors.method_not_allowed'],
  ['mfa_method_not_allowed', 'step_up.errors.method_not_allowed'],
  ['service_unavailable', 'step_up.errors.unavailable'],
  ['passkey_unavailable', 'step_up.errors.passkey_unavailable'],
  ['sso_cancelled', 'step_up.errors.sso_cancelled'],
  ['network', 'step_up.errors.network'],
]);

/** The message for a failed verification: the sheet's own codes first, then the shared MFA messages, else a generic one. */
export const stepUpErrorKey = (code: string): string => ERROR_KEYS.get(code) ?? (isMfaErrorCode(code) ? mfaErrorKey(code) : 'step_up.errors.failed');

/** What the member is about to do, in the sheet's first line. */
const AREA_KEYS = new Map<StepUpArea, string>([
  ['signatures', 'step_up.area.signatures'],
  ['acknowledgments', 'step_up.area.acknowledgments'],
  ['approvals', 'step_up.area.approvals'],
  ['protected_data', 'step_up.area.protected_data'],
]);

const SECRET_METHODS = new Set<StepUpMethod>(['totp', 'password']);

/**
 * The one step-up sheet (round 10 A5) for every area and every app: shows only the methods the department allows and this
 * member can use here — an authenticator code, a passkey (where this platform has them), approval from Responder, the
 * organization's provider MFA, signing in again with the organization's SSO in the system auth session, or the password —
 * verifies with `StepUp/Verify`, and the action that was refused is sent again. A member with nothing usable (2FA required,
 * not enrolled) is told so, with a way to set it up where the app has account security. Codes and passwords live only in
 * local state, are cleared on every close and submit, and are never logged.
 */
export const StepUpSheet: React.FC = () => {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const auth = useCapability('auth');
  const pending = useStepUpPending();
  const isVerifying = stepUpStore((state) => state.isVerifying);
  const lastError = stepUpStore((state) => state.lastError);
  const [secret, setSecret] = useState('');
  const [secretMethod, setSecretMethod] = useState<StepUpMethod | null>(null);
  const [approvalNumber, setApprovalNumber] = useState<string | null>(null);
  const approvalAbort = useRef<AbortController | null>(null);
  const isOpen = pending !== null;

  useEffect(() => {
    if (isOpen) return;
    setSecret('');
    setSecretMethod(null);
    approvalAbort.current?.abort();
    approvalAbort.current = null;
    setApprovalNumber(null);
  }, [isOpen]);

  const close = useCallback(() => {
    approvalAbort.current?.abort();
    cancelStepUp();
  }, []);

  if (!pending) return null;

  const { requirement, options } = pending;
  const methods = offeredMethods(requirement, options);
  const canComplete = (options?.CanComplete ?? requirement.canComplete) && methods.length > 0;
  // A refusal names the methods; a sheet opened without one (the protected-data reveal) waits for `StepUp/Options`.
  const knowsMethods = options !== null || requirement.usableMethods.length > 0;
  const isLoadingOptions = !knowsMethods && !lastError;
  const secretMethods = methods.filter((method) => SECRET_METHODS.has(method));
  const activeSecret = secretMethod ?? secretMethods[0] ?? null;
  const offersAccountSecurity = auth.mfa || auth.passkeys;

  const submitSecret = async () => {
    const value = activeSecret === 'totp' ? secret.trim() : secret;

    if (!value || !activeSecret) return;
    setSecret('');
    await (activeSecret === 'totp' ? verifyStepUpCode(value) : verifyStepUpPassword(value));
  };

  const approve = async () => {
    const controller = new AbortController();

    approvalAbort.current = controller;
    await startStepUpApproval(setApprovalNumber, controller.signal);
    setApprovalNumber(null);
  };

  const enroll = () => {
    cancelStepUp();
    pushRoutePath(router, '/settings/account-security');
  };

  return (
    // A native window (useRNModal): a step-up can start inside a bottom sheet, which is its own window above the app.
    <Modal isOpen onClose={close} useRNModal testID="step-up-sheet">
      <ModalBackdrop />
      <ModalContent>
        <ModalHeader>
          <Heading size="md">{t('step_up.title')}</Heading>
        </ModalHeader>
        <ModalBody>
          <VStack space="md">
            <Text size="sm">{t(AREA_KEYS.get(requirement.area) ?? 'step_up.area.signatures')}</Text>
            {isLoadingOptions ? <Spinner testID="step-up-loading" /> : null}
            {knowsMethods && !canComplete ? (
              <VStack space="sm" testID="step-up-cannot-complete">
                <Text size="sm" className="text-typography-700">
                  {t('step_up.enroll_needed')}
                </Text>
                {offersAccountSecurity ? (
                  <Button variant="outline" onPress={enroll} testID="step-up-enroll">
                    <ButtonText>{t('step_up.enroll')}</ButtonText>
                  </Button>
                ) : null}
              </VStack>
            ) : null}
            {approvalNumber ? (
              <VStack space="sm" className="items-center rounded-lg bg-background-50 p-4" testID="step-up-approval-panel">
                <Text size="sm">{t('step_up.approval_hint')}</Text>
                <Text className="text-4xl font-bold text-typography-900" testID="step-up-approval-number">
                  {approvalNumber}
                </Text>
                <Button variant="link" onPress={() => approvalAbort.current?.abort()} testID="step-up-approval-cancel">
                  <ButtonText>{t('common.cancel')}</ButtonText>
                </Button>
              </VStack>
            ) : null}
            {canComplete && !approvalNumber ? (
              <VStack space="sm">
                {secretMethods.length > 1 ? (
                  <Button variant="link" onPress={() => setSecretMethod(activeSecret === 'totp' ? 'password' : 'totp')} testID="step-up-switch-secret">
                    <ButtonText>{t(activeSecret === 'totp' ? 'step_up.use_password' : 'step_up.use_code')}</ButtonText>
                  </Button>
                ) : null}
                {activeSecret ? (
                  <Input variant="outline" size="lg" isDisabled={isVerifying}>
                    <InputField
                      testID={activeSecret === 'totp' ? 'step-up-code-input' : 'step-up-password-input'}
                      value={secret}
                      onChangeText={setSecret}
                      placeholder={t(activeSecret === 'totp' ? 'step_up.code_placeholder' : 'step_up.password_placeholder')}
                      accessibilityLabel={t(activeSecret === 'totp' ? 'step_up.code_placeholder' : 'step_up.password_placeholder')}
                      keyboardType={activeSecret === 'totp' ? 'number-pad' : 'default'}
                      secureTextEntry={activeSecret === 'password'}
                      autoComplete={activeSecret === 'totp' ? 'one-time-code' : 'current-password'}
                      textContentType={activeSecret === 'totp' ? 'oneTimeCode' : 'password'}
                      maxLength={activeSecret === 'totp' ? 8 : 256}
                      onSubmitEditing={() => void submitSecret()}
                    />
                  </Input>
                ) : null}
                {activeSecret ? (
                  <Button onPress={() => void submitSecret()} isDisabled={isVerifying || secret.trim().length === 0} testID="step-up-submit">
                    {isVerifying ? <ButtonSpinner color={colors.textInverse} /> : <ButtonText>{t('step_up.verify')}</ButtonText>}
                  </Button>
                ) : null}
                {methods.includes('passkey') ? (
                  <Button variant="outline" action="secondary" onPress={() => void verifyStepUpPasskey()} isDisabled={isVerifying} testID="step-up-passkey">
                    <ButtonText>{t('mfa.login.use_passkey')}</ButtonText>
                  </Button>
                ) : null}
                {methods.includes('passkey_approval') ? (
                  <Button variant="outline" action="secondary" onPress={() => void approve()} isDisabled={isVerifying} testID="step-up-approval">
                    <ButtonText>{t('mfa.login.use_approval')}</ButtonText>
                  </Button>
                ) : null}
                {methods.includes('federated') ? (
                  <Button variant="outline" action="secondary" onPress={() => void verifyStepUpProvider()} isDisabled={isVerifying} testID="step-up-provider">
                    <ButtonText>{t('mfa.login.use_provider')}</ButtonText>
                  </Button>
                ) : null}
                {methods.includes('sso') ? (
                  <Button variant="outline" action="secondary" onPress={() => void verifyStepUpSso()} isDisabled={isVerifying} testID="step-up-sso">
                    <ButtonText>{t('step_up.use_sso')}</ButtonText>
                  </Button>
                ) : null}
              </VStack>
            ) : null}
            {lastError ? (
              <Text size="sm" className="text-error-600" testID="step-up-error" accessibilityLiveRegion="polite" accessibilityRole="alert">
                {t(stepUpErrorKey(lastError))}
              </Text>
            ) : null}
          </VStack>
        </ModalBody>
        <ModalFooter>
          <Button variant="outline" action="secondary" onPress={close} isDisabled={isVerifying} testID="step-up-cancel">
            <ButtonText>{t('common.cancel')}</ButtonText>
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

/**
 * Mounted once in the app shell (as the protected-data prompt was): the step-up sheet for every area, and the protected-data
 * reveal, which now verifies through the same sheet (area `protected_data`, its grant kept by the grant store).
 */
export const StepUpSheetHost: React.FC = () => {
  const adpPrompt = useIsStepUpPromptOpen();

  useEffect(() => {
    if (!adpPrompt) return;
    void requestStepUp({ area: 'protected_data', required: true, allowedMethods: [], usableMethods: [], mfaMethods: [], windowMinutes: 15, canComplete: true }).then(() => closeStepUpPrompt());
  }, [adpPrompt]);

  return <StepUpSheet />;
};
