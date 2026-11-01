import { useMemo } from 'react';

import type { LoginFailure } from './errors/login-errors';
import type { MfaChallenge } from './mfa/types';
import { type AuthState, useAuthStore } from './session/auth-store';
import type { AuthStatus } from './session/types';
import { useSharedSessionStore } from './shared-session/shared-session-store';

/** The sign-in state the login, MFA and SSO screens render (a stable object while nothing in it changes). */
export interface AuthView {
  status: AuthStatus;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  loginFailure: LoginFailure | null;
  mfaChallenge: MfaChallenge | null;
  isSsoMfaPending: boolean;
  pendingRecoveryCodes: string[] | null;
  userId: string | null;
  hydrated: boolean;
  login: AuthState['login'];
  logout: AuthState['logout'];
}

export const useAuth = (): AuthView => {
  const status = useAuthStore((state) => state.status);
  const accessToken = useAuthStore((state) => state.accessToken);
  const error = useAuthStore((state) => state.error);
  const loginFailure = useAuthStore((state) => state.loginFailure);
  const mfaChallenge = useAuthStore((state) => state.mfaChallenge);
  const isSsoMfaPending = useAuthStore((state) => state.isSsoMfaPending);
  const pendingRecoveryCodes = useAuthStore((state) => state.pendingRecoveryCodes);
  const userId = useAuthStore((state) => state.userId);
  const hydrated = useAuthStore((state) => state.hydrated);
  const login = useAuthStore((state) => state.login);
  const logout = useAuthStore((state) => state.logout);
  return useMemo(
    () => ({
      status,
      isAuthenticated: status === 'signedIn' && !!accessToken,
      isLoading: status === 'loading',
      error,
      loginFailure,
      mfaChallenge,
      isSsoMfaPending,
      pendingRecoveryCodes,
      userId,
      hydrated,
      login,
      logout,
    }),
    [status, accessToken, error, loginFailure, mfaChallenge, isSsoMfaPending, pendingRecoveryCodes, userId, hydrated, login, logout]
  );
};

export const useAuthStatus = (): AuthStatus => useAuthStore((state) => state.status);

export const useIsAuthenticated = (): boolean => useAuthStore((state) => state.status === 'signedIn' && !!state.accessToken);

export const useMfaChallenge = (): MfaChallenge | null => useAuthStore((state) => state.mfaChallenge);

/** True while a shared-device session is locked (the shell shows the lock screen). */
export const useIsSharedSessionLocked = (): boolean => useSharedSessionStore((state) => state.locked);
