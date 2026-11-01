import type { LogContext } from './types';

// Logging and telemetry rules (AGENTS.md, resgrid-auth-security): never log passwords, tokens, login responses,
// usernames or protected (ADP) values. IC's sanitizer is the baseline; it runs before the console transport and
// before anything reaches Sentry.

// Substring match: any context key CONTAINING one of these fragments is redacted. This catches camelCase and
// snake_case variants (accessToken, refresh_token, id_token, ...) without enumerating every spelling.
const SENSITIVE_KEY_PARTS = [
  'token',
  'password',
  'passwd',
  'passcode',
  'secret',
  'apikey',
  'api_key',
  'authorization',
  'cred',
  'email',
  'ssn',
  'saml',
  'cookie',
  'session',
  'username',
  'grant',
  'protected',
  'privatekey',
  'private_key',
  'codeverifier',
  'code_verifier',
];

// Exact-match keys too short to match as fragments without redacting unrelated words (author, authority, mapPin).
const SENSITIVE_EXACT_KEYS = new Set(['auth', 'pin', 'otp', 'login', 'loginresponse', 'login_response']);

export const REDACTED = '[REDACTED]';

export const isSensitiveKey = (key: string): boolean => {
  const lower = key.toLowerCase();
  return SENSITIVE_EXACT_KEYS.has(lower) || SENSITIVE_KEY_PARTS.some((part) => lower.includes(part));
};

// C0/C1 control characters except tab and newline. ANSI colour codes (ESC = 0x1B) in console output end up in
// Sentry breadcrumbs, and the native SentryCrash JSON codec rejects them ("Invalid character in ...") —
// Responder's reason for a colourless transport.
const CONTROL_CHARACTERS = /\u001b\[[0-9;?]*[ -/]*[@-~]|[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g;

export const stripControlCharacters = (value: string): string => value.replace(CONTROL_CHARACTERS, '');

// Credentials and identities that show up inside free text: bearer headers and token/password/username query or
// form parameters (a urlencoded sign-in body carries all three).
const BEARER = /\b(Bearer|Basic)\s+[A-Za-z0-9\-._~+/]+=*/gi;
const SECRET_PARAMS = /\b(access_token|refresh_token|id_token|token|password|username|email|client_secret|code_verifier|otp)=([^&\s"']+)/gi;

/** Removes control characters and inline credentials from a string. */
export const scrubText = (value: string): string =>
  stripControlCharacters(value)
    .replace(BEARER, (_m, scheme: string) => `${scheme} ${REDACTED}`)
    .replace(SECRET_PARAMS, (_m, name: string) => `${name}=${REDACTED}`);

/** Strips query string and hash — URLs can carry credentials (e.g. access_token params). */
export const sanitizeUrl = (url: unknown): string | undefined => {
  if (typeof url !== 'string' || url.length === 0) return undefined;
  return url.split('?')[0].split('#')[0];
};

interface AxiosErrorLike {
  isAxiosError?: boolean;
  name?: string;
  message?: string;
  code?: string;
  config?: { method?: string; url?: string; baseURL?: string };
  response?: { status?: number };
}

// Axios errors carry the full request (including urlencoded password/token bodies in config.data) and response
// objects with circular references. Never forward them raw — reduce them to a safe summary.
export const isAxiosErrorLike = (value: unknown): value is AxiosErrorLike => typeof value === 'object' && value !== null && ((value as AxiosErrorLike).isAxiosError === true || ('config' in value && 'message' in value));

export const summarizeAxiosError = (error: AxiosErrorLike): Record<string, unknown> => ({
  name: error.name,
  message: typeof error.message === 'string' ? scrubText(error.message) : error.message,
  code: error.code,
  status: error.response?.status,
  method: error.config?.method,
  url: sanitizeUrl(error.config?.url),
  baseURL: sanitizeUrl(error.config?.baseURL),
  isAxiosError: true,
});

const sanitizeValue = (key: string, value: unknown, depth: number): unknown => {
  if (key && isSensitiveKey(key)) return REDACTED;
  if (isAxiosErrorLike(value)) return summarizeAxiosError(value);
  // Error instances have non-enumerable props; Object.keys() would yield {}.
  if (value instanceof Error) return { name: value.name, message: scrubText(value.message), stack: value.stack };
  if (typeof value === 'string') return scrubText(value);
  if (value !== null && typeof value === 'object' && !(value instanceof Date)) {
    // Past the depth limit the keys go unchecked, so a nested credential would pass through: drop the value instead.
    if (depth <= 0) return Array.isArray(value) ? '[Array]' : '[Object]';
    // Array elements are checked like object values, so { items: [{ accessToken }] } is redacted too.
    if (Array.isArray(value)) return value.map((item) => sanitizeValue('', item, depth - 1));
    return sanitizeObject(value as Record<string, unknown>, depth - 1);
  }
  if (typeof value === 'function' || typeof value === 'symbol') return String(value);
  return value;
};

const sanitizeObject = (obj: Record<string, unknown>, depth: number): Record<string, unknown> => {
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(obj)) result[key] = sanitizeValue(key, obj[key], depth);
  return result;
};

/** Redacts sensitive keys (two levels deep), summarises axios errors, expands Errors and scrubs strings. */
export const sanitizeLogContext = (context: LogContext | undefined | null): LogContext => {
  if (!context) return {};
  return sanitizeObject(context as Record<string, unknown>, 2);
};

/** Log messages are free text: scrub credentials and control characters. */
export const sanitizeLogMessage = (message: unknown): string => scrubText(String(message ?? ''));

/**
 * Rebuilds a bare Error carrying only name, message and stack, so Sentry groups by the real exception without
 * serialising the original's enumerable properties (an AxiosError's `config.data` holds credentials).
 */
export const toCaptureableError = (value: unknown): Error | null => {
  if (!(value instanceof Error)) return null;
  const stripped = new Error(scrubText(value.message));
  stripped.name = value.name;
  stripped.stack = value.stack;
  return stripped;
};
