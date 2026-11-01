import axios, { type AxiosError, type AxiosInstance, type AxiosRequestConfig, type InternalAxiosRequestConfig, isAxiosError } from 'axios';

import { NoActiveSessionError, problemTypeOf, sanitizePath, toApiError } from './api-error';
import { sharedSession401 } from './shared-session';

/** Default request timeout. Every axios instance in Omni has one (AGENTS.md). */
export const DEFAULT_TIMEOUT_MS = 15_000;

/** Why the client stopped short of a request because of the session (raised through `onAuthRejected`). */
export type AuthRejection = { reason: 'shared_session_locked'; lockVersion: number | null } | { reason: 'shared_session_expired' };

export interface ApiLogger {
  warn(message: string, context?: Record<string, unknown>): void;
}

export interface HeaderContext {
  /** True for anonymous endpoints (system config, SSO discovery): no session-bound headers should be added. */
  anonymous: boolean;
}

export interface HttpClientOptions {
  /** Current API base, including `/api/v4` (e.g. `https://api.resgrid.com/api/v4`). Read on every request so a server change applies at once. */
  getBaseUrl: () => string;
  /** Current access token, or null when signed out. */
  getAccessToken: () => string | null | undefined;
  /**
   * Refreshes the access token; resolves true when a new token is available. The auth layer owns the refresh engine
   * (backoff, logout only when the token endpoint rejects the refresh with 400/401). The client additionally keeps a
   * single refresh in flight per instance.
   */
  refreshAccessToken: () => Promise<boolean>;
  /** Shared-device session refusals: locked → show the lock screen; expired → end the session. Never triggers a refresh. */
  onAuthRejected?: (rejection: AuthRejection) => void;
  /**
   * Extra headers per request: `X-Resgrid-Client`, `X-Resgrid-Device-*`, `X-Resgrid-App-Version`,
   * `X-Resgrid-Shared-Installation`, `X-Resgrid-Protected-Grant`. Empty/undefined values are skipped. Never return
   * `X-Resgrid-ApiKey` (integration keys; key + bearer = 403).
   */
  getHeaders?: (context: HeaderContext) => Record<string, string | null | undefined>;
  /**
   * False when there is no live session to act for (signed out, mid sign-out, no refresh token). Requests are then
   * skipped with {@link NoActiveSessionError} and 401s are not refreshed. Defaults to "has an access token".
   */
  isSessionActive?: () => boolean;
  /** True when the stored access token is known to be expired (restored or suspended session): refresh before sending. */
  isAccessTokenExpired?: () => boolean;
  timeoutMs?: number;
  logger?: ApiLogger;
}

/** Per-request flags carried on the axios config. */
export interface ResgridRequestMeta {
  /** Skip session gating and bearer auth (anonymous endpoints). */
  anonymous?: boolean;
  /** Set once the request was replayed after a 401, so it is retried at most once. */
  retried?: boolean;
  /** The access token this attempt was sent with. */
  token?: string;
}

export type ResgridRequestConfig = AxiosRequestConfig & { resgrid?: ResgridRequestMeta };

export interface HttpClient {
  /** The configured axios instance (interceptors installed). Endpoint functions go through `request()` instead. */
  readonly axios: AxiosInstance;
  /** The base URL requests currently go to. */
  getBaseUrl(): string;
}

const metaOf = (config: AxiosRequestConfig): ResgridRequestMeta => {
  const withMeta = config as ResgridRequestConfig;
  if (!withMeta.resgrid) {
    withMeta.resgrid = {};
  }
  return withMeta.resgrid;
};

/**
 * Creates the authenticated HTTP client for Core v4 (Dispatch's client structure, omni-plan §7.2):
 * - skips requests when there is no session ({@link NoActiveSessionError}, nothing is sent);
 * - refreshes first when the stored token is known to be expired;
 * - on 401, replays once with the newer token when another refresh already replaced the one the request used,
 *   otherwise runs one shared refresh and replays;
 * - never refreshes for a 401 carrying a problem `type` or a shared-session refusal (`shared_session_locked|expired`);
 * - converts every failure into an `ApiError` (no request bodies or tokens attached).
 *
 * It imports no store: token, refresh, base URL, headers and session state are injected (layering, omni-plan §5.2).
 */
