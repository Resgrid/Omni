import { useAuthStore, useIsProtectionEnabled } from '@resgrid/auth';
import { logger } from '@resgrid/core/logging/logger';
import { useTranslation } from '@resgrid/i18n';
import { Button, ButtonText, HStack, Spinner, Text } from '@resgrid/ui';
import { EyeIcon, EyeOffIcon, ShieldIcon } from 'lucide-react-native';
import React, { useCallback, useEffect, useRef } from 'react';

import { useProtectedReveal } from '../hooks/use-protected-reveal';

export interface ProtectedRevealBarProps {
  /**
   * Re-reads what the screen shows. Values arrive redacted and only come back decrypted on a request carrying the
   * grant, so a reveal that does not re-fetch changes nothing on screen.
   */
  onRefresh: () => void | Promise<void>;
  testID?: string;
}

/**
 * The reveal control for a screen with protected values (Dispatch's reveal bar; ADP plan 7.2). Renders nothing when
 * the department is not protected. Reveal obtains a grant (or opens the single step-up prompt mounted by the shell);
 * conceal — manual or at grant expiry — re-reads without the grant so plaintext leaves memory as well as the screen.
 */
export const ProtectedRevealBar: React.FC<ProtectedRevealBarProps> = ({ onRefresh, testID = 'protected-reveal-bar' }) => {
  const { t } = useTranslation();
  const isProtectionEnabled = useIsProtectionEnabled();

  const refresh = useCallback(
    (reason: 'revealed' | 'concealed' | 'expired') => {
      Promise.resolve()
        .then(() => onRefresh())
        .catch((error: unknown) => {
          // After a conceal a failed re-read means plaintext is still on screen: log it, never the values.
          logger.error({ message: 'Protected data refresh failed', context: { reason, testID, error: error instanceof Error ? error.message : 'unknown' } });
        });
    },
    [onRefresh, testID]
  );

  const handleRevealed = useCallback(() => refresh('revealed'), [refresh]);
  const { isRevealed, isRequesting, reveal, conceal } = useProtectedReveal(handleRevealed);

  const concealedManually = useRef(false);
  const handleConceal = useCallback(() => {
    concealedManually.current = true;
    conceal();
    refresh('concealed');
  }, [conceal, refresh]);

  // The window is absolute: when the store's timer drops the grant while this screen is open, re-read so the
  // plaintext leaves the screen. Skipped after a manual conceal (already refreshed) and on sign-out.
  const wasRevealed = useRef(isRevealed);
  useEffect(() => {
    if (wasRevealed.current && !isRevealed && !concealedManually.current && useAuthStore.getState().status === 'signedIn') refresh('expired');
    concealedManually.current = false;
    wasRevealed.current = isRevealed;
  }, [isRevealed, refresh]);

  if (!isProtectionEnabled) return null;

  return (
    <HStack space="sm" className="items-center bg-background-50 px-4 py-2" testID={testID}>
      <ShieldIcon size={16} color="#6b7280" />
      <Text size="sm" className="flex-1 text-typography-700">
        {isRevealed ? t('data_protection.revealed_notice') : t('data_protection.protected_notice')}
      </Text>
      {isRevealed ? (
        <Button size="sm" variant="outline" action="secondary" onPress={handleConceal} testID="protected-conceal-button">
          <EyeOffIcon size={14} color="#6b7280" />
          <ButtonText>{t('data_protection.conceal')}</ButtonText>
        </Button>
      ) : (
        <Button size="sm" onPress={() => void reveal()} isDisabled={isRequesting} testID="protected-reveal-button">
          {isRequesting ? <Spinner size="small" /> : <EyeIcon size={14} color="#ffffff" />}
          <ButtonText>{t('data_protection.reveal')}</ButtonText>
        </Button>
      )}
    </HStack>
  );
};
