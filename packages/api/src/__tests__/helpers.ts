import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';

import { type ApiCache, createApiCache, createMemoryCacheStore } from '../core/cache';
import { createHttpClient, type HttpClient, type HttpClientOptions } from '../core/http-client';
import { type ApiContext, createApiContext } from '../core/request';

export const BASE_URL = 'https://api.example.com/api/v4';

export interface MockAuth {
  accessToken: string | null;
  active: boolean;
  expired: boolean;
}

export type AdapterMock = jest.Mock<Promise<AxiosResponse>, [InternalAxiosRequestConfig]>;

export const ok = (config: InternalAxiosRequestConfig, data: unknown = { Status: 'success', Data: [] }, status = 200, headers: Record<string, string> = {}): AxiosResponse => ({
  data,
  status,
  statusText: 'OK',
  headers,
  config,
});

export const httpError = (config: InternalAxiosRequestConfig, status: number, data?: unknown): AxiosError =>
  new AxiosError(`Request failed with status code ${status}`, status >= 500 ? 'ERR_BAD_RESPONSE' : 'ERR_BAD_REQUEST', config, undefined, { status, statusText: '', data, headers: {}, config } as AxiosResponse);

export const networkError = (config: InternalAxiosRequestConfig): AxiosError => new AxiosError('Network Error', 'ERR_NETWORK', config);

export const timeoutError = (config: InternalAxiosRequestConfig): AxiosError => new AxiosError('timeout of 15000ms exceeded', 'ECONNABORTED', config);

export interface TestClient {
  http: HttpClient;
  adapter: AdapterMock;
  auth: MockAuth;
  refresh: jest.Mock<Promise<boolean>, []>;
  onAuthRejected: jest.Mock;
}

/** An HTTP client whose transport is a jest mock (no network). Defaults: signed in with `access-token`. */
export const createTestClient = (overrides: Partial<HttpClientOptions> = {}): TestClient => {
  const auth: MockAuth = { accessToken: 'access-token', active: true, expired: false };
  const refresh = jest.fn<Promise<boolean>, []>(async () => {
    auth.accessToken = 'refreshed-token';
    auth.expired = false;
    return true;
  });
  const onAuthRejected = jest.fn();
  const http = createHttpClient({
    getBaseUrl: () => BASE_URL,
    getAccessToken: () => auth.accessToken,
    refreshAccessToken: refresh,
    onAuthRejected,
    isSessionActive: () => auth.active,
    isAccessTokenExpired: () => auth.expired,
    getHeaders: ({ anonymous }) => ({ 'X-Resgrid-Client': 'unit', 'X-Resgrid-App-Version': '10.0.0', 'X-Resgrid-Protected-Grant': anonymous ? undefined : 'grant-1', 'X-Empty': '' }),
    ...overrides,
  });
  const adapter: AdapterMock = jest.fn(async (config: InternalAxiosRequestConfig) => ok(config));
  http.axios.defaults.adapter = adapter as never;
  return { http, adapter, auth, refresh, onAuthRejected };
};

export interface TestContext extends TestClient {
  ctx: ApiContext;
  cache: ApiCache;
  store: ReturnType<typeof createMemoryCacheStore>;
  scope: { value: string };
}

export const createTestContext = (overrides: Partial<HttpClientOptions> = {}): TestContext => {
  const client = createTestClient(overrides);
  const store = createMemoryCacheStore();
  const scope = { value: `${BASE_URL}_dept1_user1` };
  const cache = createApiCache({ store, getScope: () => scope.value });
  return { ...client, store, scope, cache, ctx: createApiContext({ http: client.http, cache }) };
};

/** The last request the adapter saw. */
export const lastRequest = (adapter: AdapterMock): InternalAxiosRequestConfig => {
  const calls = adapter.mock.calls;
  if (!calls.length) {
    throw new Error('no request was sent');
  }
  return calls[calls.length - 1][0];
};

/** Full URL (path + query) of a captured request, without the base URL. */
export const urlOf = (config: InternalAxiosRequestConfig): string => config.url ?? '';
