import type { ResetReason } from '@resgrid/offline';
import { CONTRACT_KEYS } from '@resgrid/offline';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { externalTokenGrant, type ExternalTokenInput, passwordGrant, refreshTokenGrant } from '../api/connect';
import { isLoginErrorCode, type LoginFailure } from '../errors/login-errors';
import type { ApprovalWaitResult } from '../mfa/approval-wait';
import {
  type BrokeredSsoResult,
  cancelLoginApprovalRequest,
  forgetLoginSecrets,
  holdLoginTransaction,
  type LoginMfaHost,
  type LoginMfaResult,
  type LoginMfaStep,
  loginSetupOptions,
  type RecoveryStart,
  signInWithBrokeredSso,
  type SsoDepartment,
  startFactorRecovery,
  startLoginApproval,
  verifyLoginMfa,
  waitForLoginApproval,
} from '../mfa/login-mfa';
import type { ApprovalRequestData, MfaChallenge, TotpSetupData } from '../mfa/types';
import { clearPasswordVerification, computePasswordVerification, type PasswordVerification, savePasswordVerification } from '../personal-lock/password-verifier';
import { getAuthApiContext } from '../runtime/api-context';
import { authLogger, describeError } from '../runtime/logger';
import { applyApiCacheScope, authServices } from '../runtime/services';
import { lateBoundStateStorage, mainKv, storeKv } from '../runtime/storage';
import { identifyTelemetryUser } from '../runtime/telemetry';
import { authCapabilities } from '../runtime/variant';
import { markSharedSessionLocked, noteSessionRestoredAtLaunch, resetSharedSession } from '../shared-session/shared-session-store';
import { getJwtExpiryMs, profileFromIdToken } from './jwt';
import { getBaseApiUrl } from './server-url';
import { isSharedInstallation } from './shared-installation';
import { runSignOutHooks } from './sign-out-hooks';
import { createTokenRefreshEngine } from './token-refresh';
import type { AuthMethod, AuthResponse, AuthStatus, LoginCredentials, ProfileModel, SignOutReason } from './types';

// ---------------------------------------------------------------------------------------------------------------------
// The auth store (omni-plan §7.3): Unit's skeleton — restoreSession from the access token's `exp` with a 60 s skew,
// offline-safe; whitelisted persistence; single-flight logout; error-reporting user id only — with Dispatch's refresh
// engine and clear-state-first logout, Responder's cache scope stamped at load (by `initAuth()`), and the variant's frozen
// persisted store name `auth-storage` (in its own `auth-storage` instance for Dispatch/BigBoard, the main one otherwise).
// ---------------------------------------------------------------------------------------------------------------------

/** The persisted store name — frozen storage identity (all five legacy apps). */
export const AUTH_STORE_NAME = CONTRACT_KEYS.authStore;

/** Treat an access token expiring within this window as already expired, so a restore never trusts one about to lapse. */
export const ACCESS_TOKEN_EXPIRY_SKEW_MS = 60_000;

export interface AuthSessionState {
  accessToken: string | null;
  refreshToken: string | null;
  /**
   * Epoch ms (as a string) when the ACCESS token expires. Historical name kept from U/I/D/B so their persisted state is
   * read as-is after an upgrade.
   */
  refreshTokenExpiresOn: string | null;
  status: AuthStatus;
  error: string | null;
  /** The last failed password sign-in, with what the guidance needs beyond its code (a lockout's minutes). Never persisted. */
  loginFailure: LoginFailure | null;
  profile: ProfileModel | null;
  userId: string | null;
  isFirstTime: boolean;
  /** How this session's first factor was proven; the personal lock only applies to password sessions. */
  authMethod: AuthMethod | null;
  /** A sign-in waiting for its second factor; never persisted (its secret lives in login-mfa memory). */
  mfaChallenge: MfaChallenge | null;
  /** Recovery codes from setting up an authenticator at sign-in, shown once and then dropped. Never persisted. */
  pendingRecoveryCodes: string[] | null;
  /** True only while a legacy SSO exchange waits on an authenticator code (`retrySsoWithOtp`). */
  isSsoMfaPending: boolean;
  /** Persisted state has been read (or there was none). */
  hydrated: boolean;
}

