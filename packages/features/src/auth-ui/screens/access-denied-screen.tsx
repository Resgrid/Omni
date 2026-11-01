import { useAuthStore, useIsAuthenticated } from '@resgrid/auth';
import { useActiveVariant } from '@resgrid/config';
import { useTranslation } from '@resgrid/i18n';
import { Button, ButtonText, Heading, Text, useThemeColors, VStack } from '@resgrid/ui';
import { ShieldAlert } from 'lucide-react-native';
import React, { useCallback } from 'react';
import { View } from 'react-native';

import { AuthLayout } from '../components/auth-layout';

export interface AccessDeniedScreenProps {
  /** "Back to sign in", after signing a still-signed-in member out (ShellGate then shows the login screen). */
  onDismiss?: () => void;
}

/**
 * The app-access gate (IC `CanLoginToCommandApp`, Dispatch `CanLoginToDispatchApp`; `capabilities.auth.appAccessRight`).
 * `enforceAppAccess` signs the member out; this says why, in the member's language, instead of an app that loads and then
 * fails every request.
 */
export function AccessDeniedScreen({ onDismiss }: AccessDeniedScreenProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const variant = useActiveVariant();
  const signedIn = useIsAuthenticated();

  const dismiss = useCallback(() => {
    if (signedIn) {
      void useAuthStore.getState().logout('app_access_denied', 'access-denied');
    }
    onDismiss?.();
  }, [onDismiss, signedIn]);

  return (
    <AuthLayout testID="access-denied-screen">
      <VStack space="lg" className="w-full items-center">
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <ShieldAlert size={64} color={colors.error} />
        </View>
        <Heading size="xl" className="text-center" accessibilityRole="header">
          {t('access_denied.title')}
        </Heading>
        <Text className="text-center" testID="access-denied-message">
          {t('access_denied.message', { appName: variant.identity.name })}
        </Text>
        <Button action="primary" className="w-full" onPress={dismiss} accessibilityLabel={t('access_denied.back_to_sign_in')} testID="access-denied-back">
          <ButtonText>{t('access_denied.back_to_sign_in')}</ButtonText>
        </Button>
      </VStack>
    </AuthLayout>
  );
}

export default AccessDeniedScreen;
