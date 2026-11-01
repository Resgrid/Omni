/**
 * Request error classification (omni-plan: Responder lib/request-errors.ts + Unit utils/network.ts in one module).
 * Errors are read by shape, so any HTTP client error with `response.status` works and this module does not
 * depend on axios.
 *
 * Callers use it to decide: log at warn (expected connectivity trouble, not a Sentry issue) vs error; retry later
 * vs drop the outbox item; and — for the token endpoint only — whether a refresh failure means sign-out.
 */

export type RequestErrorKind =
  /** The caller aborted the request. */
  | 'cancelled'
  /** The client timeout fired before an answer arrived. */
  | 'timeout'
  /** No HTTP answer at all: offline, DNS/TLS failure, background network restriction. */
  | 'network'
  /** 401, or a 400/401 OAuth `invalid_grant`: the server rejected the credentials. */
  | 'auth_rejected'
  /** 408, 429, 502, 503, 504: the API was unreachable behind its gateway or asked to be retried later. */
  | 'transient'
  /** Any other 4xx: the API refused the request and will refuse the same payload again. */
  | 'client'
  /** Any other 5xx. */
  | 'server'
  /** Not an HTTP error (a programming error, a failure before the request was sent). */
  | 'unknown';

interface HttpErrorLike {
  isAxiosError?: boolean;
  name?: string;
  code?: string;
  message?: string;
  request?: unknown;
  response?: { status?: unknown; data?: unknown };
}

const asHttpError = (error: unknown): HttpErrorLike | null => (typeof error === 'object' && error !== null ? (error as HttpErrorLike) : null);

const TRANSIENT_HTTP_STATUSES = new Set([408, 429, 502, 503, 504]);
const TIMEOUT_CODES = new Set(['ECONNABORTED', 'ETIMEDOUT']);
const NETWORK_CODES = new Set(['ERR_NETWORK', 'ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'EAI_AGAIN', 'ENETUNREACH']);

/** The HTTP status the error carries, or null when the request never got an answer. */
export const getResponseStatus = (error: unknown): number | null => {
  const status = asHttpError(error)?.response?.status;
  return typeof status === 'number' ? status : null;
};

export const isCancelledError = (error: unknown): boolean => {
  const e = asHttpError(error);
  return !!e && (e.code === 'ERR_CANCELED' || e.name === 'CanceledError' || e.name === 'AbortError');
};

export const isTimeoutError = (error: unknown): boolean => {
  const e = asHttpError(error);
  if (!e || getResponseStatus(error) !== null) return false;
  return (typeof e.code === 'string' && TIMEOUT_CODES.has(e.code)) || (typeof e.message === 'string' && /timeout/i.test(e.message) && (e.isAxiosError === true || e.request != null));
};

/**
 * Transient connectivity failure with no HTTP answer: offline, DNS/TLS failure, timeout, or a background
 * cold launch with restricted network (Unit). A failure before the request was ever sent (no `request`) is NOT a
 * network error, so genuine client bugs still surface.
 */
export const isNetworkError = (error: unknown): boolean => {
  const e = asHttpError(error);
  if (!e || isCancelledError(error) || getResponseStatus(error) !== null) return false;
  if (typeof e.code === 'string' && (NETWORK_CODES.has(e.code) || TIMEOUT_CODES.has(e.code))) return true;
  return e.request != null;
};

/** The request never reached a working API, so sending the same payload later can succeed (Responder). */
export const isConnectivityError = (error: unknown): boolean => {
  if (isCancelledError(error)) return false;
  const status = getResponseStatus(error);
  return status === null ? isNetworkError(error) : TRANSIENT_HTTP_STATUSES.has(status);
};

/** The API refused the request (4xx other than 408/429) and will refuse the same payload again (Responder). */
export const isClientRejection = (error: unknown): boolean => {
  const status = getResponseStatus(error);
  return status !== null && status >= 400 && status < 500 && !TRANSIENT_HTTP_STATUSES.has(status);
};

export const isServerError = (error: unknown): boolean => {
  const status = getResponseStatus(error);
  return status !== null && status >= 500;
};

const oauthError = (error: unknown): string | null => {
  const data = asHttpError(error)?.response?.data;
  if (typeof data !== 'object' || data === null) return null;
  const value = (data as { error?: unknown }).error;
  return typeof value === 'string' ? value : null;
};

/**
 * The token endpoint rejected the refresh token: a 400 or 401 whose OAuth body says `invalid_grant` (Unit).
 * This is the ONLY failure that may sign the user out; offline, timeouts, 5xx, 429 and other OAuth errors keep the
 * session (AGENTS.md). Check shared-session lock responses first — a locked shared session is also refused with
 * `invalid_grant`.
 */
export const isRefreshCredentialRejection = (error: unknown): boolean => {
  const status = getResponseStatus(error);
  return (status === 400 || status === 401) && oauthError(error) === 'invalid_grant';
};

/** The server rejected the request's credentials: any 401, or a 400 `invalid_grant`. */
export const isAuthRejection = (error: unknown): boolean => {
  const status = getResponseStatus(error);
  return status === 401 || (status === 400 && oauthError(error) === 'invalid_grant');
};

export function classifyRequestError(error: unknown): RequestErrorKind {
  if (isCancelledError(error)) return 'cancelled';
  const status = getResponseStatus(error);
  if (status === null) {
    if (isTimeoutError(error)) return 'timeout';
    return isNetworkError(error) ? 'network' : 'unknown';
  }
  if (isAuthRejection(error)) return 'auth_rejected';
  if (TRANSIENT_HTTP_STATUSES.has(status)) return 'transient';
  if (status >= 400 && status < 500) return 'client';
  if (status >= 500) return 'server';
  return 'unknown';
}

/** Worth retrying later with the same payload: network, timeout, transient statuses and other 5xx. */
export const isRetryableRequestError = (error: unknown): boolean => {
  const kind = classifyRequestError(error);
  return kind === 'network' || kind === 'timeout' || kind === 'transient' || kind === 'server';
};
