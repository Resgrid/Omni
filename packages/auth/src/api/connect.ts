import { type ApiContext, isApiError } from '@resgrid/api';
import { normalizeServer } from '@resgrid/offline';

import { bodyOf, httpFailureOf } from '../errors/http-shape';
import { classifyLoginFailure, isServerLoginReason, type LoginFailure } from '../errors/login-errors';
import { type MfaChallenge, parseMethods } from '../mfa/types';
import { authLogger, describeError } from '../runtime/logger';
import { resgridClientId } from '../runtime/variant';
import type { AuthResponse, LoginCredentials } from '../session/types';
import { authRequest } from './auth-request';
import { connectEndpoints } from './endpoints';

/** The MFA completion grant (passkey workbook section 7.1). */
export const MFA_COMPLETION_GRANT = 'urn:resgrid:params:oauth:grant-type:mfa_completion';
/** The legacy SSO exchange grant; the server supplies it on `connect/external-token`, so builds may post without it. */
export const EXTERNAL_TOKEN_GRANT = 'urn:resgrid:params:oauth:grant-type:external_token';

/** Every Omni token request is bounded (the token endpoint once hung the whole single-flight refresh; Unit's fix). */
export const TOKEN_REQUEST_TIMEOUT_MS = 15_000;

let mobileScopes = true;

/** `mobile` is added to the requested scopes on iOS/Android (no effect on the server today; kept for parity). */
export function setMobileTokenScopes(value: boolean): void {
  mobileScopes = value;
}

const passwordScope = (): string => (mobileScopes ? 'openid profile offline_access mobile' : 'openid profile offline_access');
const externalScope = (): string => (mobileScopes ? 'openid email profile offline_access mobile' : 'openid email profile offline_access');

// ---------------------------------------------------------------------------------------------------------------------
// client_id (omni-plan §8.6 item 5): each variant sends its own OAuth client_id on the password, completion and refresh
// grants so Core can give it the long-lived refresh token (`TrustedLongLivedClientIds`). OpenIddict validates a client_id
// that is present against its application store, so a server where the id is not registered answers `invalid_client`
// (only an ABSENT client_id is accepted as anonymous). Such a server gets the request again without it — the client
// validation runs before the grant is processed, so nothing (no refresh token, no completion code) is spent — and is
// remembered for this process so it is not asked twice.
// ---------------------------------------------------------------------------------------------------------------------

const serversRejectingClientId = new Set<string>();

const serverKey = (ctx: ApiContext): string => normalizeServer(ctx.http.getBaseUrl());

const isInvalidClient = (error: unknown): boolean => {
  const failure = httpFailureOf(error);
  return !!failure?.answered && (failure.status === 400 || failure.status === 401) && bodyOf(failure.data)?.error === 'invalid_client';
};

/** Test hook. */
export function resetClientIdCompatibility(): void {
  serversRejectingClientId.clear();
}

/** Whether the next token request to this server carries the variant's client_id. */
export const sendsClientId = (ctx: ApiContext): boolean => !serversRejectingClientId.has(serverKey(ctx));

const postToken = async (ctx: ApiContext, form: Record<string, string>, endpoint = connectEndpoints.token): Promise<AuthResponse> => {
  const clientId = resgridClientId();
  const withClient = sendsClientId(ctx) && clientId ? { ...form, client_id: clientId } : form;
  try {
    return await authRequest<AuthResponse>(ctx, endpoint, { body: withClient }, { timeoutMs: TOKEN_REQUEST_TIMEOUT_MS });
  } catch (error) {
    if ('client_id' in withClient && isInvalidClient(error)) {
      serversRejectingClientId.add(serverKey(ctx));
      authLogger.warn({ message: 'Server does not accept this app client_id; token requests continue without it (short refresh lifetime)' });
      return authRequest<AuthResponse>(ctx, endpoint, { body: form }, { timeoutMs: TOKEN_REQUEST_TIMEOUT_MS });
    }
    throw error;
  }
};

// ---- Diagnostics -----------------------------------------------------------------------------------------------------

const OAUTH_ERRORS = new Set(['invalid_request', 'invalid_client', 'invalid_grant', 'unauthorized_client', 'unsupported_grant_type', 'invalid_scope', 'server_error', 'temporarily_unavailable']);
const KNOWN_DESCRIPTIONS: Record<string, string> = {
  'The refresh token is no longer valid.': 'refresh_token_no_longer_valid',
  'The user is no longer allowed to sign in.': 'user_sign_in_not_allowed',
};