export interface AuthActions {
  login: (credentials: LoginCredentials) => Promise<void>;
  /** Finishes the pending sign-in with a second factor (passkey plan section 7.5). */
  verifyLoginMfa: (step: LoginMfaStep) => Promise<LoginMfaResult>;
  /** Asks the member's Responder to approve the pending sign-in; the number is shown on this screen only. */
  requestLoginApproval: () => Promise<ApprovalRequestData | { code: string; restart: boolean }>;
  waitForLoginApproval: (approvalRequestId: string, signal?: AbortSignal) => Promise<ApprovalWaitResult>;
  cancelLoginApproval: (approvalRequestId: string) => Promise<void>;
  /** A new authenticator key for the setup the department requires. */
  loginSetupOptions: () => Promise<TotpSetupData | { code: string; restart: boolean }>;
  /** Abandons the pending sign-in; nothing of it is kept. */
  cancelLoginMfa: () => void;
  /** Signs in through the department's identity provider by way of the Resgrid broker (preferred SSO path). */
  loginWithBrokeredSso: (department: SsoDepartment, options?: { ephemeral?: boolean }) => Promise<BrokeredSsoResult>;
  /** The legacy (unbrokered) OIDC/SAML exchange at `connect/external-token`. */
  loginWithExternalToken: (input: ExternalTokenInput) => Promise<void>;
  /** Retries the pending legacy SSO exchange with the member's authenticator code. */
  retrySsoWithOtp: (otpCode: string) => Promise<void>;
  dismissRecoveryCodes: () => void;
  /** "I lost my authenticator": spends a recovery code on the pending sign-in to open the restricted recovery. */
  beginFactorRecovery: (recoveryCode: string) => Promise<RecoveryStart | { code: string; restart: boolean }>;
  /** Ends the session. `reason` is shown on the login screen when it should explain (e.g. `shift_ended`). */
  logout: (reason?: string, cause?: SignOutReason) => Promise<void>;
  refreshAccessToken: () => Promise<boolean>;
  isAuthenticated: () => boolean;
  setIsOnboarding: () => void;
}

export type AuthState = AuthSessionState & AuthActions;

const INITIAL_SESSION: AuthSessionState = {
  accessToken: null,
  refreshToken: null,
  refreshTokenExpiresOn: null,
  status: 'idle',
  error: null,
  loginFailure: null,
  profile: null,
  userId: null,
  isFirstTime: true,
  authMethod: null,
  mfaChallenge: null,
  pendingRecoveryCodes: null,
  isSsoMfaPending: false,
  hydrated: false,
};

const SIGNED_OUT: Partial<AuthSessionState> = {
  accessToken: null,
  refreshToken: null,
  refreshTokenExpiresOn: null,
  status: 'signedOut',
  loginFailure: null,
  profile: null,
  userId: null,
  authMethod: null,
  mfaChallenge: null,
  pendingRecoveryCodes: null,
  isSsoMfaPending: false,
};

// ---- Module memory (never persisted) ---------------------------------------------------------------------------------

/** The personal lock verifier for a password sign-in still waiting for its second factor (Dispatch). */
let pendingPasswordVerification: PasswordVerification | null = null;
/** The last legacy SSO exchange that asked for a code: the IdP token is a credential, held in memory only. */
let pendingSsoExchange: Omit<ExternalTokenInput, 'otpCode'> | null = null;
let logoutInFlight: Promise<void> | null = null;

const personalLockApplies = (): boolean => {
  try {
    return authCapabilities().personalLock && !isSharedInstallation();
  } catch {
    return false;
  }
};

/** Keeps the personal lock verifier, or makes sure none is left: a shared installation and SSO never have one. */
const settlePasswordVerification = (verification: PasswordVerification | null): void => {
  try {
    if (verification && personalLockApplies()) {
      savePasswordVerification(verification);
    } else {
      clearPasswordVerification();
    }
  } catch (error) {
    authLogger.warn({ message: 'Failed to update the lock screen password verifier', context: describeError(error) });
  }
};

const accessExpiryFrom = (response: AuthResponse): string => String(Date.now() + Math.max(0, response.expires_in) * 1000);

