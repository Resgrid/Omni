import { ApiError } from '@resgrid/api';

import { createTokenRefreshEngine, isRefreshCredentialRejection, refreshDelayMs, type TokenRefreshHandlers, transientRetryDelayMs } from '../session/token-refresh';
import type { AuthResponse } from '../session/types';

const httpError = (status: number, data?: unknown): ApiError => new ApiError({ kind: 'http', status, data, code: (data as { error?: string } | undefined)?.error });
const networkError = (): ApiError => new ApiError({ kind: 'network', code: 'ERR_NETWORK' });
const timeoutError = (): ApiError => new ApiError({ kind: 'timeout', code: 'ECONNABORTED' });

const tokens = (refresh = 'refresh-2', expiresIn = 3600): AuthResponse => ({ access_token: 'access-2', refresh_token: refresh, id_token: null, expires_in: expiresIn });

interface Rig {
  handlers: jest.Mocked<Required<TokenRefreshHandlers>>;
  session: { refreshToken: string | null };
  engine: ReturnType<typeof createTokenRefreshEngine>;
}

const rig = (request: (refreshToken: string) => Promise<AuthResponse> = async () => tokens()): Rig => {
  const session = { refreshToken: 'refresh-1' as string | null };
  const handlers = {
    requestRefresh: jest.fn(request),
    getRefreshToken: jest.fn(() => session.refreshToken),
    applyAuthResponse: jest.fn((response: AuthResponse) => {
      session.refreshToken = response.refresh_token ?? session.refreshToken;
    }),
    onCredentialRejected: jest.fn(),
    onNoRefreshToken: jest.fn(),
    onSharedSessionLocked: jest.fn(),
    onTransientFailure: jest.fn(),
  } as jest.Mocked<Required<TokenRefreshHandlers>>;
  return { handlers, session, engine: createTokenRefreshEngine(handlers) };
};

describe('isRefreshCredentialRejection (the only failure that ends a session)', () => {
  it('is true only for a 400/401 invalid_grant', () => {
    expect(isRefreshCredentialRejection(httpError(400, { error: 'invalid_grant' }))).toBe(true);
    expect(isRefreshCredentialRejection(httpError(401, { error: 'invalid_grant' }))).toBe(true);
    // Axios-shaped errors are read the same way.
    expect(isRefreshCredentialRejection({ isAxiosError: true, response: { status: 400, data: { error: 'invalid_grant' } } })).toBe(true);
  });

  it('is false for everything that says nothing about the token', () => {
    expect(isRefreshCredentialRejection(httpError(401, { error: 'invalid_client' }))).toBe(false);
    expect(isRefreshCredentialRejection(httpError(400, { error: 'invalid_request' }))).toBe(false);
    expect(isRefreshCredentialRejection(httpError(401))).toBe(false);
    expect(isRefreshCredentialRejection(httpError(401, '<html>proxy</html>'))).toBe(false);
    expect(isRefreshCredentialRejection(httpError(500, { error: 'invalid_grant' }))).toBe(false);
    expect(isRefreshCredentialRejection(httpError(502))).toBe(false);
    expect(isRefreshCredentialRejection(httpError(429))).toBe(false);
    expect(isRefreshCredentialRejection(networkError())).toBe(false);
    expect(isRefreshCredentialRejection(timeoutError())).toBe(false);
    expect(isRefreshCredentialRejection(new Error('boom'))).toBe(false);
  });
});

describe('refreshDelayMs (proactive timer)', () => {
  it('refreshes one minute before expiry for normal lifetimes', () => {
    expect(refreshDelayMs(3600)).toBe(3600_000 - 60_000);
    expect(refreshDelayMs(86400)).toBe(86400_000 - 60_000);
  });

  it('never refreshes earlier than half the lifetime (short server lifetimes)', () => {
    expect(refreshDelayMs(60)).toBe(30_000);
    expect(refreshDelayMs(90)).toBe(45_000);
  });

  it('never schedules below the minimum delay, and clamps to the timer ceiling', () => {
    expect(refreshDelayMs(2)).toBe(5_000);
    expect(refreshDelayMs(0)).toBe(5_000);
    expect(refreshDelayMs(365 * 86400)).toBe(0x7fffffff);
  });
});

