import {
  classifyRequestError,
  getResponseStatus,
  isAuthRejection,
  isCancelledError,
  isClientRejection,
  isConnectivityError,
  isNetworkError,
  isRefreshCredentialRejection,
  isRetryableRequestError,
  isServerError,
  isTimeoutError,
} from '../request-errors';

const httpError = (status: number, data?: unknown) => Object.assign(new Error(`Request failed with status code ${status}`), { isAxiosError: true, request: {}, response: { status, data } });
const noResponse = (code?: string, message = 'Network Error') => Object.assign(new Error(message), { isAxiosError: true, code, request: {} });

describe('request error classification', () => {
  it('reads the HTTP status by shape', () => {
    expect(getResponseStatus(httpError(404))).toBe(404);
    expect(getResponseStatus(noResponse('ERR_NETWORK'))).toBeNull();
    expect(getResponseStatus(null)).toBeNull();
    expect(getResponseStatus({ response: { status: '500' } })).toBeNull();
  });

  it('classifies network failures (offline, DNS/TLS) as network', () => {
    expect(classifyRequestError(noResponse('ERR_NETWORK'))).toBe('network');
    expect(classifyRequestError(noResponse(undefined))).toBe('network');
    expect(isNetworkError(noResponse('ERR_NETWORK'))).toBe(true);
  });

  it('classifies client timeouts as timeout (and as a network error, as Unit did)', () => {
    const timeout = noResponse('ECONNABORTED', 'timeout of 15000ms exceeded');
    expect(classifyRequestError(timeout)).toBe('timeout');
    expect(isTimeoutError(timeout)).toBe(true);
    expect(isNetworkError(timeout)).toBe(true);
  });

  it('does not treat a failure before the request was sent as a network error (Unit)', () => {
    const setupBug = Object.assign(new Error('Invalid URL'), { isAxiosError: true });
    expect(isNetworkError(setupBug)).toBe(false);
    expect(classifyRequestError(setupBug)).toBe('unknown');
    expect(classifyRequestError(new TypeError('x is undefined'))).toBe('unknown');
  });

  it('classifies cancellation', () => {
    expect(classifyRequestError(Object.assign(new Error('canceled'), { code: 'ERR_CANCELED', name: 'CanceledError' }))).toBe('cancelled');
    expect(isCancelledError(Object.assign(new Error('aborted'), { name: 'AbortError' }))).toBe(true);
    expect(isConnectivityError(Object.assign(new Error('canceled'), { code: 'ERR_CANCELED', request: {} }))).toBe(false);
  });

  it('separates transient statuses, other 4xx and 5xx', () => {
    for (const status of [408, 429, 502, 503, 504]) expect(classifyRequestError(httpError(status))).toBe('transient');
    for (const status of [400, 403, 404, 409, 422]) expect(classifyRequestError(httpError(status))).toBe('client');
    for (const status of [500, 501, 505]) expect(classifyRequestError(httpError(status))).toBe('server');
  });

  it('flags auth rejections: any 401, or a 400 invalid_grant', () => {
    expect(classifyRequestError(httpError(401))).toBe('auth_rejected');
    expect(classifyRequestError(httpError(400, { error: 'invalid_grant' }))).toBe('auth_rejected');
    expect(isAuthRejection(httpError(400, { error: 'invalid_request' }))).toBe(false);
  });

  it('only treats a 400/401 invalid_grant from the token endpoint as a dead refresh token (never 5xx or offline)', () => {
    expect(isRefreshCredentialRejection(httpError(400, { error: 'invalid_grant' }))).toBe(true);
    expect(isRefreshCredentialRejection(httpError(401, { error: 'invalid_grant' }))).toBe(true);
    expect(isRefreshCredentialRejection(httpError(400, { error: 'invalid_client' }))).toBe(false);
    expect(isRefreshCredentialRejection(httpError(401, '<html>proxy</html>'))).toBe(false);
    expect(isRefreshCredentialRejection(httpError(500, { error: 'invalid_grant' }))).toBe(false);
    expect(isRefreshCredentialRejection(httpError(502))).toBe(false);
    expect(isRefreshCredentialRejection(noResponse('ERR_NETWORK'))).toBe(false);
    expect(isRefreshCredentialRejection(new Error('no refresh token available'))).toBe(false);
  });

  it('keeps the Responder outbox helpers', () => {
    expect(isConnectivityError(noResponse('ERR_NETWORK'))).toBe(true);
    expect(isConnectivityError(httpError(503))).toBe(true);
    expect(isConnectivityError(httpError(400))).toBe(false);
    expect(isClientRejection(httpError(422))).toBe(true);
    expect(isClientRejection(httpError(429))).toBe(false);
    expect(isClientRejection(httpError(500))).toBe(false);
    expect(isServerError(httpError(500))).toBe(true);
  });

  it('marks retryable failures', () => {
    expect(isRetryableRequestError(noResponse('ERR_NETWORK'))).toBe(true);
    expect(isRetryableRequestError(httpError(503))).toBe(true);
    expect(isRetryableRequestError(httpError(500))).toBe(true);
    expect(isRetryableRequestError(httpError(400))).toBe(false);
    expect(isRetryableRequestError(httpError(401))).toBe(false);
  });
});
