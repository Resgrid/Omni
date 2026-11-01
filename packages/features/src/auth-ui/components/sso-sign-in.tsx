import { type DepartmentSsoConfig, desktopLegacySso, fetchSsoConfigForUser, isSharedInstallation, startSamlSignIn, useAuthStore, useOidcLogin } from '@resgrid/auth';
import { useCapability } from '@resgrid/config';
import { logger } from '@resgrid/core';
import { useTranslation } from '@resgrid/i18n';
import { Button, ButtonSpinner, ButtonText, FormControl, FormControlError, FormControlErrorText, FormControlLabel, FormControlLabelText, Heading, Input, InputField, Text, VStack } from '@resgrid/ui';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

import { authUiApi } from '../lib/api-context';
import { mfaErrorText } from '../lib/auth-errors';
import { InlineError } from './inline-error';

export interface SsoSignInProps {
  /** Back to the password form. */
  onBack: () => void;
  isLoading?: boolean;
}

interface Resolved {
  username: string;
  departmentId: number | null;
  config: DepartmentSsoConfig;
}

/**
 * Single sign-on (omni-plan §7.3): username-first discovery (Unit, with a timeout), then the department's provider.
 * Brokered sign-in (`capabilities.auth.brokeredSso` and the department's broker) is preferred — only a one-time code comes
 * back to the app; servers and departments without the broker use the app-side OIDC (Dispatch) or SAML (Responder)
 * flows. A shared installation always signs in with an ephemeral browser session.
 */
export const SsoSignIn: React.FC<SsoSignInProps> = ({ onBack, isLoading = false }) => {
  const { t } = useTranslation();
  const [resolved, setResolved] = useState<Resolved | null>(null);
  return resolved ? (
    <SsoProviders resolved={resolved} onChangeUser={() => setResolved(null)} onBack={onBack} isLoading={isLoading} />
  ) : (
    <VStack space="md" className="w-full" testID="sso-lookup">
      <Heading size="lg" accessibilityRole="header">
        {t('login.sso_title')}
      </Heading>
      <Text size="sm" className="text-typography-500">
        {t('login.sso_subtitle')}
      </Text>
      <SsoLookupForm onResolved={setResolved} />
      <Button variant="link" action="secondary" onPress={onBack} accessibilityLabel={t('login.sso.or_sign_in_with_password')} testID="sso-back">
        <ButtonText>{t('login.sso.or_sign_in_with_password')}</ButtonText>
      </Button>
    </VStack>
  );
};

const SsoLookupForm: React.FC<{ onResolved: (resolved: Resolved) => void }> = ({ onResolved }) => {
  const { t } = useTranslation();
  const [username, setUsername] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [busy, setBusy] = useState(false);
  const [fieldError, setFieldError] = useState<{ username?: string; departmentId?: string }>({});
  const [lookupError, setLookupError] = useState<string | null>(null);

  const lookup = useCallback(async () => {
    const trimmed = username.trim();
    const department = departmentId.trim();
    const errors = { username: trimmed ? undefined : t('login.sso.username_required'), departmentId: department === '' || /^\d+$/.test(department) ? undefined : t('login.sso.department_id_invalid') };
    setFieldError(errors);
    setLookupError(null);
    if (errors.username || errors.departmentId) {
      return;
    }
    setBusy(true);
    try {
      const id = department ? parseInt(department, 10) : undefined;
      const result = await fetchSsoConfigForUser(authUiApi(), trimmed, id);
      if (result.failed) {
        setLookupError(t('login.sso.lookup_network_error'));
      } else if (!result.config) {
        setLookupError(t('login.sso.user_not_found'));
      } else if (!result.config.ssoEnabled) {
        setLookupError(t('login.sso.sso_not_enabled'));
      } else {
        onResolved({ username: trimmed, departmentId: id ?? result.config.departmentId, config: result.config });
      }
    } catch {
      setLookupError(t('login.sso.lookup_network_error'));
    } finally {
      setBusy(false);
    }
  }, [departmentId, onResolved, t, username]);

  return (
    <VStack space="md">
      <FormControl isInvalid={!!fieldError.username} isDisabled={busy}>
        <FormControlLabel>
          <FormControlLabelText>{t('login.sso.username_label')}</FormControlLabelText>
        </FormControlLabel>
        <Input>
          <InputField
            value={username}
            onChangeText={setUsername}
            placeholder={t('login.sso.username_placeholder')}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="username"
            keyboardType="email-address"
            returnKeyType="next"
            accessibilityLabel={t('login.sso.username_label')}
            aria-label={t('login.sso.username_label')}
            testID="sso-username"
          />
        </Input>
        <FormControlError>
          <FormControlErrorText>{fieldError.username}</FormControlErrorText>
        </FormControlError>
      </FormControl>
      <FormControl isInvalid={!!fieldError.departmentId} isDisabled={busy}>
        <FormControlLabel>
          <FormControlLabelText>{t('login.sso.department_id_label')}</FormControlLabelText>
        </FormControlLabel>
        <Input>
          <InputField
            value={departmentId}
            onChangeText={setDepartmentId}
            placeholder={t('login.sso.department_id_placeholder')}
            keyboardType="number-pad"
            autoComplete="off"
            returnKeyType="done"
            onSubmitEditing={() => void lookup()}
            accessibilityLabel={t('login.sso.department_id_label')}
            aria-label={t('login.sso.department_id_label')}
            testID="sso-department-id"
          />
        </Input>
        <FormControlError>
          <FormControlErrorText>{fieldError.departmentId}</FormControlErrorText>
        </FormControlError>
      </FormControl>
      <InlineError message={lookupError} testID="sso-lookup-error" />
      <Button action="primary" onPress={() => void lookup()} isDisabled={busy} accessibilityLabel={t('login.sso.continue_button')} testID="sso-continue">
        {busy ? (
          <>
            <ButtonSpinner />
            <ButtonText className="ml-2">{t('login.sso.looking_up')}</ButtonText>
          </>
        ) : (
          <ButtonText>{t('login.sso.continue_button')}</ButtonText>
        )}
      </Button>
    </VStack>
  );
};

