import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useMemo } from 'react';

import { authLogger, describeError } from '../runtime/logger';
import { isWebPlatform } from '../runtime/platform';
import { ssoReturnScheme } from '../runtime/variant';
import { useAuthStore } from '../session/auth-store';
import { isSharedInstallation } from '../session/shared-installation';
import { desktopLegacySso } from './legacy-sso-desktop';
import { isValidSsoUrl } from './sso-url';

// ---------------------------------------------------------------------------------------------------------------------
// Legacy (unbrokered) OIDC sign-in (Dispatch's hook): Authorization Code + PKCE at the department's IdP, then the IdP
// id_token is exchanged at `connect/external-token`. The brokered flow (`loginWithBrokeredSso`) is preferred wherever
// discovery says `brokeredSsoAvailable`; this remains for departments and servers without the broker.
// - the redirect scheme comes from the manifest (`<ssoReturnScheme>://auth/callback`; Unit/IC hardcoded `resgridunit`);
// - web returns to `/login/sso` on this site;
// - discovery is null-safe (an empty or non-https authority is never fetched — Responder's isValidSsoUrl);
// - the desktop app's main process redeems the code itself and hands back only the id_token;
// - a shared installation forces a fresh provider sign-in (`prompt=login`, `max_age=0`) in an ephemeral browser.
// ---------------------------------------------------------------------------------------------------------------------

// Lets the system browser close itself after the OIDC redirect (web/iOS).
WebBrowser.maybeCompleteAuthSession();

export const OIDC_SCOPES = ['openid', 'email', 'profile', 'offline_access'];

/** The redirect URI the department registers with its IdP. Lowercase scheme: IdPs compare exact strings and Android matches schemes case-sensitively. */
export const oidcRedirectUri = (): string => AuthSession.makeRedirectUri(isWebPlatform() ? { path: 'login/sso' } : { scheme: ssoReturnScheme(), path: 'auth/callback' });

export interface OidcRequestConfigInput {
  clientId: string;
  redirectUri: string;
  shared: boolean;
}

/** The authorization request: PKCE code flow; a shared installation must authenticate the member again. */
export const buildOidcRequestConfig = ({ clientId, redirectUri, shared }: OidcRequestConfigInput): AuthSession.AuthRequestConfig => ({
  clientId: clientId || 'placeholder',
  redirectUri,
  scopes: OIDC_SCOPES,
  usePKCE: true,
  responseType: AuthSession.ResponseType.Code,
  ...(shared ? { prompt: AuthSession.Prompt.Login, extraParams: { max_age: '0' } } : {}),
});

export interface OidcLoginOptions {
  authority: string | null | undefined;
  clientId: string | null | undefined;
  username?: string;
  departmentId?: number | null;
  departmentToken?: string | null;
}

export type OidcSignInOutcome = 'signed_in' | 'mfa_required' | 'failed' | 'cancelled';

const outcomeOfStore = (): OidcSignInOutcome => {
  const state = useAuthStore.getState();
  return state.status === 'signedIn' ? 'signed_in' : state.isSsoMfaPending ? 'mfa_required' : 'failed';
};

/** Exchanges an IdP id_token (from the code exchange or the desktop bridge) for a Resgrid session. */
export async function signInWithOidcIdToken(idToken: string, options: Omit<OidcLoginOptions, 'authority' | 'clientId'>): Promise<OidcSignInOutcome> {
  await useAuthStore.getState().loginWithExternalToken({
    provider: 'oidc',
    externalToken: idToken,
    username: options.username,
    departmentId: options.departmentId ?? undefined,
    departmentToken: options.departmentToken ?? undefined,
  });
  return outcomeOfStore();
}

export interface OidcLoginResult {
  request: AuthSession.AuthRequest | null;
  response: AuthSession.AuthSessionResult | null;
  /** True when the authority is usable (https) and discovery has loaded. */
  ready: boolean;
  promptAsync: (options?: AuthSession.AuthRequestPromptOptions) => Promise<AuthSession.AuthSessionResult>;
  /** After `response.type === 'success'`: code → IdP id_token → Resgrid session. */
  completeSignIn: () => Promise<OidcSignInOutcome>;
  /** The desktop app: the main process runs the IdP sign-in and returns the id_token. */
  signInOnDesktop: () => Promise<OidcSignInOutcome>;
}

export function useOidcLogin({ authority, clientId, username, departmentId, departmentToken }: OidcLoginOptions): OidcLoginResult {
  const redirectUri = useMemo(() => oidcRedirectUri(), []);
  const safeAuthority = isValidSsoUrl(authority) ? (authority as string) : null;
  const discovery = AuthSession.useAutoDiscovery(safeAuthority as string);
  const shared = isSharedInstallation();

  const [request, response, promptRequest] = AuthSession.useAuthRequest(buildOidcRequestConfig({ clientId: clientId ?? '', redirectUri, shared }), safeAuthority ? discovery : null);

  const promptAsync = useCallback((options?: AuthSession.AuthRequestPromptOptions) => promptRequest({ preferEphemeralSession: shared, ...options }), [promptRequest, shared]);

  const completeSignIn = useCallback(async (): Promise<OidcSignInOutcome> => {
    if (response?.type !== 'success' || !request?.codeVerifier || !discovery || !clientId) {
      return response?.type === 'cancel' || response?.type === 'dismiss' ? 'cancelled' : 'failed';
    }
    try {
      const tokenResponse = await AuthSession.exchangeCodeAsync(
        { clientId, redirectUri, code: (response as AuthSession.AuthSessionResult & { params: Record<string, string> }).params.code, extraParams: { code_verifier: request.codeVerifier } },
        discovery
      );
      if (!tokenResponse.idToken) {
        authLogger.warn({ message: 'SSO OIDC: no id_token in the identity provider response' });
        return 'failed';
      }
      return await signInWithOidcIdToken(tokenResponse.idToken, { username, departmentId, departmentToken });
    } catch (error) {
      authLogger.warn({ message: 'SSO OIDC: code exchange failed', context: describeError(error) });
      return 'failed';
    }
  }, [response, request, discovery, clientId, redirectUri, username, departmentId, departmentToken]);

  const signInOnDesktop = useCallback(async (): Promise<OidcSignInOutcome> => {
    const bridge = desktopLegacySso();
    if (!bridge || !safeAuthority || !clientId) {
      return 'failed';
    }
    const result = await bridge.legacySsoOidc(safeAuthority, clientId, shared).catch(() => ({ ok: false as const, reason: 'failed' as const }));
    if (!result.ok) {
      return result.reason === 'cancelled' ? 'cancelled' : 'failed';
    }
    return signInWithOidcIdToken(result.idToken, { username, departmentId, departmentToken });
  }, [safeAuthority, clientId, shared, username, departmentId, departmentToken]);

  return { request, response, ready: !!safeAuthority && !!discovery, promptAsync, completeSignIn, signInOnDesktop };
}