/** When the stored access token expires: its own `exp` claim, else the persisted expiry. Null when neither is usable. */
export const getAccessTokenExpiryMs = (accessToken: string | null | undefined, storedExpiresOn: string | null | undefined): number | null => {
  const fromJwt = getJwtExpiryMs(accessToken);
  if (fromJwt !== null) {
    return fromJwt;
  }
  if (storedExpiresOn) {
    const parsed = Number(storedExpiresOn);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return null;
};

// ---- Store -----------------------------------------------------------------------------------------------------------

type PersistedAuth = Pick<AuthSessionState, 'accessToken' | 'refreshToken' | 'refreshTokenExpiresOn' | 'profile' | 'userId' | 'isFirstTime' | 'authMethod' | 'status'>;

const persistedStatus = (status: AuthStatus): AuthStatus => (status === 'signedIn' || status === 'onboarding' ? status : 'signedOut');

const str = (value: unknown): string | null => (typeof value === 'string' && value.length > 0 ? value : null);

/** Reads persisted state from any legacy shape (U/I/D/B `refreshTokenExpiresOn`, Responder's extra fields) — whitelist only. */
export const readPersistedAuth = (persisted: unknown): Partial<PersistedAuth> => {
  if (typeof persisted !== 'object' || persisted === null) {
    return {};
  }
  const raw = persisted as Record<string, unknown>;
  const profile = typeof raw.profile === 'object' && raw.profile !== null ? (raw.profile as ProfileModel) : null;
  const method = raw.authMethod;
  return {
    accessToken: str(raw.accessToken),
    refreshToken: str(raw.refreshToken),
    refreshTokenExpiresOn: str(raw.refreshTokenExpiresOn) ?? (typeof raw.refreshTokenExpiresOn === 'number' ? String(raw.refreshTokenExpiresOn) : null),
    profile,
    userId: str(raw.userId) ?? (profile && typeof profile.sub === 'string' ? profile.sub : null),
    isFirstTime: typeof raw.isFirstTime === 'boolean' ? raw.isFirstTime : true,
    authMethod: method === 'password' || method === 'sso' || method === 'external' ? method : null,
    status: raw.status === 'onboarding' ? 'onboarding' : raw.status === 'signedIn' ? 'signedIn' : 'signedOut',
  };
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      ...INITIAL_SESSION,

      login: async (credentials) => {
        pendingPasswordVerification = null;
        // A previous password failure's reason goes with it; an MFA code error (invalid_totp) stays until the retry answers.
        set({ status: 'loading', loginFailure: null, ...(isLoginErrorCode(get().error) ? { error: null } : {}) });
        try {
          const result = await passwordGrant(getAuthApiContext(), credentials);
          switch (result.kind) {
            case 'signed-in': {
              signInWithTokens(result.tokens, null, 'password');
              // The personal lock screen's verifier; a shared installation never keeps one.
              settlePasswordVerification(personalLockApplies() ? await computePasswordVerification(credentials.password) : null);
              return;
            }
            case 'transaction':
              holdLoginTransaction(result.transaction.secret);
              pendingPasswordVerification = personalLockApplies() ? await computePasswordVerification(credentials.password) : null;
              set({ status: 'mfaRequired', error: null, mfaChallenge: result.transaction.challenge });
              return;
            case 'enrollment-required':
              set({ status: 'error', error: 'mfa_enrollment_required', mfaChallenge: null });
              return;
            case 'legacy-mfa':
              // The login screen prompts for the authenticator code and calls login() again with otpCode. Credentials are
              // never retained here.
              set({
                status: 'mfaRequired',
                error: result.invalidOtp ? 'invalid_totp' : null,
                mfaChallenge: { kind: 'legacy', methods: ['totp'], enrolled: ['totp'], preferred: 'totp', expiresAt: null, source: 'password' },
              });
              return;
            case 'failed':
              set({ status: 'error', error: result.failure.code, loginFailure: result.failure });
              return;
          }
        } catch (error) {
          // An unreadable token response is the server's fault, not the member's; the detail stays in the log.
          authLogger.error({ message: 'Sign-in could not be completed', context: describeError(error) });
          set({ status: 'error', error: 'login_failed', loginFailure: { code: 'login_failed' } });
        }
      },

      verifyLoginMfa: (step) => verifyLoginMfa(mfaHost, step),
      requestLoginApproval: () => startLoginApproval(mfaHost),
      waitForLoginApproval: (approvalRequestId, signal) => waitForLoginApproval(mfaHost, approvalRequestId, signal),
      cancelLoginApproval: (approvalRequestId) => cancelLoginApprovalRequest(approvalRequestId),
      loginSetupOptions: () => loginSetupOptions(mfaHost),
      cancelLoginMfa: () => {
        forgetLoginSecrets();
        pendingPasswordVerification = null;
        set({ status: 'signedOut', mfaChallenge: null, error: null });
      },

      loginWithBrokeredSso: async (department, options) => {
        pendingPasswordVerification = null;
        set({ status: 'loading', error: null, mfaChallenge: null, loginFailure: null });
        const result = await signInWithBrokeredSso(ssoHost, department, options?.ephemeral);
        if (result.outcome === 'cancelled') {
          set({ status: 'signedOut' });
        } else if (result.outcome === 'failed') {
          set({ status: 'error', error: result.code });
        }
        return result;
      },

      loginWithExternalToken: async (input) => {
        pendingPasswordVerification = null;
        set({ status: 'loading', error: null, loginFailure: null });
        try {
          const result = await externalTokenGrant(getAuthApiContext(), input);
          if (result.kind === 'signed-in') {
            pendingSsoExchange = null;
            signInWithTokens(result.tokens, null, 'external');
            settlePasswordVerification(null);
          } else if (result.kind === 'mfa-required') {
            // The rejected code is deliberately dropped: retrySsoWithOtp supplies a new one on every attempt.
            const { otpCode: _rejected, ...exchange } = input;
            pendingSsoExchange = exchange;
            set({ status: 'mfaRequired', isSsoMfaPending: true, error: result.invalidOtp ? 'invalid_totp' : null });
          } else {
            pendingSsoExchange = null;
            set({ status: 'error', error: result.code, isSsoMfaPending: false });
          }
        } catch (error) {
          pendingSsoExchange = null;
          authLogger.error({ message: 'SSO sign-in could not be completed', context: describeError(error) });
          set({ status: 'error', error: 'sso_failed', isSsoMfaPending: false });
        }
      },

      retrySsoWithOtp: async (otpCode) => {
        if (!pendingSsoExchange) {
          set({ status: 'error', error: 'mfa_transaction_invalid', isSsoMfaPending: false });
          return;
        }
        await get().loginWithExternalToken({ ...pendingSsoExchange, otpCode });
      },

      dismissRecoveryCodes: () => set({ pendingRecoveryCodes: null }),
      beginFactorRecovery: (recoveryCode) => startFactorRecovery(mfaHost, recoveryCode),

      logout: (reason, cause = 'logout') => {
        // Single-flight: every 401 caller queued behind a rejected refresh reaches logout(); they share one run so the
        // full data wipe never executes twice in parallel. A later, genuine logout runs again once this settles.
        if (logoutInFlight) {
          return logoutInFlight;
        }
        logoutInFlight = performLogout(typeof reason === 'string' ? reason : null, cause).finally(() => {
          logoutInFlight = null;
        });
        return logoutInFlight;
      },

      refreshAccessToken: () => refreshEngine.refresh(),

      isAuthenticated: () => {
        const state = get();
        return state.status === 'signedIn' && state.accessToken !== null;
      },

      setIsOnboarding: () => set({ status: 'onboarding' }),
    }),
    {
      name: AUTH_STORE_NAME,
      storage: createJSONStorage(() => lateBoundStateStorage(() => storeKv(AUTH_STORE_NAME))),
      // Hydrated explicitly by initAuth() once the variant's storage is bound (legacy fallbacks first).
      skipHydration: true,
      version: 0,
      // Only what restores a session. Transient fields (status other than signedIn/onboarding, errors, a pending second
      // factor, recovery codes) are never written: an app kill mid-login used to rehydrate `loading` with no way out.
      partialize: (state): PersistedAuth => ({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        refreshTokenExpiresOn: state.refreshTokenExpiresOn,
        profile: state.profile,
        userId: state.userId,
        isFirstTime: state.isFirstTime,
        authMethod: state.authMethod,
        status: persistedStatus(state.status),
      }),
      // The persisted status is advisory: restoreSession() derives the real one from the tokens (Unit). Onboarding stays.
      merge: (persisted, current) => {
        const restored = readPersistedAuth(persisted);
        return { ...current, ...restored, status: restored.status === 'onboarding' ? 'onboarding' : current.status, hydrated: true };
      },
    }
  )
);

