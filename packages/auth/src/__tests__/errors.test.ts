import { ApiError } from '@resgrid/api';
import { readFileSync } from 'fs';
import { join } from 'path';

import { describeTokenFailure } from '../api/connect';
import { classifyLoginFailure, describeLoginFailure, isLoginErrorCode, isServerLoginReason, type LoginErrorCode } from '../errors/login-errors';
import { endsTransaction, toMfaProblem } from '../errors/mfa-errors';
import { isMfaErrorCode, mfaErrorKey } from '../errors/mfa-messages';

// Ported from the identical R/U/I/D `login-errors.test.ts`, plus the ApiError shape every Omni token request throws.
const axiosError = (status?: number, data?: unknown) => ({
  isAxiosError: true,
  message: status ? `Request failed with status code ${status}` : 'Network Error',
  response: status ? { status, data } : undefined,
});

const apiError = (status: number, data?: unknown): ApiError => new ApiError({ kind: 'http', status, data });

const ALL_CODES: LoginErrorCode[] = [
  'invalid_credentials',
  'account_locked_out',
  'account_disabled',
  'account_not_activated',
  'no_department',
  'sso_required',
  'maximum_sessions',
  'department_access_denied',
  'server_unreachable',
  'server_not_resgrid',
  'rate_limited',
  'server_error',
  'login_failed',
];

describe('classifyLoginFailure', () => {
  it('reads the reason the server sends in login_error (axios and ApiError shapes)', () => {
    for (const reason of ['invalid_credentials', 'account_disabled', 'account_not_activated', 'no_department', 'sso_required', 'maximum_sessions', 'department_access_denied']) {
      expect(classifyLoginFailure(axiosError(400, { error: 'invalid_grant', login_error: reason }))).toEqual({ code: reason });
      expect(classifyLoginFailure(apiError(400, { error: 'invalid_grant', login_error: reason }))).toEqual({ code: reason });
    }
  });

  it('keeps the minutes left on a temporary lockout, and leaves them out of one with no end', () => {
    expect(classifyLoginFailure(axiosError(400, { error: 'invalid_grant', login_error: 'account_locked_out', lockout_minutes_remaining: 12 }))).toEqual({ code: 'account_locked_out', lockoutMinutes: 12 });
    expect(classifyLoginFailure(axiosError(400, { error: 'invalid_grant', login_error: 'account_locked_out' }))).toEqual({ code: 'account_locked_out' });
    expect(classifyLoginFailure(axiosError(400, { error: 'invalid_grant', login_error: 'account_locked_out', lockout_minutes_remaining: 'soon' }))).toEqual({ code: 'account_locked_out' });
  });

  it('ignores a login_error it does not know, and reads it only beside invalid_grant', () => {
    expect(classifyLoginFailure(axiosError(400, { error: 'invalid_grant', login_error: 'something_new' }))).toEqual({ code: 'invalid_credentials' });
    expect(classifyLoginFailure(axiosError(400, { error: 'invalid_client', login_error: 'account_disabled' }))).toEqual({ code: 'login_failed' });
    expect(classifyLoginFailure(axiosError(500, { login_error: 'account_disabled' }))).toEqual({ code: 'server_error' });
  });

  it('falls back for servers without login_error (older Core): description-based session refusals, else wrong credentials', () => {
    expect(classifyLoginFailure(axiosError(400, { error: 'invalid_grant', error_description: 'The username or password is invalid.' }))).toEqual({ code: 'invalid_credentials' });
    expect(classifyLoginFailure(axiosError(400, { error: 'invalid_grant', error_description: "The department's maximum number of active sessions has been reached." }))).toEqual({ code: 'maximum_sessions' });
    expect(classifyLoginFailure(axiosError(400, { error: 'invalid_grant', error_description: 'The user is no longer allowed to sign in to this department.' }))).toEqual({ code: 'department_access_denied' });
  });

  it('tells a throttled member to wait whatever reason the body gives', () => {
    expect(classifyLoginFailure(axiosError(429, { error: 'invalid_grant', login_error: 'account_locked_out', lockout_minutes_remaining: 5 }))).toEqual({ code: 'rate_limited' });
  });

  it('reports unreachable, failing and non-Resgrid servers', () => {
    expect(classifyLoginFailure(axiosError())).toEqual({ code: 'server_unreachable' });
    expect(classifyLoginFailure(new ApiError({ kind: 'network' }))).toEqual({ code: 'server_unreachable' });
    expect(classifyLoginFailure(new ApiError({ kind: 'timeout' }))).toEqual({ code: 'server_unreachable' });
    expect(classifyLoginFailure(axiosError(500, {}))).toEqual({ code: 'server_error' });
    expect(classifyLoginFailure(axiosError(503, '<html>'))).toEqual({ code: 'server_error' });
    expect(classifyLoginFailure(axiosError(400, { error: 'temporarily_unavailable' }))).toEqual({ code: 'server_error' });
    expect(classifyLoginFailure(axiosError(404, '<html>Not found</html>'))).toEqual({ code: 'server_not_resgrid' });
    expect(classifyLoginFailure(axiosError(200, '<html>'))).toEqual({ code: 'server_not_resgrid' });
  });

  it('falls back to a general failure for anything else', () => {
    expect(classifyLoginFailure(axiosError(400, { error: 'invalid_client' }))).toEqual({ code: 'login_failed' });
    expect(classifyLoginFailure(new Error('boom'))).toEqual({ code: 'login_failed' });
    expect(classifyLoginFailure(undefined)).toEqual({ code: 'login_failed' });
  });

  it('knows its codes', () => {
    for (const code of ALL_CODES) {
      expect(isLoginErrorCode(code)).toBe(true);
    }
    expect(isLoginErrorCode('invalid_totp')).toBe(false);
    expect(isServerLoginReason('server_error')).toBe(false);
    expect(isServerLoginReason('account_disabled')).toBe(true);
  });
});

