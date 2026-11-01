import { type InternalAxiosRequestConfig } from 'axios';

import { BASE_URL, createTestClient, httpError, lastRequest, networkError, ok, timeoutError } from '../../__tests__/helpers';
import { ApiError, isNetworkError, isRetryableError, NoActiveSessionError } from '../api-error';
import { createHttpClient, DEFAULT_TIMEOUT_MS } from '../http-client';

const unauthorized = (config: InternalAxiosRequestConfig, data?: unknown) => httpError(config, 401, data);

describe('createHttpClient', () => {
  it('uses a 15 s default timeout and lets callers configure it', () => {
    const { http } = createTestClient();
    expect(DEFAULT_TIMEOUT_MS).toBe(15_000);
    expect(http.axios.defaults.timeout).toBe(15_000);
    expect(createTestClient({ timeoutMs: 5_000 }).http.axios.defaults.timeout).toBe(5_000);
  });

  it('resolves the base URL on every request (a server change applies at once)', async () => {
    let base = BASE_URL;
    const { http, adapter } = createTestClient({ getBaseUrl: () => base });
    await http.axios.get('/Calls/GetActiveCalls');
    base = 'https://other.example.com/api/v4';
    await http.axios.get('/Calls/GetActiveCalls');
    expect(adapter.mock.calls[0][0].baseURL).toBe(BASE_URL);
    expect(adapter.mock.calls[1][0].baseURL).toBe('https://other.example.com/api/v4');
  });

  it('sends the bearer token and the injected client headers, skipping empty values', async () => {
    const { http, adapter } = createTestClient();
    await http.axios.get('/Calls/GetActiveCalls');
    const headers = lastRequest(adapter).headers;
    expect(headers.Authorization).toBe('Bearer access-token');
    expect(headers['X-Resgrid-Client']).toBe('unit');
    expect(headers['X-Resgrid-App-Version']).toBe('10.0.0');
    expect(headers['X-Resgrid-Protected-Grant']).toBe('grant-1');
    expect(headers['X-Empty']).toBeUndefined();
    expect(headers['X-Resgrid-ApiKey']).toBeUndefined();
  });

  it('sends anonymous requests without a token or session-bound headers, even when signed out', async () => {
    const { http, adapter, auth } = createTestClient();
    auth.accessToken = null;
    auth.active = false;
    await http.axios.get('/Config/GetSystemConfig', { resgrid: { anonymous: true } } as never);
    const headers = lastRequest(adapter).headers;
    expect(headers.Authorization).toBeUndefined();
    expect(headers['X-Resgrid-Protected-Grant']).toBeUndefined();
    expect(headers['X-Resgrid-Client']).toBe('unit');
  });

  describe('session gating (Dispatch baseline)', () => {
    it('does not send a request once the session is gone', async () => {
      const { http, adapter, auth, refresh } = createTestClient();
      auth.accessToken = null;
      auth.active = false;
      await expect(http.axios.get('/CallPriorities/GetAllCallPriorites')).rejects.toBeInstanceOf(NoActiveSessionError);
      expect(adapter).not.toHaveBeenCalled();
      expect(refresh).not.toHaveBeenCalled();
    });

    it('does not attempt a refresh for a 401 that lands after sign-out', async () => {
      const { http, adapter, auth, refresh } = createTestClient();
      adapter.mockImplementation(async (config) => {
        auth.active = false;
        throw unauthorized(config);
      });
      await expect(http.axios.get('/Calls/GetActiveCalls')).rejects.toMatchObject({ kind: 'http', status: 401 });
      expect(refresh).not.toHaveBeenCalled();
      expect(adapter).toHaveBeenCalledTimes(1);
    });

    it('refreshes an expired restored session once before sending parallel requests', async () => {
      const { http, adapter, auth, refresh } = createTestClient();
      auth.expired = true;
      await Promise.all([http.axios.get('/Calls/GetActiveCalls'), http.axios.get('/Units/GetAllUnitsInfos')]);
      expect(refresh).toHaveBeenCalledTimes(1);
      expect(adapter).toHaveBeenCalledTimes(2);
      for (const [config] of adapter.mock.calls) {
        expect(config.headers.Authorization).toBe('Bearer refreshed-token');
      }
    });

    it('does not send protected requests when refreshing the restored session fails', async () => {
      const { http, adapter, auth, refresh } = createTestClient();
      auth.expired = true;
      refresh.mockResolvedValue(false);
      await expect(http.axios.get('/Calls/GetActiveCalls')).rejects.toBeInstanceOf(NoActiveSessionError);
      expect(adapter).not.toHaveBeenCalled();
    });
  });

  describe('401 handling', () => {
    it('refreshes and replays a 401 for a live session', async () => {
      const { http, adapter, refresh } = createTestClient();
      adapter.mockImplementationOnce(async (config) => {
        throw unauthorized(config);
      });
      await expect(http.axios.get('/Calls/GetActiveCalls')).resolves.toMatchObject({ status: 200 });
      expect(refresh).toHaveBeenCalledTimes(1);
      expect(adapter).toHaveBeenCalledTimes(2);
      expect(adapter.mock.calls[1][0].headers.Authorization).toBe('Bearer refreshed-token');
    });

    it('replays a delayed 401 with the newer token without rotating it again', async () => {
      const { http, adapter, auth, refresh } = createTestClient();
      adapter.mockImplementationOnce(async (config) => {
        // Another request (or the refresh timer) replaced the token while this one was in flight.
        auth.accessToken = 'rotated-elsewhere';
        throw unauthorized(config);
      });
      await expect(http.axios.get('/Calls/GetActiveCalls')).resolves.toMatchObject({ status: 200 });
      expect(refresh).not.toHaveBeenCalled();
      expect(adapter.mock.calls[1][0].headers.Authorization).toBe('Bearer rotated-elsewhere');
    });

    it('shares one refresh between parallel 401s (single flight) and replays each request once', async () => {
      const { http, adapter, auth, refresh } = createTestClient();
      refresh.mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        auth.accessToken = 'refreshed-token';
        return true;
      });
      // Requests that reach the server with the old token are rejected; the token only changes once the refresh lands.
      let pendingRejections = 3;
      adapter.mockImplementation(async (config) => {
        if (config.headers.Authorization === 'Bearer access-token') {
          await new Promise((resolve) => setTimeout(resolve, 0));
          pendingRejections -= 1;
          throw unauthorized(config);
        }
        return ok(config);
      });
      const results = await Promise.all([http.axios.get('/Calls/GetActiveCalls'), http.axios.get('/Units/GetAllUnitsInfos'), http.axios.get('/Groups/GetAllGroups')]);
      expect(results.map((result) => result.status)).toEqual([200, 200, 200]);
      expect(pendingRejections).toBe(0);
      expect(refresh).toHaveBeenCalledTimes(1);
      expect(adapter).toHaveBeenCalledTimes(6);
    });

    it('retries every parallel unauthorized request at most once', async () => {
      const { http, adapter, refresh } = createTestClient();
      adapter.mockImplementation(async (config) => {
        throw unauthorized(config);
      });
      const results = await Promise.allSettled([http.axios.get('/Calls/GetActiveCalls'), http.axios.get('/Units/GetAllUnitsInfos')]);
      expect(results.map((result) => result.status)).toEqual(['rejected', 'rejected']);
      expect(adapter).toHaveBeenCalledTimes(4);
      expect(refresh).toHaveBeenCalledTimes(1);
    });

    it('rejects with the 401 when the refresh fails, without looping', async () => {
      const logger = { warn: jest.fn() };
      const { http, adapter, refresh } = createTestClient({ logger });
      refresh.mockResolvedValue(false);
      adapter.mockImplementation(async (config) => {
        throw unauthorized(config);
      });
      await expect(http.axios.get('/Calls/GetActiveCalls?callId=1')).rejects.toMatchObject({ kind: 'http', status: 401 });
      expect(adapter).toHaveBeenCalledTimes(1);
      expect(logger.warn).toHaveBeenCalledWith('Request abandoned after token refresh failed', { path: '/Calls/GetActiveCalls' });
    });

    it('passes an application refusal (401 with a problem type) straight back: no refresh, no replay', async () => {
      const { http, adapter, refresh } = createTestClient();
      adapter.mockImplementation(async (config) => {
        throw unauthorized(config, { type: 'step_up_required', title: 'Step-up required' });
      });
      await expect(http.axios.get('/DataProtection/RequestGrant')).rejects.toMatchObject({ status: 401, problemType: 'step_up_required' });
      expect(refresh).not.toHaveBeenCalled();
      expect(adapter).toHaveBeenCalledTimes(1);
    });
  });

  describe('shared-device sessions', () => {
    it('reports a locked session (lock screen): no refresh, no replay', async () => {
      const { http, adapter, refresh, onAuthRejected } = createTestClient();
      adapter.mockImplementation(async (config) => {
        throw unauthorized(config, { error: 'shared_session_locked', lock_version: 12 });
      });
      await expect(http.axios.get('/Calls/GetActiveCalls')).rejects.toMatchObject({ status: 401, code: 'shared_session_locked' });
      expect(onAuthRejected).toHaveBeenCalledWith({ reason: 'shared_session_locked', lockVersion: 12 });
      expect(refresh).not.toHaveBeenCalled();
      expect(adapter).toHaveBeenCalledTimes(1);
    });

    it('reports an expired shift: no refresh', async () => {
      const { http, adapter, refresh, onAuthRejected } = createTestClient();
      adapter.mockImplementation(async (config) => {
        throw unauthorized(config, { error: 'shared_session_expired' });
      });
      await expect(http.axios.get('/Calls/GetActiveCalls')).rejects.toMatchObject({ code: 'shared_session_expired' });
      expect(onAuthRejected).toHaveBeenCalledWith({ reason: 'shared_session_expired' });
      expect(refresh).not.toHaveBeenCalled();
    });
  });

  describe('error classification', () => {
    it('classifies network errors and keeps the session', async () => {
      const { http, adapter, refresh } = createTestClient();
      adapter.mockImplementation(async (config) => {
        throw networkError(config);
      });
      const error = await http.axios.get('/Calls/GetActiveCalls?secret=1').catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ApiError);
      expect(error).toMatchObject({ kind: 'network', code: 'ERR_NETWORK', path: '/Calls/GetActiveCalls', method: 'GET' });
      expect(isNetworkError(error)).toBe(true);
      expect(isRetryableError(error)).toBe(true);
      expect(refresh).not.toHaveBeenCalled();
    });

    it('classifies timeouts', async () => {
      const { http, adapter } = createTestClient();
      adapter.mockImplementation(async (config) => {
        throw timeoutError(config);
      });
      await expect(http.axios.get('/Calls/GetActiveCalls')).rejects.toMatchObject({ kind: 'timeout' });
    });

    it('classifies 5xx as retryable and 4xx as final, with problem details', async () => {
      const { http, adapter } = createTestClient();
      adapter.mockImplementationOnce(async (config) => {
        throw httpError(config, 503);
      });
      const serverError = await http.axios.get('/Calls/GetActiveCalls').catch((e: unknown) => e);
      expect(isRetryableError(serverError)).toBe(true);

      adapter.mockImplementationOnce(async (config) => {
        throw httpError(config, 403, { type: 'records_module_disabled' });
      });
      const refusal = await http.axios.get('/Records/GetRecord').catch((e: unknown) => e);
      expect(refusal).toMatchObject({ kind: 'http', status: 403, problemType: 'records_module_disabled' });
      expect(isRetryableError(refusal)).toBe(false);
    });

    it('never carries the request body or headers in a serialized error', async () => {
      const { http, adapter } = createTestClient();
      adapter.mockImplementation(async (config) => {
        throw httpError(config, 400, { error: 'invalid_grant' });
      });
      const error = (await http.axios.post('/Calls/SaveCall', { Password: 'hunter2' }).catch((e: unknown) => e)) as ApiError;
      const serialized = JSON.stringify(error);
      expect(serialized).not.toContain('hunter2');
      expect(serialized).not.toContain('access-token');
      expect(error.code).toBe('invalid_grant');
    });

    it('classifies aborted requests as canceled', async () => {
      const http = createHttpClient({ getBaseUrl: () => BASE_URL, getAccessToken: () => 't', refreshAccessToken: async () => true });
      const controller = new AbortController();
      controller.abort();
      http.axios.defaults.adapter = (async (config: InternalAxiosRequestConfig) => ok(config)) as never;
      await expect(http.axios.get('/Calls/GetActiveCalls', { signal: controller.signal })).rejects.toMatchObject({ kind: 'canceled' });
    });
  });
});