/**
 * Only non-sensitive fields of a failed token request (Dispatch's sanitizer): status, a known OAuth error, OpenIddict's
 * documentation id, a known rejection reason and a known `login_error`. Never the body text, the request or the URL query.
 */
export const describeTokenFailure = (error: unknown): Record<string, unknown> => {
  const failure = httpFailureOf(error);
  const body = bodyOf(failure?.data);
  const oauthError = typeof body?.error === 'string' && OAUTH_ERRORS.has(body.error) ? body.error : undefined;
  const oauthErrorId = typeof body?.error_uri === 'string' ? /^https:\/\/documentation\.openiddict\.com\/errors\/(ID\d+)\/?$/.exec(body.error_uri)?.[1] : undefined;
  const rejectionReason = typeof body?.error_description === 'string' && Object.hasOwn(KNOWN_DESCRIPTIONS, body.error_description) ? KNOWN_DESCRIPTIONS[body.error_description] : undefined;
  const loginError = isServerLoginReason(body?.login_error) ? body?.login_error : undefined;
  return {
    ...describeError(error),
    ...(oauthError ? { oauthError } : {}),
    ...(oauthErrorId ? { oauthErrorId } : {}),
    ...(rejectionReason ? { rejectionReason } : {}),
    ...(loginError ? { loginError } : {}),
  };
};

// ---- Password grant --------------------------------------------------------------------------------------------------

/** A sign-in that continues on a login transaction: the secret is the only authority to finish it (memory only, never logged). */
export interface LoginTransactionStart {
  secret: string;
  challenge: MfaChallenge;
}

export type PasswordGrantResult =
  | { kind: 'signed-in'; tokens: AuthResponse }
  | { kind: 'transaction'; transaction: LoginTransactionStart }
  /** The department requires MFA the account does not have, and this server cannot set it up in the app. */
  | { kind: 'enrollment-required' }
  /** A server without the transaction flow: resend the password with `totp_code`. */
  | { kind: 'legacy-mfa'; invalidOtp: boolean }
  | { kind: 'failed'; failure: LoginFailure };

interface MfaErrorBody {
  error?: unknown;
  type?: unknown;
  mfa_transaction?: unknown;
  mfa_setup_transaction?: unknown;
  mfa_methods?: unknown;
  mfa_enrolled?: unknown;
  mfa_preferred?: unknown;
  mfa_expires_in?: unknown;
}

/** The login transaction the token endpoint (or `Sso/Redeem`) started, when it started one. */
export const loginTransactionFrom = (body: MfaErrorBody | null, source: MfaChallenge['source']): LoginTransactionStart | undefined => {
  if (!body) {
    return undefined;
  }
  const expiresAt = typeof body.mfa_expires_in === 'number' ? Date.now() + body.mfa_expires_in * 1000 : null;
  const code = body.error ?? body.type;
  if (code === 'mfa_required' && typeof body.mfa_transaction === 'string' && body.mfa_transaction) {
    return {
      secret: body.mfa_transaction,
      challenge: { kind: 'verify', methods: parseMethods(body.mfa_methods), enrolled: parseMethods(body.mfa_enrolled), preferred: parseMethods(body.mfa_preferred)[0] ?? null, expiresAt, source },
    };
  }
  if (code === 'mfa_enrollment_required' && typeof body.mfa_setup_transaction === 'string' && body.mfa_setup_transaction) {
    return { secret: body.mfa_setup_transaction, challenge: { kind: 'setup', methods: ['totp'], enrolled: [], preferred: 'totp', expiresAt, source } };
  }
  return undefined;
};

/**
 * `grant_type=password` with `mfa_flow=transaction` (or the legacy `totp_code` resend) and the variant's client_id.
 * Never throws for a refused sign-in: the result says why. Neither the username, the password nor any code is logged.
 */
export const passwordGrant = async (ctx: ApiContext, credentials: LoginCredentials): Promise<PasswordGrantResult> => {
  const form: Record<string, string> = {
    grant_type: 'password',
    username: credentials.username,
    password: credentials.password,
    scope: passwordScope(),
    ...(credentials.otpCode ? { totp_code: credentials.otpCode.trim() } : { mfa_flow: 'transaction' }),
  };
  try {
    const tokens = await postToken(ctx, form);
    return { kind: 'signed-in', tokens };
  } catch (error) {
    const body = bodyOf(httpFailureOf(error)?.data) as MfaErrorBody | null;
    const transaction = loginTransactionFrom(body, 'password');
    if (transaction) {
      authLogger.info({ message: 'Sign-in continues on a second-factor transaction', context: { kind: transaction.challenge.kind, methods: transaction.challenge.methods } });
      return { kind: 'transaction', transaction };
    }
    if (body?.error === 'mfa_enrollment_required') {
      return { kind: 'enrollment-required' };
    }
    if (body?.error === 'mfa_required' || body?.error === 'invalid_totp') {
      return { kind: 'legacy-mfa', invalidOtp: body.error === 'invalid_totp' };
    }
    const failure = classifyLoginFailure(error);
    authLogger.warn({ message: 'Sign-in refused', context: { ...describeTokenFailure(error), loginFailure: failure.code } });
    return { kind: 'failed', failure };
  }
};