describe('transientRetryDelayMs (backoff 5 s → 60 s)', () => {
  it('doubles from 5 s and stays at the 60 s cap', () => {
    expect([1, 2, 3, 4, 5, 6, 10].map(transientRetryDelayMs)).toEqual([5_000, 10_000, 20_000, 40_000, 60_000, 60_000, 60_000]);
  });
});

describe('token refresh engine', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('applies a fresh token and schedules the next refresh', async () => {
    const { engine, handlers } = rig();
    await expect(engine.refresh()).resolves.toBe(true);
    expect(handlers.requestRefresh).toHaveBeenCalledWith('refresh-1');
    expect(handlers.applyAuthResponse).toHaveBeenCalledTimes(1);
    expect(engine.isScheduled()).toBe(true);
  });

  it('is single-flight: concurrent callers share one token request', async () => {
    let release: (value: AuthResponse) => void = () => undefined;
    const { engine, handlers } = rig(() => new Promise<AuthResponse>((resolve) => (release = resolve)));
    const results = Promise.all([engine.refresh(), engine.refresh(), engine.refresh()]);
    expect(handlers.requestRefresh).toHaveBeenCalledTimes(1);
    release(tokens());
    await expect(results).resolves.toEqual([true, true, true]);
    expect(handlers.applyAuthResponse).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['a network error', networkError()],
    ['a timeout', timeoutError()],
    ['a 500', httpError(500)],
    ['a 502 gateway page', httpError(502, '<html>')],
    ['a 503', httpError(503)],
    ['rate limiting', httpError(429)],
    ['a 401 invalid_client', httpError(401, { error: 'invalid_client' })],
    ['a 400 with no OAuth body', httpError(400)],
    ['a non-HTTP error', new Error('socket hang up')],
  ])('keeps the session and retries after %s (never logs out)', async (_name, error) => {
    const { engine, handlers } = rig(async () => {
      throw error;
    });
    await expect(engine.refresh()).resolves.toBe(false);
    expect(handlers.onCredentialRejected).not.toHaveBeenCalled();
    expect(handlers.onTransientFailure).toHaveBeenCalledWith(1, 5_000);
    expect(engine.isScheduled()).toBe(true);
  });

  it.each([400, 401])('ends the session when the token endpoint rejects the refresh token with %s invalid_grant', async (status) => {
    const { engine, handlers } = rig(async () => {
      throw httpError(status, { error: 'invalid_grant', error_description: 'The refresh token is no longer valid.' });
    });
    await expect(engine.refresh()).resolves.toBe(false);
    expect(handlers.onCredentialRejected).toHaveBeenCalledTimes(1);
    expect(engine.isScheduled()).toBe(false);
  });

  it('waits for an unlock (never a sign-out) when the shared session is locked', async () => {
    const { engine, handlers } = rig(async () => {
      throw httpError(400, { error: 'invalid_grant', shared_session_locked: true });
    });
    await expect(engine.refresh()).resolves.toBe(false);
    expect(handlers.onSharedSessionLocked).toHaveBeenCalledTimes(1);
    expect(handlers.onCredentialRejected).not.toHaveBeenCalled();
    expect(engine.isScheduled()).toBe(false);
  });

  it('backs off between retries, then ends the session once the server actually rejects the token', async () => {
    const failures = [networkError(), httpError(503), networkError()];
    const { engine, handlers } = rig(async () => {
      const next = failures.shift();
      throw next ?? httpError(400, { error: 'invalid_grant' });
    });
    await engine.refresh();
    expect(handlers.onTransientFailure).toHaveBeenLastCalledWith(1, 5_000);
    await jest.advanceTimersByTimeAsync(5_000);
    expect(handlers.onTransientFailure).toHaveBeenLastCalledWith(2, 10_000);
    await jest.advanceTimersByTimeAsync(10_000);
    expect(handlers.onTransientFailure).toHaveBeenLastCalledWith(3, 20_000);
    expect(handlers.onCredentialRejected).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(20_000);
    expect(handlers.requestRefresh).toHaveBeenCalledTimes(4);
    expect(handlers.onCredentialRejected).toHaveBeenCalledTimes(1);
  });

  it('a retry that gets through resets the backoff and schedules the normal refresh', async () => {
    let fail = true;
    const { engine, handlers } = rig(async () => {
      if (fail) {
        throw networkError();
      }
      return tokens('refresh-2', 3600);
    });
    await engine.refresh();
    expect(engine.transientFailures()).toBe(1);
    fail = false;
    await jest.advanceTimersByTimeAsync(5_000);
    expect(handlers.applyAuthResponse).toHaveBeenCalledTimes(1);
    expect(engine.transientFailures()).toBe(0);
    handlers.requestRefresh.mockClear();
    await jest.advanceTimersByTimeAsync(3600_000 - 60_000 - 1);
    expect(handlers.requestRefresh).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);
    expect(handlers.requestRefresh).toHaveBeenCalledTimes(1);
  });

  it('runs the proactive refresh when the scheduled timer fires', async () => {
    const { engine, handlers } = rig();
    engine.schedule(120);
    await jest.advanceTimersByTimeAsync(60_000 - 1);
    expect(handlers.requestRefresh).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);
    expect(handlers.requestRefresh).toHaveBeenCalledTimes(1);
  });

  it('discards a result that arrives after the session ended (sign-out during the request)', async () => {
    let release: (value: AuthResponse) => void = () => undefined;
    const { engine, handlers, session } = rig(() => new Promise<AuthResponse>((resolve) => (release = resolve)));
    const pending = engine.refresh();
    engine.endSession();
    session.refreshToken = null;
    release(tokens());
    await expect(pending).resolves.toBe(false);
    expect(handlers.applyAuthResponse).not.toHaveBeenCalled();
    expect(engine.isScheduled()).toBe(false);
  });

  it('discards a rejection that arrives after a new sign-in replaced the refresh token (never logs the new session out)', async () => {
    let fail: (error: unknown) => void = () => undefined;
    const { engine, handlers, session } = rig(() => new Promise<AuthResponse>((_resolve, reject) => (fail = reject)));
    const pending = engine.refresh();
    session.refreshToken = 'refresh-of-new-session';
    fail(httpError(400, { error: 'invalid_grant' }));
    await expect(pending).resolves.toBe(false);
    expect(handlers.onCredentialRejected).not.toHaveBeenCalled();
  });

  it('does not treat a handler refusing the response (raced sign-out) as an outage', async () => {
    const { engine, handlers } = rig();
    handlers.applyAuthResponse.mockImplementation(() => {
      throw new Error('signed out');
    });
    await expect(engine.refresh()).resolves.toBe(false);
    expect(handlers.onCredentialRejected).not.toHaveBeenCalled();
    expect(handlers.onTransientFailure).not.toHaveBeenCalled();
    expect(engine.isScheduled()).toBe(false);
  });

  it('reports a missing refresh token without calling the server', async () => {
    const { engine, handlers, session } = rig();
    session.refreshToken = null;
    await expect(engine.refresh()).resolves.toBe(false);
    expect(handlers.requestRefresh).not.toHaveBeenCalled();
    expect(handlers.onNoRefreshToken).toHaveBeenCalledTimes(1);
  });

  it('replaces a scheduled refresh instead of stacking timers', async () => {
    const { engine, handlers } = rig();
    engine.schedule(3600);
    engine.schedule(120);
    await jest.advanceTimersByTimeAsync(60_000);
    expect(handlers.requestRefresh).toHaveBeenCalledTimes(1);
  });
});
