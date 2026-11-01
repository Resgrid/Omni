import { unlockPersonalSession, useAuth } from '@resgrid/auth';
import { logger } from '@resgrid/core';
import { useTranslation } from '@resgrid/i18n';
import { Button, ButtonSpinner, ButtonText, Heading, Pressable, Text, useThemeColors, VStack } from '@resgrid/ui';
import { LockKeyhole } from 'lucide-react-native';
import React, { useCallback, useState } from 'react';
import { View } from 'react-native';

import { AuthLayout } from '../components/auth-layout';
import { InlineError } from '../components/inline-error';
import { PasswordInput } from '../components/password-input';

export interface PersonalLockScreenProps {
  /** After a successful unlock (ShellGate re-renders on the lock store anyway). */
  onUnlocked?: () => void;
}

/**
 * Dispatch's inactivity lock screen (`capabilities.auth.personalLock`): the password, checked offline against the salted
 * verifier kept since sign-in. A session with no verifier (SSO, or it was lost) cannot be unlocked here: sign in again.
 * "Not you?" signs out. The lock state is persisted, so killing the app no longer skips it.
 */
export function PersonalLockScreen({ onUnlocked }: PersonalLockScreenProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const { logout } = useAuth();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const unlock = useCallback(async () => {
    if (password.length === 0) {
      setError(t('login.password_required'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await unlockPersonalSession(password);
      if (result === 'unlocked') {
        onUnlocked?.();
      } else {
        setError(result === 'no_verifier' ? t('lockscreen.relogin_required') : t('lockscreen.unlock_failed'));
      }
    } catch {
      logger.warn({ message: 'Unlocking the personal lock failed' });
      setError(t('lockscreen.unlock_failed'));
    } finally {
      setPassword('');
      setBusy(false);
    }
  }, [onUnlocked, password, t]);

  return (
    <AuthLayout testID="personal-lock-screen">
      <VStack space="lg" className="w-full items-center">
        <View className="items-center justify-center rounded-full bg-primary-100 p-6" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <LockKeyhole size={56} color={colors.primary} />
        </View>
        <Heading size="2xl" className="text-center" accessibilityRole="header">
          {t('lockscreen.title')}
        </Heading>
        <Text className="text-center text-typography-500">{t('lockscreen.message')}</Text>
        <VStack space="xs" className="w-full">
          <Text size="sm" className="font-medium">
            {t('lockscreen.password')}
          </Text>
          <PasswordInput
            value={password}
            onChangeText={(value) => {
              setPassword(value);
              setError(null);
            }}
            onSubmitEditing={() => void unlock()}
            placeholder={t('lockscreen.password_placeholder')}
            accessibilityLabel={t('lockscreen.password')}
            isDisabled={busy}
            isInvalid={!!error}
            testID="lock-password"
          />
        </VStack>
        <InlineError message={error} testID="lock-error" />
        <Button action="primary" className="w-full" onPress={() => void unlock()} isDisabled={busy} accessibilityLabel={t('lockscreen.unlock_button')} testID="lock-unlock">
          {busy ? (
            <>
              <ButtonSpinner />
              <ButtonText className="ml-2">{t('lockscreen.unlocking')}</ButtonText>
            </>
          ) : (
            <ButtonText>{t('lockscreen.unlock_button')}</ButtonText>
          )}
        </Button>
        <Pressable onPress={() => void logout('personal_lock_not_me')} accessibilityRole="button" testID="lock-not-you">
          <Text className="text-primary-600 underline">{t('lockscreen.not_you')}</Text>
        </Pressable>
      </VStack>
    </AuthLayout>
  );
}

export default PersonalLockScreen;
