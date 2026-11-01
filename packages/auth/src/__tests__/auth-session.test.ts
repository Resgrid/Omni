import { getCurrentUsersRights } from '@resgrid/api';
import { createScopeWiper, type DurableKv } from '@resgrid/offline';

import { getCurrentSession } from '../api/shared-session';
import { getAuthApiContext } from '../runtime/api-context';
import { setAuthServices } from '../runtime/services';
import { ACCESS_TOKEN_EXPIRY_SKEW_MS, refreshEngine, useAuthStore } from '../session/auth-store';
import { hydrateAuthSession } from '../session/hydrate-session';
import { saveSharedInstallation } from '../session/shared-installation';
import { registerSignOutHook } from '../session/sign-out-hooks';
import { useSharedSessionStore } from '../shared-session/shared-session-store';
import { v4 } from './helpers/fake-server';
import { DEFAULT_API_URL, flush, type Harness, setupHarness } from './helpers/harness';
import { accessToken, idToken, tokenResponse } from './helpers/jwt';

const nowSeconds = (): number => Math.floor(Date.now() / 1000);
const envelope = (state: Record<string, unknown>): string => JSON.stringify({ state, version: 0 });

describe('password sign-in on the wire', () => {
  let h: Harness;
  beforeEach(() => {
    h = setupHarness('unit');
  });

  it("sends the variant's client_id, the transaction flow and the app header on the password grant", async () => {
    h.server.on('POST', '/connect/token', { data: tokenResponse() });
    await useAuthStore.getState().login({ username: 'member', password: 'secret' });

    const [request] = h.server.requestsTo('POST', '/connect/token');
    expect(request.baseURL).toBe(DEFAULT_API_URL);
    expect(request.body).toMatchObject({ grant_type: 'password', username: 'member', password: 'secret', mfa_flow: 'transaction', client_id: 'unit' });
    expect(request.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    expect(request.headers['X-Resgrid-Client']).toBe('unit');
    expect(request.headers.Authorization).toBeUndefined();
    expect(useAuthStore.getState()).toMatchObject({ status: 'signedIn', userId: 'user-1', authMethod: 'password', refreshToken: 'refresh-1' });
    expect(h.telemetry).toHaveBeenLastCalledWith('user-1');
  });

  it("sends the variant's client_id on the refresh grant", async () => {
    h.server.on('POST', '/connect/token', { data: tokenResponse() });
    await useAuthStore.getState().login({ username: 'member', password: 'secret' });
    h.server.on('POST', '/connect/token', { data: tokenResponse({ refresh_token: 'refresh-2' }) });

    await expect(useAuthStore.getState().refreshAccessToken()).resolves.toBe(true);
    const refresh = h.server.requestsTo('POST', '/connect/token')[1];
    expect(refresh.body).toMatchObject({ grant_type: 'refresh_token', refresh_token: 'refresh-1', client_id: 'unit' });
    expect(useAuthStore.getState().refreshToken).toBe('refresh-2');
  });

  it.each([
    ['dispatch', 'dispatch'],
    ['responder', 'responder'],
    ['bigboard', 'bigboard'],
  ] as const)('uses the %s manifest client id', async (variant, clientId) => {
    h = setupHarness(variant);
    h.server.on('POST', '/connect/token', { data: tokenResponse() });
    await useAuthStore.getState().login({ username: 'member', password: 'secret' });
    expect(h.server.requests[0].body.client_id).toBe(clientId);
    expect(h.server.requests[0].headers['X-Resgrid-Client']).toBe(clientId);
  });

  it('falls back to no client_id (once per server) when the server does not accept it', async () => {
    h.server.on('POST', '/connect/token', (request) => (request.body.client_id ? { status: 400, data: { error: 'invalid_client' } } : { data: tokenResponse() }));
    await useAuthStore.getState().login({ username: 'member', password: 'secret' });
    expect(useAuthStore.getState().status).toBe('signedIn');
    const sent = h.server.requestsTo('POST', '/connect/token');
    expect(sent.map((r) => r.body.client_id)).toEqual(['unit', undefined]);

    await useAuthStore.getState().refreshAccessToken();
    expect(h.server.requestsTo('POST', '/connect/token')[2].body.client_id).toBeUndefined();
  });

  it('continues on the login transaction without keeping the secret in the store', async () => {
    h.server.on('POST', '/connect/token', { status: 400, data: { error: 'mfa_required', mfa_transaction: 'tx-secret', mfa_methods: 'totp passkey', mfa_enrolled: 'totp', mfa_preferred: 'totp', mfa_expires_in: 300 } });
    await useAuthStore.getState().login({ username: 'member', password: 'secret' });
    const state = useAuthStore.getState();
    expect(state.status).toBe('mfaRequired');
    expect(state.mfaChallenge).toMatchObject({ kind: 'verify', methods: ['totp', 'passkey'], enrolled: ['totp'], preferred: 'totp', source: 'password' });
    expect(JSON.stringify(state)).not.toContain('tx-secret');
    expect(h.storage.main.getString('auth-storage') ?? '').not.toContain('tx-secret');
  });

  it('falls back to the legacy totp_code resend on a server without the transaction flow', async () => {
    h.server.on('POST', '/connect/token', { status: 400, data: { error: 'mfa_required' } });
    await useAuthStore.getState().login({ username: 'member', password: 'secret' });
    expect(useAuthStore.getState().mfaChallenge?.kind).toBe('legacy');

    h.server.on('POST', '/connect/token', { data: tokenResponse() });
    await useAuthStore.getState().login({ username: 'member', password: 'secret', otpCode: ' 123456 ' });
    expect(h.server.requests[1].body).toMatchObject({ totp_code: '123456' });
    expect(h.server.requests[1].body.mfa_flow).toBeUndefined();
    expect(useAuthStore.getState().status).toBe('signedIn');
  });

  it('classifies refusals for the login screen (login_error, fallback for older servers, unreachable)', async () => {
    h.server.on('POST', '/connect/token', { status: 400, data: { error: 'invalid_grant', login_error: 'account_locked_out', lockout_minutes_remaining: 4.2 } });
    await useAuthStore.getState().login({ username: 'member', password: 'wrong' });
    expect(useAuthStore.getState()).toMatchObject({ status: 'error', error: 'account_locked_out', loginFailure: { code: 'account_locked_out', lockoutMinutes: 5 } });

    h.server.reset('POST', '/connect/token').on('POST', '/connect/token', { status: 400, data: { error: 'invalid_grant' } });
    await useAuthStore.getState().login({ username: 'member', password: 'wrong' });
    expect(useAuthStore.getState().loginFailure).toEqual({ code: 'invalid_credentials' });

    h.server.reset('POST', '/connect/token').on('POST', '/connect/token', { network: true });
    await useAuthStore.getState().login({ username: 'member', password: 'secret' });
    expect(useAuthStore.getState().loginFailure).toEqual({ code: 'server_unreachable' });
  });

  it('refuses tokens without a usable id token', async () => {
    h.server.on('POST', '/connect/token', { data: tokenResponse({ id_token: 'not-a-jwt' }) });
    await useAuthStore.getState().login({ username: 'member', password: 'secret' });
    expect(useAuthStore.getState()).toMatchObject({ status: 'error', error: 'login_failed', accessToken: null });
  });

  it('persists only the whitelisted session fields under the frozen store name', async () => {
    h.server.on('POST', '/connect/token', { data: tokenResponse() });
    await useAuthStore.getState().login({ username: 'member', password: 'secret' });
    const stored = JSON.parse(h.storage.main.getString('auth-storage') ?? '{}') as { state: Record<string, unknown>; version: number };
    expect(stored.version).toBe(0);
    expect(Object.keys(stored.state).sort()).toEqual(['accessToken', 'authMethod', 'isFirstTime', 'profile', 'refreshToken', 'refreshTokenExpiresOn', 'status', 'userId']);
  });
});

describe('cold start (restoreSession, offline-safe)', () => {
  let h: Harness;
  afterEach(() => {
    refreshEngine.endSession();
    jest.useRealTimers();
  });

  it('restores a valid access token at once and schedules the refresh one minute before expiry', async () => {
    jest.useFakeTimers();
    const exp = nowSeconds() + 3600;
    h = setupHarness('unit', { seed: { ResgridUnit: { 'auth-storage': envelope({ accessToken: accessToken(exp), refreshToken: 'refresh-1', userId: 'user-1', profile: { sub: 'user-1' } }) } } });
    h.server.on('POST', '/connect/token', { data: tokenResponse() });

    await hydrateAuthSession();
    expect(useAuthStore.getState()).toMatchObject({ status: 'signedIn', userId: 'user-1', hydrated: true });
    expect(h.server.requests).toHaveLength(0);

    await jest.advanceTimersByTimeAsync(3600_000 - 60_000 - 2_000);
    expect(h.server.requests).toHaveLength(0);
    await jest.advanceTimersByTimeAsync(3_000);
    expect(h.server.requestsTo('POST', '/connect/token')).toHaveLength(1);
  });

  it('treats a token expiring within the skew window as expired and refreshes in the background, signed in', async () => {
    jest.useFakeTimers();
    const exp = Math.floor((Date.now() + ACCESS_TOKEN_EXPIRY_SKEW_MS - 1000) / 1000);
    h = setupHarness('unit', { seed: { ResgridUnit: { 'auth-storage': envelope({ accessToken: accessToken(exp), refreshToken: 'refresh-1', userId: 'user-1' }) } } });
    h.server.on('POST', '/connect/token', { data: tokenResponse({ refresh_token: 'refresh-2' }) });

    await hydrateAuthSession();
    expect(useAuthStore.getState().status).toBe('signedIn');
    await jest.advanceTimersByTimeAsync(0);
    expect(h.server.requestsTo('POST', '/connect/token')).toHaveLength(1);
    expect(useAuthStore.getState().refreshToken).toBe('refresh-2');
  });

  it('keeps the session (does not bounce to login) when the refresh fails offline, and retries with backoff', async () => {
    jest.useFakeTimers();
    h = setupHarness('unit', { seed: { ResgridUnit: { 'auth-storage': envelope({ accessToken: accessToken(nowSeconds() - 60), refreshToken: 'refresh-1', userId: 'user-1' }) } } });
    h.server.on('POST', '/connect/token', { network: true });

    await hydrateAuthSession();
    await jest.advanceTimersByTimeAsync(0);
    expect(useAuthStore.getState()).toMatchObject({ status: 'signedIn', refreshToken: 'refresh-1' });
    expect(h.wipeScope).not.toHaveBeenCalled();

    h.server.reset('POST', '/connect/token').on('POST', '/connect/token', { data: tokenResponse({ refresh_token: 'refresh-2' }) });
    await jest.advanceTimersByTimeAsync(5_000);
    expect(useAuthStore.getState().refreshToken).toBe('refresh-2');
  });

  it('keeps a BigBoard wall display signed in through server errors (neverLogoutOnTransientError)', async () => {
    jest.useFakeTimers();
    h = setupHarness('bigboard', { seed: { 'auth-storage': { 'auth-storage': envelope({ accessToken: accessToken(nowSeconds() - 60), refreshToken: 'refresh-1', userId: 'user-1', status: 'signedIn' }) } } });
    expect(h.manifest.capabilities.auth.neverLogoutOnTransientError).toBe(true);
    h.server.on('POST', '/connect/token', { status: 500, data: { error: 'server_error' } });

    await hydrateAuthSession();
    for (const delay of [0, 5_000, 10_000, 20_000, 40_000, 60_000, 60_000]) {
      await jest.advanceTimersByTimeAsync(delay);
    }
    expect(h.server.requestsTo('POST', '/connect/token').length).toBeGreaterThanOrEqual(6);
    expect(useAuthStore.getState().status).toBe('signedIn');
    expect(h.wipeScope).not.toHaveBeenCalled();
  });

  it('waits in loading with only a refresh token, and carries on signed in when that refresh fails offline', async () => {
    jest.useFakeTimers();
    h = setupHarness('unit', { seed: { ResgridUnit: { 'auth-storage': envelope({ refreshToken: 'refresh-1', userId: 'user-1' }) } } });
    h.server.on('POST', '/connect/token', { network: true });
    await hydrateAuthSession();
    expect(useAuthStore.getState().status).toBe('loading');
    await jest.advanceTimersByTimeAsync(0);
    expect(useAuthStore.getState().status).toBe('signedIn');
  });

  it('signs out (and wipes) only when the token endpoint rejects the refresh token', async () => {
    jest.useFakeTimers();
    h = setupHarness('unit', { seed: { ResgridUnit: { 'auth-storage': envelope({ accessToken: accessToken(nowSeconds() - 60), refreshToken: 'refresh-1', userId: 'user-1' }) } } });
    h.server.on('POST', '/connect/token', { status: 400, data: { error: 'invalid_grant', error_description: 'The refresh token is no longer valid.' } });
    await hydrateAuthSession();
    await jest.advanceTimersByTimeAsync(0);
    await flush();
    expect(useAuthStore.getState()).toMatchObject({ status: 'signedOut', accessToken: null, refreshToken: null });
    expect(h.wipeScope).toHaveBeenCalledWith('auth-rejected');
  });

  it('starts signed out when nothing was persisted', async () => {
    h = setupHarness('unit');
    await hydrateAuthSession();
    expect(useAuthStore.getState()).toMatchObject({ status: 'signedOut', hydrated: true });
    expect(h.server.requests).toHaveLength(0);
  });

  it('stamps the API cache scope with the persisted identity before anything reads the cache', async () => {
    h = setupHarness('unit', { seed: { ResgridUnit: { 'auth-storage': envelope({ accessToken: accessToken(nowSeconds() + 3600), refreshToken: 'refresh-1', userId: 'user-7' }) } } });
    await hydrateAuthSession();
    refreshEngine.endSession();
    expect(h.apiCache.setScope).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user-7', server: DEFAULT_API_URL }));
  });

  it('locks a restored shared-device session at launch, before the server is asked', async () => {
    h = setupHarness('unit', { seed: { ResgridUnit: { 'auth-storage': envelope({ accessToken: accessToken(nowSeconds() + 3600), refreshToken: 'refresh-1', userId: 'user-1' }) } } });
    saveSharedInstallation({ shared: true, label: 'Engine 12 MDT' });
    await hydrateAuthSession();
    refreshEngine.endSession();
    expect(useSharedSessionStore.getState()).toMatchObject({ shared: true, locked: true });
  });
});

describe('upgrade continuity (legacy persisted sessions stay signed in)', () => {
  afterEach(() => refreshEngine.endSession());

  it('Unit/IC: reads auth-storage from the main instance (no persisted status)', async () => {
    setupHarness('ic', {
      seed: {
        ResgridIC: {
          'auth-storage': envelope({
            accessToken: accessToken(nowSeconds() + 3600),
            refreshToken: 'r',
            refreshTokenExpiresOn: String(Date.now() + 3600_000),
            profile: { sub: 'u-ic' },
            userId: 'u-ic',
            isFirstTime: false,
          }),
        },
      },
    });
    await hydrateAuthSession();
    expect(useAuthStore.getState()).toMatchObject({ status: 'signedIn', userId: 'u-ic', refreshToken: 'r' });
  });

  it("Dispatch/BigBoard: reads auth-storage from the dedicated 'auth-storage' instance", async () => {
    const h = setupHarness('dispatch', {
      seed: { 'auth-storage': { 'auth-storage': envelope({ accessToken: 'opaque-encrypted-token', refreshToken: 'r', refreshTokenExpiresOn: String(Date.now() + 3600_000), userId: 'u-d', status: 'signedIn' }) } },
    });
    await hydrateAuthSession();
    expect(useAuthStore.getState()).toMatchObject({ status: 'signedIn', userId: 'u-d' });
    expect(h.storage.main.getString('auth-storage')).toBeUndefined();
  });

  it('Responder: rebuilds the session from the legacy authResponse copy when the store blob is missing', async () => {
    const response = { access_token: accessToken(nowSeconds() + 3600), refresh_token: 'r-legacy', id_token: idToken('u-r'), expires_in: 3600, obtained_at: Date.now() };
    setupHarness('responder', { seed: { ResgridResponder: { authResponse: JSON.stringify(response) } } });
    await hydrateAuthSession();
    expect(useAuthStore.getState()).toMatchObject({ status: 'signedIn', userId: 'u-r', refreshToken: 'r-legacy' });
  });

  it('Responder: supplies the access-token expiry from authResponse.obtained_at when the store blob has none', async () => {
    const obtainedAt = Date.now() - 1000;
    const h = setupHarness('responder', {
      seed: {
        ResgridResponder: {
          'auth-storage': envelope({ accessToken: 'opaque', refreshToken: 'r', accessTokenObtainedAt: obtainedAt, status: 'signedIn', userId: 'u-r', isSsoMfaPending: false }),
          authResponse: JSON.stringify({ access_token: 'opaque', refresh_token: 'r', expires_in: 86400, obtained_at: obtainedAt }),
        },
      },
    });
    h.server.on('POST', '/connect/token', { data: tokenResponse() });
    await hydrateAuthSession();
    expect(useAuthStore.getState().refreshTokenExpiresOn).toBe(String(obtainedAt + 86400_000));
    expect(useAuthStore.getState().status).toBe('signedIn');
    expect(h.server.requests).toHaveLength(0);
  });
});

describe('sign-out (clear state first, push unregister before any server switch, scope wipe)', () => {
  let h: Harness;
  beforeEach(async () => {
    h = setupHarness('unit');
    h.server.on('POST', '/connect/token', { data: tokenResponse({ access_token: 'access-at-logout' }) });
    await useAuthStore.getState().login({ username: 'member', password: 'secret' });
  });
  afterEach(() => refreshEngine.endSession());

  it('clears the session before the sign-out hooks run, which still get the ended token and its server', async () => {
    const seen: unknown[] = [];
    registerSignOutHook(async (context) => {
      seen.push({ status: useAuthStore.getState().status, storeToken: useAuthStore.getState().accessToken, ...context });
    });
    await useAuthStore.getState().logout();
    expect(seen).toEqual([{ status: 'signedOut', storeToken: null, accessToken: 'access-at-logout', baseUrl: DEFAULT_API_URL }]);
  });

  it('runs the scope wipe after the hooks, removes the legacy authResponse copy, and drops the telemetry user', async () => {
    const order: string[] = [];
    registerSignOutHook(async () => {
      order.push('hook');
    });
    h.wipeScope.mockImplementation(async (reason) => {
      order.push(`wipe:${reason}`);
    });
    h.storage.main.set('authResponse', '{"refresh_token":"x"}');
    await useAuthStore.getState().logout();
    expect(order).toEqual(['hook', 'wipe:logout']);
    expect(h.storage.main.contains('authResponse')).toBe(false);
    expect(h.telemetry).toHaveBeenLastCalledWith(null);
  });

  it('is single-flight: concurrent sign-outs share one wipe', async () => {
    await Promise.all([useAuthStore.getState().logout(), useAuthStore.getState().logout(), useAuthStore.getState().logout()]);
    expect(h.wipeScope).toHaveBeenCalledTimes(1);
    await useAuthStore.getState().logout();
    expect(h.wipeScope).toHaveBeenCalledTimes(2);
  });

  it('still signs out when a hook fails or hangs', async () => {
    jest.useFakeTimers();
    registerSignOutHook(async () => {
      throw new Error('push server down');
    });
    registerSignOutHook(() => new Promise<void>(() => undefined));
    const done = useAuthStore.getState().logout();
    await jest.advanceTimersByTimeAsync(3_000);
    await done;
    jest.useRealTimers();
    expect(useAuthStore.getState().status).toBe('signedOut');
    expect(h.wipeScope).toHaveBeenCalledTimes(1);
  });

  it('keeps device preferences and drops the session with the real scope wiper', async () => {
    const wiper = createScopeWiper({ kvInstances: () => h.storage.all() as DurableKv[], variantId: 'unit' });
    setAuthServices({ wipeScope: (reason) => wiper.wipeScope(reason), apiCache: h.apiCache });
    saveSharedInstallation({ shared: true, label: 'Engine 1' });
    h.storage.main.setJSON('local', 'de');
    h.storage.main.setJSON('SELECTED_THEME', 'dark');
    h.storage.main.setJSON('baseUrl', DEFAULT_API_URL);
    h.storage.main.setJSON('activeCallId', '42');

    await useAuthStore.getState().logout();

    expect(h.storage.main.getJSON('local')).toBe('de');
    expect(h.storage.main.getJSON('SELECTED_THEME')).toBe('dark');
    expect(h.storage.main.getJSON('baseUrl')).toBe(DEFAULT_API_URL);
    expect(h.storage.main.contains('SHARED_INSTALLATION')).toBe(true);
    expect(h.storage.main.contains('activeCallId')).toBe(false);
    expect(h.storage.main.contains('auth-storage')).toBe(false);
  });

  it('does not resurrect the session when a refresh resolves after sign-out', async () => {
    let release: () => void = () => undefined;
    h.server.reset('POST', '/connect/token').on('POST', '/connect/token', () => new Promise((resolve) => (release = () => resolve({ data: tokenResponse({ refresh_token: 'late' }) }))));
    const refreshing = useAuthStore.getState().refreshAccessToken();
    await flush();
    await useAuthStore.getState().logout();
    release();
    await expect(refreshing).resolves.toBe(false);
    expect(useAuthStore.getState()).toMatchObject({ status: 'signedOut', refreshToken: null, accessToken: null });
  });

  it('explains a shared shift that ran out on the login screen', async () => {
    h.server.on('GET', '/sessions/current', { status: 401, data: { error: 'shared_session_expired' } });
    await expect(getCurrentSession(getAuthApiContext())).rejects.toBeDefined();
    await flush();
    expect(useAuthStore.getState()).toMatchObject({ status: 'signedOut', error: 'shift_ended' });
  });

  it('shows the lock screen (keeping the tokens) when the server says the shared session is locked', async () => {
    h.server.on('GET', '/sessions/current', { status: 401, data: { error: 'shared_session_locked', lock_version: 7 } });
    await expect(getCurrentSession(getAuthApiContext())).rejects.toBeDefined();
    expect(useSharedSessionStore.getState()).toMatchObject({ locked: true, lockVersion: 7 });
    expect(useAuthStore.getState().status).toBe('signedIn');
    expect(h.server.requestsTo('POST', '/connect/token')).toHaveLength(1);
  });

  it('refreshes once and replays a request that got a plain 401', async () => {
    h.server.once('GET', '/Security/GetCurrentUsersRights', { status: 401 });
    h.server.on('GET', '/Security/GetCurrentUsersRights', { data: v4({ DepartmentId: '1' }) });
    h.server.on('POST', '/connect/token', { data: tokenResponse({ access_token: 'access-refreshed' }) });
    await expect(getCurrentUsersRights(getAuthApiContext())).resolves.toMatchObject({ Data: { DepartmentId: '1' } });
    const rights = h.server.requestsTo('GET', '/Security/GetCurrentUsersRights');
    expect(rights.map((r) => r.headers.Authorization)).toEqual(['Bearer access-at-logout', 'Bearer access-refreshed']);
  });
});