describe('describeLoginFailure', () => {
  const t = jest.fn((key: string, options?: Record<string, unknown>) => `${key}${options ? JSON.stringify(options) : ''}`);

  it('maps a code to its title and message, with the minutes and the server', () => {
    expect(describeLoginFailure(t, { code: 'account_locked_out', lockoutMinutes: 5 }, 'Resgrid Europe')).toEqual({
      title: 'login.errors.account_locked_out.title',
      message: 'login.errors.account_locked_out.message{"minutes":5,"server":"Resgrid Europe"}',
    });
  });

  it('uses the administrator-lockout guidance when the lockout has no end', () => {
    expect(describeLoginFailure(t, { code: 'account_locked_out' }, 'x').title).toBe('login.errors.account_locked.title');
  });

  it('has a translation for every code in all ten languages (common namespace)', () => {
    const dir = join(__dirname, '..', '..', '..', 'i18n', 'src', 'translations', 'common');
    for (const language of ['ar', 'de', 'el', 'en', 'es', 'fr', 'it', 'pl', 'sv', 'uk']) {
      const tree = JSON.parse(readFileSync(join(dir, `${language}.json`), 'utf8')) as { login: { errors: Record<string, { title?: string; message?: string }> } };
      for (const key of [...ALL_CODES, 'account_locked']) {
        expect([language, key, typeof tree.login.errors[key]?.title, typeof tree.login.errors[key]?.message]).toEqual([language, key, 'string', 'string']);
      }
    }
  });
});

describe('MFA refusals', () => {
  it('reads the problem type, then the OAuth error, and the lock version', () => {
    expect(toMfaProblem(new ApiError({ kind: 'http', status: 400, data: { type: 'invalid_totp' } }))).toEqual({ code: 'invalid_totp', status: 400 });
    expect(toMfaProblem(axiosError(401, { error: 'shared_session_locked', lock_version: 4 }))).toEqual({ code: 'shared_session_locked', status: 401, lockVersion: 4 });
    expect(toMfaProblem(new ApiError({ kind: 'http', status: 500, data: '<html>' }))).toEqual({ code: 'unknown_error', status: 500 });
    expect(toMfaProblem(new ApiError({ kind: 'network' }))).toEqual({ code: 'network_error', status: null });
    expect(toMfaProblem(new Error('x'))).toEqual({ code: 'network_error', status: null });
  });

  it('knows which refusals end the sign-in', () => {
    expect(endsTransaction({ code: 'mfa_transaction_expired', status: 400 })).toBe(true);
    expect(endsTransaction({ code: 'invalid_totp', status: 400 })).toBe(false);
  });

  it('maps codes to translation keys and falls back for unknown ones', () => {
    expect(mfaErrorKey('invalid_totp')).toBe('mfa.errors.invalid_totp');
    expect(mfaErrorKey('weird')).toBe('mfa.errors.unknown_error');
    expect(mfaErrorKey(null)).toBe('mfa.errors.unknown_error');
    expect(isMfaErrorCode('sso_cancelled')).toBe(true);
    expect(isMfaErrorCode('The username or password is invalid.')).toBe(false);
  });
});

describe('token failure diagnostics never carry secrets', () => {
  it('keeps only known OAuth fields', () => {
    const error = new ApiError({
      kind: 'http',
      status: 400,
      data: {
        error: 'invalid_grant',
        error_description: 'The refresh token is no longer valid.',
        error_uri: 'https://documentation.openiddict.com/errors/ID2019',
        login_error: 'account_disabled',
        refresh_token: 'leaked?',
      },
    });
    const described = describeTokenFailure(error);
    expect(described).toEqual({ errorType: 'ApiError', kind: 'http', status: 400, oauthError: 'invalid_grant', oauthErrorId: 'ID2019', rejectionReason: 'refresh_token_no_longer_valid', loginError: 'account_disabled' });
    expect(JSON.stringify(described)).not.toContain('leaked');
  });

  it('drops unknown descriptions and errors', () => {
    expect(describeTokenFailure(new ApiError({ kind: 'http', status: 400, data: { error: 'made_up', error_description: 'user bob@example.com failed' } }))).toEqual({ errorType: 'ApiError', kind: 'http', status: 400 });
  });
});
