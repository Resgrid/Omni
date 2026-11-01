import { useAuthStore } from '@resgrid/auth';
import { useTranslation } from '@resgrid/i18n';
import { Box, Button, ButtonText, CustomBottomSheet, Heading, Text, VStack } from '@resgrid/ui';
import * as Clipboard from 'expo-clipboard';
import React, { useCallback, useState } from 'react';

/**
 * New recovery codes, shown once (passkey plan section 6.1). They are in memory only; the member copies or writes them
 * down now, because nothing can show them again.
 */
export const RecoveryCodes: React.FC<{ codes: string[] }> = ({ codes }) => {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async () => {
    await Clipboard.setStringAsync(codes.join('\n'));
    setCopied(true);
  }, [codes]);

  return (
    <VStack space="sm" testID="mfa-recovery-codes">
      <Text size="sm">{t('mfa.recovery_codes.body')}</Text>
      <Box className="rounded-lg bg-background-50 p-3">
        {codes.map((code) => (
          <Text key={code} selectable className="font-mono text-base" testID="mfa-recovery-code">
            {code}
          </Text>
        ))}
      </Box>
      <Button variant="outline" action="secondary" size="sm" onPress={() => void copy()} accessibilityLabel={t('mfa.recovery_codes.copy')} testID="mfa-recovery-codes-copy">
        <ButtonText>{copied ? t('mfa.recovery_codes.copied') : t('mfa.recovery_codes.copy')}</ButtonText>
      </Button>
    </VStack>
  );
};

/**
 * After an authenticator was set up during sign-in (passkey plan section 6.2): the new recovery codes, once. The app shell
 * mounts it once (with the other overlay hosts) so it shows on whatever screen the sign-in lands on.
 */
export const RecoveryCodesSheet: React.FC = () => {
  const { t } = useTranslation();
  const codes = useAuthStore((state) => state.pendingRecoveryCodes);
  const dismiss = useAuthStore((state) => state.dismissRecoveryCodes);
  const isOpen = !!codes && codes.length > 0;

  return (
    <CustomBottomSheet isOpen={isOpen} onClose={dismiss} snapPoints={[70]} testID="mfa-recovery-codes-sheet">
      <VStack space="md" className="w-full">
        <Heading size="md" accessibilityRole="header">
          {t('mfa.recovery_codes.title')}
        </Heading>
        {codes ? <RecoveryCodes codes={codes} /> : null}
        <Button action="primary" onPress={dismiss} accessibilityLabel={t('mfa.recovery_codes.saved')} testID="mfa-recovery-codes-done">
          <ButtonText>{t('mfa.recovery_codes.saved')}</ButtonText>
        </Button>
      </VStack>
    </CustomBottomSheet>
  );
};
