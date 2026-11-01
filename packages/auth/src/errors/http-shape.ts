import { isApiError } from '@resgrid/api';

/**
 * What a failed request said, read by shape so an `ApiError` (what every `@resgrid/api` call throws), a raw axios
 * error or any `{ response: { status, data } }` is understood the same way.
 */
export interface HttpFailure {
  /** True when the server answered (status/data are meaningful). */
  answered: boolean;
  status: number | null;
  data: unknown;
}

export const httpFailureOf = (error: unknown): HttpFailure | null => {
  if (isApiError(error)) {
    return error.kind === 'http' ? { answered: true, status: error.status ?? null, data: error.data } : { answered: false, status: null, data: undefined };
  }
  if (typeof error !== 'object' || error === null) {
    return null;
  }
  const candidate = error as { isAxiosError?: unknown; response?: { status?: unknown; data?: unknown }; request?: unknown };
  if (candidate.response && typeof candidate.response === 'object') {
    return { answered: true, status: typeof candidate.response.status === 'number' ? candidate.response.status : null, data: candidate.response.data };
  }
  if (candidate.isAxiosError === true || candidate.request !== undefined) {
    return { answered: false, status: null, data: undefined };
  }
  return null;
};

/** The response body as a record, or null. */
export const bodyOf = (data: unknown): Record<string, unknown> | null => (typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : null);

/** The OAuth `error` in a token-endpoint answer. */
export const oauthErrorOf = (error: unknown): string | null => {
  const body = bodyOf(httpFailureOf(error)?.data);
  return typeof body?.error === 'string' ? body.error : null;
};
