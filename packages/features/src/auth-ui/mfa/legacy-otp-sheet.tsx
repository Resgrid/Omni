import { useTranslation } from '@resgrid/i18n';
import { Button, ButtonSpinner, ButtonText, CustomBottomSheet, Heading, Input, InputField, Text, VStack } from '@resgrid/ui';
import React, { useCallback, useEffect, useState } from 'react';

import { InlineError } from '../components/inline-error';

interface LegacyOtpSheetProps {
  isOpen: boolean;
  isSubmitting: boolean;
  /** True when a previously submitted code was rejected. */
  invalidCode: boolean;
  onSubmit: (code: string) => void;
  onClose: () => void;
}

/**
 * The authenticator prompt for a server without the login transaction (token endpoint answered `mfa_required` /
 * `invalid_totp`), and for the legacy SSO exchange. Controlled: the screen owns submission and retry. The code lives only in
 * local state and is cleared on close and submit; it is never logged or persisted.
 */
export const LegacyOtpSheet: React.FC<LegacyOtpSheetProps> = ({ isOpen, isSubmitting, invalidCode, onSubmit, onClose }) => {
  const { t } = useTranslation();
  const [code, setCode] = useState('');

  useEffect(() => {
    if (!isOpen) {
      setCode('');
    }
  }, [isOpen]);

  const submit = useCallback(() => {
    const submitted = code.trim();
    if (submitted.length === 0) {
      return;
    }
    setCode('');
    onSubmit(submitted);
  }, [code, onSubmit]);

  return (
    <CustomBottomSheet isOpen={isOpen} onClose={onClose} snapPoints={[55]} testID="login-otp-sheet">
      <VStack space="md" className="w-full">
        <Heading size="md" accessibilityRole="header">
          {t('mfa.login.title')}
        </Heading>
        <Text size="sm">{t('login.otp_body')}</Text>
        <Input variant="outline" size="lg" isDisabled={isSubmitting}>
          <InputField
            testID="login-otp-code"
            value={code}
            onChangeText={setCode}
            placeholder={t('mfa.login.code_placeholder')}
            keyboardType="number-pad"
            maxLength={8}
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            onSubmitEditing={submit}
            accessibilityLabel={t('mfa.login.code_placeholder')}
            aria-label={t('mfa.login.code_placeholder')}
          />
        </Input>
        <InlineError message={invalidCode ? t('mfa.errors.invalid_totp') : null} testID="login-otp-error" />
        <Button action="primary" onPress={submit} isDisabled={isSubmitting || code.trim().length === 0} accessibilityLabel={t('mfa.login.verify')} testID="login-otp-submit">
          {isSubmitting ? <ButtonSpinner /> : <ButtonText>{t('mfa.login.verify')}</ButtonText>}
        </Button>
        <Button variant="outline" action="secondary" onPress={onClose} isDisabled={isSubmitting} accessibilityLabel={t('common.cancel')} testID="login-otp-cancel">
          <ButtonText>{t('common.cancel')}</ButtonText>
        </Button>
      </VStack>
    </CustomBottomSheet>
  );
};