// ---- Signing in ------------------------------------------------------------------------------------------------------

/**
 * Signs in with a token response (password, completion or legacy SSO grant): the profile from the id token, the persisted
 * credentials and the proactive refresh. Throws on a missing or malformed id token, which no sign-in may continue without.
 */
export const signInWithTokens = (authResponse: AuthResponse, recoveryCodes: string[] | null, method: AuthMethod): void => {
  const profile = profileFromIdToken(authResponse.id_token ?? null);
  refreshEngine.endSession();
  useAuthStore.setState({
    accessToken: authResponse.access_token,
    refreshToken: authResponse.refresh_token ?? null,
    refreshTokenExpiresOn: accessExpiryFrom(authResponse),
    status: 'signedIn',
    error: null,
    loginFailure: null,
    profile,
    userId: profile.sub,
    isFirstTime: false,
    authMethod: method,
    mfaChallenge: null,
    pendingRecoveryCodes: recoveryCodes,
    isSsoMfaPending: false,
  });
  identifyTelemetryUser(profile.sub);
  if (authResponse.refresh_token) {
    refreshEngine.schedule(authResponse.expires_in);
  }
  authLogger.info({ message: 'Signed in', context: { method } });
};

/** How the login transaction module moves this store. */
const mfaHost: LoginMfaHost = {
  signIn: (authResponse, recoveryCodes) => {
    signInWithTokens(authResponse, recoveryCodes, useAuthStore.getState().mfaChallenge?.source === 'sso' ? 'sso' : 'password');
    const verification = pendingPasswordVerification;
    pendingPasswordVerification = null;
    settlePasswordVerification(verification);
  },
  setChallenge: (challenge, error = null) => useAuthStore.setState({ status: challenge ? 'mfaRequired' : 'signedOut', mfaChallenge: challenge, error }),
  restart: (code) => {
    pendingPasswordVerification = null;
    useAuthStore.setState({ status: 'signedOut', mfaChallenge: null, error: code });
  },
};

