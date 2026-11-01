import { isSharedSessionLockedRefresh } from '@resgrid/api';

import { bodyOf, httpFailureOf } from '../errors/http-shape';
import { authLogger, describeError } from '../runtime/logger';
import type { AuthResponse } from './types';

// ---------------------------------------------------------------------------------------------------------------------
// The one token-refresh engine (omni-plan §7.3): Dispatch's engine — single-flight, proactive timer with a half-lifetime
// floor, transient retries backing off 5 s → 60 s, results discarded when the session changed while the request was out,
// injected handlers so there is no import cycle — with Unit's rule: the session ends ONLY when the token endpoint rejects
// the refresh token with a 400/401 `invalid_grant`. Offline, timeouts, 5xx, 429, a proxy's error page and every other
// OAuth error keep the session and retry (R logged out on 500, IC on any 5xx, BigBoard on any failure — fatal for an
// unattended wall display).
// ---------------------------------------------------------------------------------------------------------------------

/** Refresh this long before the access token expires… */
export const REFRESH_BUFFER_MS = 60_000;
/** …but never sooner than this after scheduling. */
export const MIN_REFRESH_DELAY_MS = 5_000;
export const TRANSIENT_RETRY_BASE_MS = 5_000;
export const TRANSIENT_RETRY_MAX_MS = 60_000;
/** setTimeout's ceiling; a 365-day refresh token must not overflow the proactive timer. */
const MAX_TIMER_DELAY_MS = 0x7fffffff;

/**
 * Whether the token endpoint rejected the refresh token itself: a 400 or 401 whose OAuth body says `invalid_grant`, which
 * is how OpenIddict answers a refresh token it no longer honours (expired, revoked, already rotated). Only this ends the
 * session. Check {@link isSharedSessionLockedRefresh} first: a locked shared session is refused with the same error.
 */
export const isRefreshCredentialRejection = (error: unknown): boolean => {
  const failure = httpFailureOf(error);
  if (!failure?.answered || (failure.status !== 400 && failure.status !== 401)) {
    return false;
  }
  return bodyOf(failure.data)?.error === 'invalid_grant';
};

/**
 * When to refresh a token that lives `expiresInSeconds`: one buffer before expiry, but never earlier than half the
 * lifetime (the server's lifetime is configurable down to one minute, which equals the buffer and would otherwise refresh
 * in a tight loop), and never below the minimum delay.
 */
export const refreshDelayMs = (expiresInSeconds: number): number => {
  const lifetimeMs = Math.max(0, expiresInSeconds) * 1000;
  return Math.min(Math.max(lifetimeMs - REFRESH_BUFFER_MS, lifetimeMs / 2, MIN_REFRESH_DELAY_MS), MAX_TIMER_DELAY_MS);
};

/** The delay the n-th consecutive transient failure waits before retrying: 5 s, 10 s, 20 s, 40 s, 60 s, 60 s, … */
export const transientRetryDelayMs = (failures: number): number => Math.min(TRANSIENT_RETRY_BASE_MS * 2 ** Math.max(0, failures - 1), TRANSIENT_RETRY_MAX_MS);

export interface TokenRefreshHandlers {
  /** Sends the refresh grant (with the variant's client_id). */
  requestRefresh: (refreshToken: string) => Promise<AuthResponse>;
  getRefreshToken: () => string | null;
  /** Applies a new token response. Throw to refuse one that raced sign-out (it is then discarded, not retried). */
  applyAuthResponse: (response: AuthResponse) => void;
  /** The token endpoint rejected the refresh token (400/401 invalid_grant): the session is over. */
  onCredentialRejected: () => void;
  /** There is no refresh token at all: nothing can renew the session. Defaults to `onCredentialRejected`. */
  onNoRefreshToken?: () => void;
  /** The refresh was refused because the shared session is locked: show the lock screen, keep the tokens. */
  onSharedSessionLocked?: () => void;
  /** A transient failure (the session is kept); `retryInMs` is when the engine tries again. */
  onTransientFailure?: (failures: number, retryInMs: number) => void;
}

