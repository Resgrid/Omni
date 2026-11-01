import type { LoginFailure, MfaChallenge, SharedInstallationSetting } from '@resgrid/auth';
import { create } from 'zustand';

export interface FakeAuthState {
  status: 'idle' | 'loading' | 'signedIn' | 'signedOut' | 'error' | 'onboarding' | 'mfaRequired';
  accessToken: string | null;
  error: string | null;
  loginFailure: LoginFailure | null;
  mfaChallenge: MfaChallenge | null;
  isSsoMfaPending: boolean;
  pendingRecoveryCodes: string[] | null;
  userId: string | null;
  hydrated: boolean;
  login: jest.Mock;
  logout: jest.Mock;
  verifyLoginMfa: jest.Mock;
  requestLoginApproval: jest.Mock;
  waitForLoginApproval: jest.Mock;
  cancelLoginApproval: jest.Mock;
  loginSetupOptions: jest.Mock;
  cancelLoginMfa: jest.Mock;
  loginWithBrokeredSso: jest.Mock;
  retrySsoWithOtp: jest.Mock;
  dismissRecoveryCodes: jest.Mock;
  beginFactorRecovery: jest.Mock;
}

const initial = (): FakeAuthState => ({
  status: 'signedOut',
  accessToken: null,
  error: null,
  loginFailure: null,
  mfaChallenge: null,
  isSsoMfaPending: false,
  pendingRecoveryCodes: null,
  userId: null,
  hydrated: true,
  login: jest.fn(async () => undefined),
  logout: jest.fn(async () => undefined),
  verifyLoginMfa: jest.fn(async () => ({ ok: true, recovery: false })),
  requestLoginApproval: jest.fn(),
  waitForLoginApproval: jest.fn(),
  cancelLoginApproval: jest.fn(async () => undefined),
  loginSetupOptions: jest.fn(async () => ({ SharedKey: 'ABCD EFGH', AuthenticatorUri: 'otpauth://totp/x', ExpiresIn: 300 })),
  cancelLoginMfa: jest.fn(),
  loginWithBrokeredSso: jest.fn(async () => ({ outcome: 'signed_in' })),
  retrySsoWithOtp: jest.fn(async () => undefined),
  dismissRecoveryCodes: jest.fn(),
  beginFactorRecovery: jest.fn(),
});

export const fakeAuthStore = create<FakeAuthState>()(() => initial());

let installation: SharedInstallationSetting = { configured: false, shared: false, label: null };
export const fakeInstallation = {
  set: (value: SharedInstallationSetting) => {
    installation = value;
  },
  get: () => installation,
};

export const resetFakeAuth = (): void => {
  fakeAuthStore.setState(initial(), true);
  installation = { configured: false, shared: false, label: null };
};

/** The real @resgrid/auth with the store, hooks and every network/native call replaced. */
export function buildAuthMock(actual: Record<string, unknown>): Record<string, unknown> {
  return {
    ...actual,
    useAuthStore: fakeAuthStore,
    useAuth: () => {
      const state = fakeAuthStore();
      return {
        status: state.status,
        isAuthenticated: state.status === 'signedIn' && !!state.accessToken,
        isLoading: state.status === 'loading',
        error: state.error,
        loginFailure: state.loginFailure,
        mfaChallenge: state.mfaChallenge,
        isSsoMfaPending: state.isSsoMfaPending,
        pendingRecoveryCodes: state.pendingRecoveryCodes,
        userId: state.userId,
        hydrated: state.hydrated,
        login: state.login,
        logout: state.logout,
      };
    },
    useIsAuthenticated: () => fakeAuthStore((state) => state.status === 'signedIn' && !!state.accessToken),
    useSharedInstallation: () => installation,
    readSharedInstallation: () => installation,
    isSharedInstallation: () => installation.shared,
    saveSharedInstallation: jest.fn((value: { shared: boolean; label: string | null }) => {
      installation = { configured: true, ...value };
      return installation;
    }),
    getBaseApiUrl: jest.fn(() => 'https://api.resgrid.com/api/v4'),
    getStoredServerUrlProblem: jest.fn(() => null),
    registerServerChangeListener: jest.fn(() => () => undefined),
    switchServer: jest.fn(async () => ({ ok: true, apiUrl: 'https://api-eu-central.resgrid.com/api/v4', changed: true })),
    fetchSsoConfigForUser: jest.fn(),
    useOidcLogin: jest.fn(() => ({ request: null, response: null, ready: true, promptAsync: jest.fn(async () => ({ type: 'dismiss' })), completeSignIn: jest.fn(async () => 'signed_in'), signInOnDesktop: jest.fn() })),
    startSamlSignIn: jest.fn(async () => 'opened'),
    desktopLegacySso: () => null,
    passkeysSupported: jest.fn(() => true),
    hasLoginTransaction: jest.fn(() => true),
    unlockPersonalSession: jest.fn(),
    approverEnabled: jest.fn(() => true),
    fetchPendingApproval: jest.fn(),
    approvePendingRequest: jest.fn(),
    denyPendingRequest: jest.fn(),
    handleSamlCallbackUrl: jest.fn(async () => false),
  } as Record<string, any>;
}