/** A brokered SSO sign-in has no password: no lock verifier, and its first factor is the provider's. */
const ssoHost: LoginMfaHost = {
  ...mfaHost,
  signIn: (authResponse, recoveryCodes) => {
    pendingPasswordVerification = null;
    signInWithTokens(authResponse, recoveryCodes, 'sso');
    settlePasswordVerification(null);
  },
};

// ---- Token refresh ---------------------------------------------------------------------------------------------------

export const refreshEngine = createTokenRefreshEngine({
  requestRefresh: (refreshToken) => refreshTokenGrant(getAuthApiContext(), refreshToken),
  getRefreshToken: () => useAuthStore.getState().refreshToken,
  applyAuthResponse: (response) => {
    const state = useAuthStore.getState();
    // A refresh that raced sign-out must not resurrect the session (Dispatch).
    if (state.status === 'signedOut' || !state.refreshToken) {
      throw new Error('Token refresh completed after sign-out');
    }
    useAuthStore.setState({
      accessToken: response.access_token,
      // Keep the current refresh token when the server did not rotate it (Responder).
      refreshToken: response.refresh_token || state.refreshToken,
      refreshTokenExpiresOn: accessExpiryFrom(response),
      status: 'signedIn',
      error: null,
    });
  },
  onCredentialRejected: () => {
    if (useAuthStore.getState().status !== 'signedOut') {
      void useAuthStore.getState().logout(undefined, 'auth-rejected');
    }
  },
  onSharedSessionLocked: () => markSharedSessionLocked(null),
  onTransientFailure: () => {
    // A session restored with only a refresh token waits in `loading`; offline, it carries on signed in with what it has.
    if (useAuthStore.getState().status === 'loading' && useAuthStore.getState().refreshToken) {
      useAuthStore.setState({ status: 'signedIn' });
    }
  },
});

/** True when the stored access token is known to have expired (the HTTP client refreshes before sending). */
export const isAccessTokenExpired = (now: number = Date.now()): boolean => {
  const { accessToken, refreshTokenExpiresOn } = useAuthStore.getState();
  if (!accessToken) {
    return false;
  }
  const expiresAt = getAccessTokenExpiryMs(accessToken, refreshTokenExpiresOn);
  return expiresAt !== null && now >= expiresAt;
};

// ---- Cold start ------------------------------------------------------------------------------------------------------

/**
 * Cold-start session restore, after persisted state is read (Unit). No network on the critical path, and offline-safe:
 * - a valid access token (more than the skew left): signed in at once, refresh scheduled before expiry;
 * - an expired or opaque access token with a refresh token: signed in optimistically, refresh now in the background —
 *   an offline cold start keeps the session instead of bouncing to login;
 * - a refresh token only: `loading` while refreshing now (signed in anyway if the refresh fails transiently);
 * - an access token with no refresh token (a legacy BigBoard SSO session): signed in until it expires;
 * - nothing: signed out.
 * Only a 400/401 `invalid_grant` from the token endpoint ends the restored session.
 */