export interface TokenRefreshEngine {
  /** Single-flight refresh shared by the proactive timer, the HTTP client's 401 handling and SignalR reconnects. */
  refresh(): Promise<boolean>;
  /** After a fresh token (sign-in or a refresh that got through): ends any retry sequence and schedules the next refresh. */
  schedule(expiresInSeconds: number): void;
  /** Runs a refresh after `delayMs` (0: on the next tick), replacing any scheduled one. */
  refreshSoon(delayMs?: number): void;
  /** Cancels the scheduled refresh (a locked shared session; the unlock refreshes again). */
  cancel(): void;
  /** Sign-out or a new sign-in: cancels, resets the backoff, and discards any refresh still in flight. */
  endSession(): void;
  isScheduled(): boolean;
  isRefreshing(): boolean;
  transientFailures(): number;
}

export function createTokenRefreshEngine(handlers: TokenRefreshHandlers): TokenRefreshEngine {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inFlight: Promise<boolean> | null = null;
  let failures = 0;
  let generation = 0;

  const cancel = (): void => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const setTimer = (delayMs: number): void => {
    cancel();
    timer = setTimeout(
      () => {
        timer = null;
        void refresh();
      },
      Math.min(Math.max(0, delayMs), MAX_TIMER_DELAY_MS)
    );
  };

  const scheduleTransientRetry = (): number => {
    failures += 1;
    const delay = transientRetryDelayMs(failures);
    setTimer(delay);
    return delay;
  };

  const run = async (startedGeneration: number): Promise<boolean> => {
    const refreshToken = handlers.getRefreshToken();
    if (!refreshToken) {
      authLogger.warn({ message: 'Token refresh skipped: no refresh token available' });
      cancel();
      (handlers.onNoRefreshToken ?? handlers.onCredentialRejected)();
      return false;
    }

    // A sign-out or a new sign-in can replace the session while the request is out; its result must never overwrite
    // or end the newer session.
    const superseded = (): boolean => startedGeneration !== generation || handlers.getRefreshToken() !== refreshToken;

    let response: AuthResponse;
    try {
      response = await handlers.requestRefresh(refreshToken);
    } catch (error) {
      if (superseded()) {
        return false;
      }
      if (isSharedSessionLockedRefresh(error)) {
        // A locked shared session (passkey plan section 10.5): the tokens stay, the lock screen unlocks the same session,
        // and the refresh runs again after the unlock. Never a sign-out.
        authLogger.info({ message: 'Token refresh waits for the shared session to unlock' });
        cancel();
        handlers.onSharedSessionLocked?.();
        return false;
      }
      if (isRefreshCredentialRejection(error)) {
        // How a session ends normally: the refresh token expired or was revoked. Not an error worth reporting.
        authLogger.warn({ message: 'Token refresh rejected by the token endpoint; ending the session', context: describeError(error) });
        cancel();
        handlers.onCredentialRejected();
        return false;
      }
      // Everything else says nothing about the token: keep it and try again shortly. Callers still get `false` for this
      // attempt, so the request that needed a fresh token fails on its own without taking the session down with it.
      const retryInMs = scheduleTransientRetry();
      authLogger.warn({ message: 'Token refresh failed; keeping the session and retrying', context: { ...describeError(error), attempt: failures, retryInMs } });
      handlers.onTransientFailure?.(failures, retryInMs);
      return false;
    }

    if (superseded()) {
      return false;
    }
    try {
      handlers.applyAuthResponse(response);
    } catch {
      // A verdict, not an outage: the session ended while the request was out. Nothing is retried or rescheduled.
      authLogger.info({ message: 'Token refresh completed after the session ended; discarded' });
      cancel();
      return false;
    }
    schedule(response.expires_in);
    return true;
  };

  const refresh = (): Promise<boolean> => {
    if (inFlight) {
      return inFlight;
    }
    const operation = run(generation).catch((error: unknown) => {
      authLogger.error({ message: 'Token refresh crashed', context: describeError(error) });
      return false;
    });
    inFlight = operation;
    void operation.finally(() => {
      if (inFlight === operation) {
        inFlight = null;
      }
    });
    return operation;
  };

  const schedule = (expiresInSeconds: number): void => {
    failures = 0;
    setTimer(refreshDelayMs(Number.isFinite(expiresInSeconds) ? expiresInSeconds : 0));
  };

  return {
    refresh,
    schedule,
    refreshSoon: (delayMs = 0) => setTimer(delayMs),
    cancel,
    endSession: () => {
      generation += 1;
      failures = 0;
      cancel();
      inFlight = null;
    },
    isScheduled: () => timer !== null,
    isRefreshing: () => inFlight !== null,
    transientFailures: () => failures,
  };
}