export const createHttpClient = (options: HttpClientOptions): HttpClient => {
  const { getBaseUrl, getAccessToken, refreshAccessToken, onAuthRejected, getHeaders, isAccessTokenExpired, logger } = options;
  const isSessionActive = options.isSessionActive ?? (() => Boolean(getAccessToken()));

  const instance = axios.create({
    timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
  });

  let refreshInFlight: Promise<boolean> | null = null;
  const refreshOnce = (): Promise<boolean> => {
    if (!refreshInFlight) {
      refreshInFlight = Promise.resolve()
        .then(() => refreshAccessToken())
        .then((ok) => ok === true)
        .catch(() => false)
        .finally(() => {
          refreshInFlight = null;
        });
    }
    return refreshInFlight;
  };

  instance.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
    config.baseURL = getBaseUrl();
    const meta = metaOf(config);
    const anonymous = meta.anonymous === true;

    const extra = getHeaders?.({ anonymous }) ?? {};
    for (const [name, value] of Object.entries(extra)) {
      if (value !== undefined && value !== null && value !== '') {
        config.headers.set(name, value);
      }
    }

    if (anonymous) {
      config.headers.delete('Authorization');
      return config;
    }

    const path = sanitizePath(config.url);
    // Every endpoint reached this way is authenticated. Sending without a token is a guaranteed 401 that would drag a
    // refresh attempt (and possibly a logout) behind it — exactly what a screen unmounting after sign-out produces.
    if (!isSessionActive() || !getAccessToken()) {
      throw new NoActiveSessionError(path);
    }

    if (isAccessTokenExpired?.()) {
      if (!(await refreshOnce())) {
        throw new NoActiveSessionError(path);
      }
    }

    const token = getAccessToken();
    if (!token) {
      throw new NoActiveSessionError(path);
    }
    meta.token = token;
    config.headers.set('Authorization', `Bearer ${token}`);
    return config;
  });

  instance.interceptors.response.use(
    (response) => response,
    async (error: unknown) => {
      const axiosError = error as AxiosError;
      const config = isAxiosError(error) ? axiosError.config : undefined;
      if (!config) {
        return Promise.reject(toApiError(error));
      }
      const meta = metaOf(config);
      const status = axiosError.response?.status;

      if (status === 401 && !meta.anonymous) {
        // Shared-device session: locked means "unlock" and expired means "the shift ended" — never a refresh.
        const shared = sharedSession401(axiosError);
        if (shared) {
          onAuthRejected?.(shared.kind === 'locked' ? { reason: 'shared_session_locked', lockVersion: shared.lockVersion } : { reason: 'shared_session_expired' });
          return Promise.reject(toApiError(error));
        }

        // A 401 with a problem `type` is the application refusing this request (a wrong code, a session that ended),
        // not an expired token. Refreshing and replaying would count a wrong code twice.
        if (problemTypeOf(axiosError.response?.data)) {
          return Promise.reject(toApiError(error));
        }

        if (!meta.retried && isSessionActive()) {
          // At most one replay per request, including requests that waited on someone else's refresh.
          meta.retried = true;
          const current = getAccessToken();
          if (current && meta.token && current !== meta.token) {
            // A delayed 401 for a token another refresh already replaced: replay with the new one, don't rotate again.
            return instance.request(config);
          }

          const refreshed = await refreshOnce();
          if (refreshed && getAccessToken()) {
            return instance.request(config);
          }
          logger?.warn('Request abandoned after token refresh failed', { path: sanitizePath(config.url) });
        }
      }

      return Promise.reject(toApiError(error));
    }
  );

  return {
    axios: instance,
    getBaseUrl,
  };
};