// ---- Refresh grant ---------------------------------------------------------------------------------------------------

/**
 * `grant_type=refresh_token` with the variant's client_id. Throws the `ApiError`: the refresh engine owns the verdict
 * (only a 400/401 `invalid_grant` ends the session). The sanitized failure is recorded here as a warning breadcrumb.
 */
export const refreshTokenGrant = async (ctx: ApiContext, refreshToken: string): Promise<AuthResponse> => {
  try {
    return await postToken(ctx, { grant_type: 'refresh_token', refresh_token: refreshToken, scope: '' });
  } catch (error) {
    authLogger.warn({ message: 'Token refresh request failed', context: describeTokenFailure(error) });
    throw error;
  }
};

// ---- MFA completion grant --------------------------------------------------------------------------------------------

/**
 * Exchanges a finished login transaction for tokens: the completion code is single-use, bound to the transaction and the
 * app, and lives about a minute. A lost response means signing in again. Throws the `ApiError` on refusal.
 */
export const completionGrant = async (ctx: ApiContext, transaction: string, completionCode: string): Promise<AuthResponse> => {
  try {
    const tokens = await postToken(ctx, { grant_type: MFA_COMPLETION_GRANT, transaction, completion_code: completionCode });
    authLogger.info({ message: 'Login transaction completed' });
    return tokens;
  } catch (error) {
    authLogger.warn({ message: 'Login transaction completion failed', context: describeTokenFailure(error) });
    throw error;
  }
};

// ---- Legacy SSO exchange ---------------------------------------------------------------------------------------------

export interface ExternalTokenInput {
  provider: 'oidc' | 'saml2';
  /** The IdP id_token (OIDC) or the SAML relay token. Memory only. */
  externalToken: string;
  username?: string;
  departmentId?: number | null;
  /** The department's encrypted token (from discovery or the SAML relay callback); connect/external-token needs it or a code. */
  departmentToken?: string | null;
  departmentCode?: string | null;
  /** Accounts with Resgrid 2FA must supply the current authenticator code even via SSO. */
  otpCode?: string;
}

export type ExternalTokenResult = { kind: 'signed-in'; tokens: AuthResponse } | { kind: 'mfa-required'; invalidOtp: boolean } | { kind: 'failed'; code: string };

/** The legacy (unbrokered) SSO exchange at `connect/external-token`. The IdP token and any code are never logged. */
export const externalTokenGrant = async (ctx: ApiContext, input: ExternalTokenInput): Promise<ExternalTokenResult> => {
  // No grant_type, like every shipped build: the server supplies EXTERNAL_TOKEN_GRANT on this path.
  const form: Record<string, string> = {
    provider: input.provider,
    external_token: input.externalToken,
    scope: externalScope(),
  };
  if (input.username) {
    form.username = input.username;
  }
  if (input.departmentId) {
    form.department_id = String(input.departmentId);
  }
  if (input.departmentToken) {
    form.department_token = input.departmentToken;
  }
  if (input.departmentCode) {
    form.department_code = input.departmentCode;
  }
  if (input.otpCode) {
    form.totp_code = input.otpCode.trim();
  }
  try {
    const tokens = await postToken(ctx, form, connectEndpoints.externalToken);
    return { kind: 'signed-in', tokens };
  } catch (error) {
    const body = bodyOf(httpFailureOf(error)?.data);
    if (body?.error === 'mfa_required' || body?.error === 'invalid_totp') {
      return { kind: 'mfa-required', invalidOtp: body.error === 'invalid_totp' };
    }
    authLogger.warn({ message: 'SSO token exchange failed', context: { provider: input.provider, ...describeTokenFailure(error) } });
    const code = isApiError(error) && error.kind !== 'http' ? 'network_error' : typeof body?.error === 'string' ? body.error : 'sso_failed';
    return { kind: 'failed', code };
  }
};