export const restoreSession = (now: number = Date.now()): void => {
  const state = useAuthStore.getState();
  refreshEngine.endSession();

  if (state.status === 'onboarding' && !state.refreshToken && !state.accessToken) {
    return;
  }

  const expiresAt = getAccessTokenExpiryMs(state.accessToken, state.refreshTokenExpiresOn);
  const accessValid = !!state.accessToken && expiresAt !== null && expiresAt - now > ACCESS_TOKEN_EXPIRY_SKEW_MS;

  if (!state.refreshToken) {
    if (accessValid) {
      useAuthStore.setState({ status: 'signedIn', error: null });
      afterRestore(state.userId);
    } else {
      useAuthStore.setState({ ...SIGNED_OUT, error: null });
    }
    return;
  }

  if (accessValid && expiresAt !== null) {
    useAuthStore.setState({ status: 'signedIn', error: null });
    refreshEngine.schedule((expiresAt - now) / 1000);
  } else if (state.accessToken) {
    useAuthStore.setState({ status: 'signedIn', error: null });
    refreshEngine.refreshSoon(0);
  } else {
    useAuthStore.setState({ status: 'loading', error: null });
    refreshEngine.refreshSoon(0);
  }
  afterRestore(state.userId);
};

const afterRestore = (userId: string | null): void => {
  identifyTelemetryUser(userId);
  // A shared session restored at launch locks before anyone can use it (passkey plan section 12.5.3): the screen is
  // concealed from the first frame, before the server is even asked.
  noteSessionRestoredAtLaunch();
  if (isSharedInstallation()) {
    markSharedSessionLocked(null);
  }
};

// ---- Signing out -----------------------------------------------------------------------------------------------------

const wipeReasonFor = (cause: SignOutReason): ResetReason => (cause === 'auth-rejected' ? 'auth-rejected' : cause === 'server-switch' ? 'server-switch' : 'logout');

/**
 * Dispatch's clear-state-first order: the session ends synchronously (so requests and routing cannot keep using its
 * credentials while cleanup runs), then whatever must still reach the server as the ended session runs with the token it
 * had (push unregister — before any server switch, which awaits this), then the legacy session copy and the lock
 * verifier go, then the scope wipe (teardowns, store resets, outbox hold, tables, MMKV except device preferences).
 */
const performLogout = async (reason: string | null, cause: SignOutReason): Promise<void> => {
  const ending = useAuthStore.getState();
  const endingAccessToken = ending.accessToken;
  const baseUrl = getBaseApiUrl();
  const wasSignedIn = ending.status === 'signedIn';

  refreshEngine.endSession();
  forgetLoginSecrets();
  pendingSsoExchange = null;
  pendingPasswordVerification = null;
  resetSharedSession();

  useAuthStore.setState({ ...SIGNED_OUT, error: reason });
  identifyTelemetryUser(null);
  authLogger.info({ message: 'Signed out', context: { cause, wasSignedIn } });

  try {
    await runSignOutHooks({ accessToken: endingAccessToken, baseUrl });
  } catch (error) {
    authLogger.warn({ message: 'A sign-out hook failed', context: describeError(error) });
  }

  try {
    // R/U/I also kept the token response under `authResponse`; no valid refresh token may stay on the device.
    mainKv()?.delete(CONTRACT_KEYS.authResponse);
    clearPasswordVerification();
  } catch (error) {
    authLogger.warn({ message: 'Failed to remove the stored session copy', context: describeError(error) });
  }

  const wipe = authServices().wipeScope;
  if (wipe) {
    try {
      await wipe(wipeReasonFor(cause));
    } catch (error) {
      authLogger.error({ message: 'Failed to clear local data on sign-out', context: describeError(error) });
    }
  }
};

// ---- API cache scope -------------------------------------------------------------------------------------------------

// Keep the API cache scoped to whoever is signed in (Responder/Unit): cache keys embed the identity, so a second user on
// the device can never be served the first one's rosters, units or contacts, and signing out drops the scope. The
// persisted identity is stamped by initAuth() before the first cache read.
useAuthStore.subscribe((state, previous) => {
  if (state.userId !== previous.userId) {
    applyApiCacheScope({ userId: state.userId });
  }
});

/** Test hook: back to a fresh process (no persisted state, no timers, no secrets). */
export const resetAuthStoreForTests = (): void => {
  refreshEngine.endSession();
  forgetLoginSecrets();
  pendingPasswordVerification = null;
  pendingSsoExchange = null;
  logoutInFlight = null;
  useAuthStore.setState({ ...INITIAL_SESSION });
};
