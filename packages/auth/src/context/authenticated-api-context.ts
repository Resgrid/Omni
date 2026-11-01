import { type ApiCache, type ApiCachePolicy, type ApiContext, type AuthRejection, createApiContext, createHttpClient, DEFAULT_TIMEOUT_MS, type HttpClient } from '@resgrid/api';

import { readProtectedGrantHeaders } from '../data-protection/grant-provider';
import { setAuthApiContext } from '../runtime/api-context';
import { authLogger } from '../runtime/logger';
import { isAccessTokenExpired, useAuthStore } from '../session/auth-store';
import { clientHeaders } from '../session/client-headers';
import { getBaseApiUrl } from '../session/server-url';
import { markSharedSessionLocked, resetSharedSession } from '../shared-session/shared-session-store';

export interface AuthenticatedApiContextOptions {
  /** The API cache (`@resgrid/api` `createApiCache` over the offline store) and the per-variant policy. */
  cache?: ApiCache;
  cachePolicy?: ApiCachePolicy;
  timeoutMs?: number;
  /** Also make this the context the auth package's own stores call through (default true). */
  register?: boolean;
}

export interface AuthenticatedApiContext {
  readonly context: ApiContext;
  readonly http: HttpClient;
}

/** Headers for every request: app + installation + device labels; the protected-data grant only on authenticated ones. */
export const authHeaders = ({ anonymous }: { anonymous: boolean }): Record<string, string> => ({
  ...clientHeaders(),
  ...(anonymous ? {} : readProtectedGrantHeaders()),
});

/** Shared-device refusals (passkey plan section 10.5): locked → the lock screen (tokens kept); expired → the shift ended. */
export const handleAuthRejection = (rejection: AuthRejection): void => {
  if (rejection.reason === 'shared_session_locked') {
    markSharedSessionLocked(rejection.lockVersion);
    return;
  }
  resetSharedSession();
  void useAuthStore.getState().logout('shift_ended');
};

/**
 * Wires `@resgrid/api`'s HTTP client to this package (omni-plan §7.2: Dispatch's client structure + 15 s timeout + client
 * and data-protection headers + shared-session 401 handling): the base URL from the stored server, the access token from
 * the auth store, refreshes through the one refresh engine (logout only on a 400/401 `invalid_grant` from the token
 * endpoint), requests skipped while there is no session, and a refresh before sending when the token is known to have
 * expired.
 */
export function createAuthenticatedApiContext(options: AuthenticatedApiContextOptions = {}): AuthenticatedApiContext {
  const http = createHttpClient({
    getBaseUrl: getBaseApiUrl,
    getAccessToken: () => useAuthStore.getState().accessToken,
    refreshAccessToken: () => useAuthStore.getState().refreshAccessToken(),
    onAuthRejected: handleAuthRejection,
    getHeaders: authHeaders,
    isSessionActive: () => {
      const state = useAuthStore.getState();
      return state.status === 'signedIn' && !!state.accessToken;
    },
    isAccessTokenExpired: () => isAccessTokenExpired() && !!useAuthStore.getState().refreshToken,
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    logger: { warn: (message, context) => authLogger.warn({ message, context }) },
  });
  const context = createApiContext({ http, cache: options.cache, cachePolicy: options.cachePolicy });
  if (options.register !== false) {
    setAuthApiContext(context);
  }
  return { context, http };
}
