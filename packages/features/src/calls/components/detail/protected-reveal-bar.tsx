import { clearStepUp, ensureGrant, openStepUpPrompt, useHasGrantToken, useIsProtectionEnabled } from '@resgrid/auth';
import { useTranslation } from '@resgrid/i18n';
import { Button, ButtonText, Text } from '@resgrid/ui';
import { Shield } from 'lucide-react-native';
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';

export interface ProtectedRevealBarProps {
  /**
   * Re-reads the call: protected values arrive REDACTED and come back decrypted only on a request carrying the grant,
   * so a reveal that does not re-fetch changes nothing on screen.
   */
  onRefresh: () => void | Promise<void>;
  testID?: string;
}

/**
 * Advanced Data Protection reveal for the call (R/U/I reveal bar + D reveal bar). Renders nothing for departments
 * without the addon. The step-up prompt itself is mounted once by the app shell; concealing re-reads without the grant
 * so the plaintext leaves memory as well as the screen.
 */
export const ProtectedRevealBar: React.FC<ProtectedRevealBarProps> = ({ onRefresh, testID = 'protected-reveal-bar' }) => {
  const { t } = useTranslation();
  const isEnabled = useIsProtectionEnabled();
  const isRevealed = useHasGrantToken();
  const [isRequesting, setIsRequesting] = useState(false);

  if (!isEnabled) return null;

  const reveal = async () => {
    setIsRequesting(true);
    try {
      const outcome = await ensureGrant();
      if (outcome === 'granted') await onRefresh();
      else if (outcome === 'step_up_required') openStepUpPrompt();
    } finally {
      setIsRequesting(false);
    }
  };

  const conceal = () => {
    clearStepUp();
    void onRefresh();
  };

  return (
    <View style={styles.bar} className="bg-background-100" testID={testID}>
      <View style={styles.icon}>
        <Shield size={16} color="#374151" />
      </View>
      <Text size="sm" className="flex-1 text-typography-700">
        {isRevealed ? t('data_protection.revealed_notice') : t('data_protection.protected_notice')}
      </Text>
      {isRevealed ? (
        <Button size="xs" variant="outline" onPress={conceal} accessibilityLabel={t('data_protection.conceal')} testID="protected-conceal-button">
          <ButtonText>{t('data_protection.conceal')}</ButtonText>
        </Button>
      ) : (
        <Button size="xs" onPress={() => void reveal()} isDisabled={isRequesting} accessibilityLabel={t('data_protection.reveal')} testID="protected-reveal-button">
          <ButtonText>{t('data_protection.reveal')}</ButtonText>
        </Button>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, marginBottom: 8 },
  icon: { marginRight: 8 },
});
