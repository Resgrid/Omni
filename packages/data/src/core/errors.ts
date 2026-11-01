import { isApiError, V4FailureError } from '@resgrid/api';

import { DataNotConfiguredError } from './runtime';

/**
 * Why a data operation failed, as a code the UI translates (`errors.data.<code>` in `common`).
 * Stores never call `translate()` and never keep raw server messages (omni-plan §5.2).
 */
export type DataErrorCode =
  /** No answer: offline, DNS, TLS, connection reset. */
  | 'network'
  | 'timeout'
  | 'canceled'
  /** Never sent: no signed-in session. */
  | 'no_session'
  /** 401 */
  | 'unauthorized'
  /** 403 */
  | 'forbidden'
  /** 404 (a v4 `not_found` envelope is an empty answer, not an error). */
  | 'not_found'
  /** 409 / 412: someone else changed the row. */
  | 'conflict'
  /** Other 4xx, or a v4 `failure` envelope: the server refused the request. */
  | 'rejected'
  /** 5xx */
  | 'server'
  /** The data layer was used before the app shell configured it. */
  | 'not_configured'
  | 'unknown';

export interface DataError {
  code: DataErrorCode;
  /** HTTP status when the server answered. */
  status?: number;
  /** RFC 7807 problem type (e.g. `records_module_disabled`) for callers that branch on it. */
  problemType?: string;
  /** Translation key for the UI: `errors.data.<code>`. */
  messageKey: string;
}

const statusCode = (status: number): DataErrorCode => {
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  if (status === 409 || status === 412) return 'conflict';
  if (status === 408) return 'timeout';
  if (status >= 500) return 'server';
  return 'rejected';
};

const make = (code: DataErrorCode, extra: Partial<DataError> = {}): DataError => ({ code, messageKey: `errors.data.${code}`, ...extra });

/** Maps anything thrown by `@resgrid/api` (or the data layer) to a translatable, body-free error. */
export function toDataError(error: unknown): DataError {
  if (error instanceof DataNotConfiguredError) return make('not_configured');
  if (error instanceof V4FailureError) return make('rejected');
  if (isApiError(error)) {
    switch (error.kind) {
      case 'network':
        return make('network');
      case 'timeout':
        return make('timeout');
      case 'canceled':
        return make('canceled');
      case 'no_session':
        return make('no_session');
      case 'http':
        return make(statusCode(error.status ?? 0), { status: error.status, problemType: error.problemType });
      default:
        return make('unknown');
    }
  }
  const status = (error as { response?: { status?: unknown } } | null)?.response?.status;
  if (typeof status === 'number') return make(statusCode(status), { status });
  return make('unknown');
}

/** True when the request never got an answer, so the write should wait in the outbox instead of failing. */
export function isConnectivityError(error: DataError): boolean {
  return error.code === 'network' || error.code === 'timeout';
}