const SsoProviders: React.FC<{ resolved: Resolved; onChangeUser: () => void; onBack: () => void; isLoading: boolean }> = ({ resolved, onChangeUser, onBack, isLoading }) => {
  const { t } = useTranslation();
  const auth = useCapability('auth');
  const { config, username, departmentId } = resolved;
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const handledResponse = useRef<unknown>(null);

  const brokered = auth.brokeredSso && config.brokeredSsoAvailable;
  const isElectronShell = desktopLegacySso() !== null;
  const showOidc = !brokered && config.providerType === 'oidc';
  // Without the broker, SAML returns through this app's own scheme (native) or the desktop bridge; a browser cannot receive it.
  const showSaml = !brokered && config.providerType === 'saml2';
  const samlSupported = (Platform.OS !== 'web' || isElectronShell) && !!config.samlLoginUrl;

  // Called unconditionally (hooks); an unusable authority leaves it idle.
  const oidc = useOidcLogin({ authority: showOidc ? config.authority : null, clientId: config.clientId, username, departmentId, departmentToken: config.departmentToken });

  const fail = useCallback((code: string) => setError(mfaErrorText(t, code)), [t]);

  useEffect(() => {
    if (!oidc.response || handledResponse.current === oidc.response) {
      return;
    }
    handledResponse.current = oidc.response;
    if (oidc.response.type !== 'success') {
      return;
    }
    setBusy(true);
    void oidc
      .completeSignIn()
      .then((outcome) => (outcome === 'failed' ? fail('sso_failed') : undefined))
      .finally(() => setBusy(false));
  }, [fail, oidc]);

  const startBrokered = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const result = await useAuthStore.getState().loginWithBrokeredSso(config.departmentToken ? { departmentToken: config.departmentToken } : { username }, { ephemeral: isSharedInstallation() });
      if (result.outcome === 'failed') {
        fail(result.code);
      }
    } catch {
      fail('sso_failed');
    } finally {
      setBusy(false);
    }
  }, [config.departmentToken, fail, username]);

  const startOidc = useCallback(async () => {
    setError(null);
    if (isElectronShell) {
      setBusy(true);
      try {
        const outcome = await oidc.signInOnDesktop();
        if (outcome === 'failed') {
          fail('sso_failed');
        }
      } finally {
        setBusy(false);
      }
      return;
    }
    if (!oidc.ready) {
      logger.warn({ message: 'SSO: OIDC sign-in is not ready (authority unusable or discovery pending)' });
      fail('sso_unavailable');
      return;
    }
    await oidc.promptAsync();
  }, [fail, isElectronShell, oidc]);

  const startSaml = useCallback(async () => {
    setError(null);
    if (!samlSupported || !config.samlLoginUrl) {
      fail('sso_unavailable');
      return;
    }
    setBusy(true);
    try {
      const outcome = await startSamlSignIn(config.samlLoginUrl, config.departmentToken);
      if (outcome === 'failed') {
        fail('sso_failed');
      }
    } finally {
      setBusy(false);
    }
  }, [config.departmentToken, config.samlLoginUrl, fail, samlSupported]);

  const working = busy || isLoading;
  const label = t('login.sso.sign_in_with_sso');

  return (
    <VStack space="md" className="w-full" testID="sso-providers">
      <Heading size="lg" accessibilityRole="header">
        {t('login.sso_title')}
      </Heading>
      <Text size="sm" className="text-center text-typography-500" testID="sso-username-label">
        {config.departmentName ? t('login.sso_department', { name: config.departmentName }) : username}
      </Text>
      {brokered ? (
        <Button action="primary" onPress={() => void startBrokered()} isDisabled={working} accessibilityLabel={label} testID="sso-brokered">
          {working ? <ButtonSpinner /> : <ButtonText>{label}</ButtonText>}
        </Button>
      ) : null}
      {showOidc ? (
        <Button action="primary" onPress={() => void startOidc()} isDisabled={working || (!isElectronShell && !oidc.ready)} accessibilityLabel={label} testID="sso-oidc">
          {working ? <ButtonSpinner /> : <ButtonText>{label}</ButtonText>}
        </Button>
      ) : null}
      {showSaml ? (
        <Button action="primary" onPress={() => void startSaml()} isDisabled={working} accessibilityLabel={label} testID="sso-saml">
          {working ? <ButtonSpinner /> : <ButtonText>{label}</ButtonText>}
        </Button>
      ) : null}
      {!brokered && !showOidc && !showSaml ? (
        <Text size="sm" testID="sso-no-provider">
          {t('login.sso.sso_not_enabled')}
        </Text>
      ) : null}
      <InlineError message={error} testID="sso-error" />
      {config.allowLocalLogin ? (
        <Button variant="link" action="secondary" onPress={onBack} accessibilityLabel={t('login.sso.or_sign_in_with_password')} testID="sso-password">
          <ButtonText>{t('login.sso.or_sign_in_with_password')}</ButtonText>
        </Button>
      ) : null}
      <Button variant="link" action="secondary" onPress={onChangeUser} accessibilityLabel={t('login.sso.change_department')} testID="sso-change-user">
        <ButtonText>{t('login.sso.change_department')}</ButtonText>
      </Button>
    </VStack>
  );
};
