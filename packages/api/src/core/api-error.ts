import { isAxiosError } from 'axios';

/** Problem `type` values Core uses for application-level refusals (RFC 7807 bodies). */
export const ProblemTypes = {
  RecordsModuleDisabled: 'records_module_disabled',
  UnitAlertNoteRequired: 'unit_alert_note_required',
  StepUpRequired: 'step_up_required',
  GrantExpired: 'grant_expired',
  UpgradeRequired: 'upgrade_required',
  ProtectedAccessDenied: 'protected_access_denied',
} as const;

/** OAuth-style `error` codes the API puts in 4xx bodies that the client reacts to. */
export const ApiErrorCodes = {
  SharedSessionLocked: 'shared_session_locked',
  SharedSessionExpired: 'shared_session_expired',
  DepartmentLocked: 'department_locked',
} as const;

/**
 * How a request failed:
 * - `http`: the server answered with a non-2xx status;
 * - `network`: no answer (offline, DNS, TLS, connection reset);
 * - `timeout`: no answer within the client timeout;
 * - `canceled`: aborted by the caller;
 * - `no_session`: never sent because there is no signed-in session;
 * - `unknown`: anything else (a bug, a malformed response).
 */
export type ApiErrorKind = 'http' | 'network' | 'timeout' | 'canceled' | 'no_session' | 'unknown';

export interface ApiErrorInit {
  kind: ApiErrorKind;
  message?: string;
  status?: number;
  problemType?: string;
  code?: string;
  method?: string;
  path?: string;
  data?: unknown;
  cause?: unknown;
}

/**
 * Error raised by every `@resgrid/api` call. It deliberately carries no request body, headers or query string, so it
 * is safe to log and to report (passwords and tokens never ride along). `data` is the *response* body for callers that
 * need server detail (MFA errors, problem details); do not send it to telemetry.
 */
export class ApiError extends Error {
  public readonly kind: ApiErrorKind;
  /** HTTP status when the server answered. */
  public readonly status?: number;
  /** RFC 7807 problem `type` from the response body (e.g. `records_module_disabled`). */
  public readonly problemType?: string;
  /** Response body `error` code (e.g. `shared_session_locked`), else the transport code (`ERR_NETWORK`, `ECONNABORTED`). */
  public readonly code?: string;
  public readonly method?: string;
  /** Request path without query string or host. */
  public readonly path?: string;
  public readonly data?: unknown;
  public override readonly cause?: unknown;

  constructor(init: ApiErrorInit) {
    super(init.message ?? defaultMessage(init));
    this.name = 'ApiError';
    this.kind = init.kind;
    this.status = init.status;
    this.problemType = init.problemType;
    this.code = init.code;
    this.method = init.method;
    this.path = init.path;
    this.data = init.data;
    this.cause = init.cause;
  }

  /** Safe, body-free representation for logs and telemetry. */
  toJSON(): Record<string, unknown> {
    return { name: this.name, kind: this.kind, status: this.status, problemType: this.problemType, code: this.code, method: this.method, path: this.path, message: this.message };
  }
}

/**
 * Raised instead of sending a request that has no session behind it. Callers can tell this apart from a server
 * rejection: nothing was sent and nothing is wrong with the request (typically a screen unmounting after sign-out).
 */
export class NoActiveSessionError extends ApiError {
  constructor(path?: string) {
    super({ kind: 'no_session', path, message: `Request to ${path ?? 'the API'} skipped: no active session` });
    this.name = 'NoActiveSessionError';
  }
}

function defaultMessage(init: ApiErrorInit): string {
  switch (init.kind) {
    case 'http':
      return `Request failed with status ${init.status ?? 'unknown'}`;
    case 'network':
      return 'Network error';
    case 'timeout':
      return 'Request timed out';
    case 'canceled':
      return 'Request canceled';
    case 'no_session':
      return 'No active session';
    default:
      return 'Request failed';
  }
}

/** Strips host and query string so a URL is safe to log. */
export const sanitizePath = (url?: string): string | undefined => {
  if (!url) {
    return undefined;
  }
  const withoutQuery = url.split('?')[0].split('#')[0];
  return withoutQuery.replace(/^[a-z]+:\/\/[^/]+/i, '');
};

const bodyString = (data: unknown, key: string): string | undefined => {
  if (typeof data !== 'object' || data === null) {
    return undefined;
  }
  const value = (data as Record<string, unknown>)[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
};

/** The RFC 7807 problem `type` of a response body, when it has one. */
export const problemTypeOf = (data: unknown): string | undefined => bodyString(data, 'type');

const TIMEOUT_CODES = new Set(['ECONNABORTED', 'ETIMEDOUT']);

/** Converts anything thrown by axios (or an interceptor) into an {@link ApiError}. Never copies request data. */
export const toApiError = (error: unknown): ApiError => {
  if (error instanceof ApiError) {
    return error;
  }
  if (isAxiosError(error)) {
    const method = error.config?.method?.toUpperCase();
    const path = sanitizePath(error.config?.url);
    if (error.code === 'ERR_CANCELED') {
      return new ApiError({ kind: 'canceled', method, path, code: error.code, cause: error });
    }
    if (error.response) {
      const data: unknown = error.response.data;
      return new ApiError({
        kind: 'http',
        status: error.response.status,
        problemType: problemTypeOf(data),
        code: bodyString(data, 'error') ?? error.code,
        method,
        path,
        data,
        cause: error,
      });
    }
    if ((error.code && TIMEOUT_CODES.has(error.code)) || /timeout/i.test(error.message)) {
      return new ApiError({ kind: 'timeout', method, path, code: error.code, cause: error });
    }
    return new ApiError({ kind: 'network', method, path, code: error.code ?? 'ERR_NETWORK', cause: error });
  }
  if (typeof error === 'object' && error !== null && (error as { name?: unknown }).name === 'CanceledError') {
    return new ApiError({ kind: 'canceled', cause: error });
  }
  return new ApiError({ kind: 'unknown', message: error instanceof Error ? error.message : 'Request failed', cause: error });
};

export const isApiError = (error: unknown): error is ApiError => error instanceof ApiError;

/** No answer from the server (offline, timeout). The request may still have reached Core — writes complete server-side. */
export const isNetworkError = (error: unknown): boolean => {
  const kind = toApiError(error).kind;
  return kind === 'network' || kind === 'timeout';
};

/** Worth retrying later (network, timeout, 5xx, 429). 4xx answers are final. */
export const isRetryableError = (error: unknown): boolean => {
  const apiError = toApiError(error);
  if (apiError.kind === 'network' || apiError.kind === 'timeout') {
    return true;
  }
  return apiError.kind === 'http' && apiError.status !== undefined && (apiError.status >= 500 || apiError.status === 429);
};

export const hasProblemType = (error: unknown, problemType: string): boolean => toApiError(error).problemType === problemType;
