import type { ProfileModel } from '@resgrid/models';

/** The OpenIddict token response (snake_case, as the token endpoint sends it). */
export interface AuthResponse {
  access_token: string;
  refresh_token?: string | null;
  id_token?: string | null;
  /** Access-token lifetime in seconds, relative to when the response arrived (never an epoch). */
  expires_in: number;
  token_type?: string;
  expiration_date?: string;
  /** Responder stamped this onto the stored copy (epoch ms). */
  obtained_at?: number;
}

export type { ProfileModel };

export interface LoginCredentials {
  username: string;
  password: string;
  /** Current authenticator (TOTP) code, for a server without the login transaction (legacy `totp_code` resend). */
  otpCode?: string;
}

export type AuthStatus = 'idle' | 'loading' | 'signedIn' | 'signedOut' | 'error' | 'onboarding' | 'mfaRequired';

/** How the current session's first factor was proven: the personal lock only applies to a password session. */
export type AuthMethod = 'password' | 'sso' | 'external';

/** Why a session ended, for the wipe registry (`@resgrid/offline` reset reasons). */
export type SignOutReason = 'logout' | 'auth-rejected' | 'server-switch' | 'shift-ended' | 'access-denied';
