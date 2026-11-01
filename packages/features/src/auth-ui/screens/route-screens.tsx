import { handleSamlCallbackUrl } from '@resgrid/auth';
import { useTranslation } from '@resgrid/i18n';
import { Center, Spinner, Text } from '@resgrid/ui';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import React, { useEffect } from 'react';
import { Platform } from 'react-native';

import { AuthLayout } from '../components/auth-layout';
import { SharedDeviceSetup } from '../components/shared-device-setup';
import { goBackOr } from '../lib/navigation';
import { authRoutes } from '../routes';
import { LoginScreen } from './login-screen';

// The page the Resgrid SSO broker (and an OIDC provider on the web) returns to: the browser auth session that opened the
// provider reads the result from this URL; on the web this popup hands it back and closes.
WebBrowser.maybeCompleteAuthSession();

/** `/login/sso`: the login screen opened on its single sign-on view. */
export function SsoScreen() {
  return <LoginScreen initialView="sso" />;
}

/**
 * `/sso-return` (passkey plan section 7.7.2; identical in R/U/I/D). Nothing from a brokered return is read or stored here:
 * the auth session that is waiting consumes it, and a stray visit simply goes back. A legacy SAML relay that cold-started
 * the app on this URL is handed to `handleSamlCallbackUrl` (state-checked; ignored when it is not this app's pending one).
 */
export function SsoReturnScreen() {
  const { t } = useTranslation();
  const url = Linking.useURL();

  useEffect(() => {
    if (url && url.includes('saml_response=')) {
      void handleSamlCallbackUrl(url).finally(() => goBackOr(authRoutes.login()));
      return;
    }
    if (Platform.OS !== 'web') {
      goBackOr(authRoutes.login());
    }
  }, [url]);

  return (
    <Center className="flex-1 bg-background-0" testID="sso-return">
      <Spinner size="large" accessibilityLabel={t('login.sso_signing_in')} />
      <Text className="mt-4 text-typography-500">{t('login.sso_signing_in')}</Text>
    </Center>
  );
}

/** `/login/shared-device` (Unit, IC, Dispatch; `capabilities.auth.sharedDevice`), also reachable from Settings. */
export function SharedDeviceScreen() {
  return (
    <AuthLayout testID="shared-device-screen">
      <SharedDeviceSetup onDone={() => goBackOr(authRoutes.login())} />
    </AuthLayout>
  );
}
