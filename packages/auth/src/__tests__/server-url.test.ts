import { refreshEngine, useAuthStore } from '../session/auth-store';
import { buildApiUrl, getBaseApiUrl, getStoredServerUrlProblem, isSameServerUrl, mergeServerLocations, RESGRID_HOSTED_LOCATIONS, toBaseUrl, validateServerUrl } from '../session/server-url';
import { registerSignOutHook } from '../session/sign-out-hooks';
import { registerServerChangeListener, switchServer } from '../session/switch-server';
import { DEFAULT_API_URL, setupHarness } from './helpers/harness';
import { tokenResponse } from './helpers/jwt';

describe('server URL validation (S-3: no cleartext credentials)', () => {
  it('accepts https servers and normalizes them to the bare base', () => {
    expect(validateServerUrl(' https://api.resgrid.com/api/v4/ ', false)).toEqual({ ok: true, baseUrl: 'https://api.resgrid.com' });
    expect(validateServerUrl('https://resgrid.example.org:8443', false)).toEqual({ ok: true, baseUrl: 'https://resgrid.example.org:8443' });
  });

  it('rejects http in production, even to localhost', () => {
    expect(validateServerUrl('http://resgrid.example.org', false)).toEqual({ ok: false, reason: 'insecure' });
    expect(validateServerUrl('http://localhost:5000', false)).toEqual({ ok: false, reason: 'insecure' });
    expect(validateServerUrl('http://127.0.0.1', false)).toEqual({ ok: false, reason: 'insecure' });
  });

  it('allows http only to localhost in a development build', () => {
    expect(validateServerUrl('http://localhost:5000', true)).toEqual({ ok: true, baseUrl: 'http://localhost:5000' });
    expect(validateServerUrl('http://127.0.0.1:5000/api/v4', true)).toEqual({ ok: true, baseUrl: 'http://127.0.0.1:5000' });
    expect(validateServerUrl('http://10.0.0.5', true)).toEqual({ ok: false, reason: 'insecure' });
  });

  it('rejects empty, malformed and credential-bearing URLs and other schemes', () => {
    expect(validateServerUrl('', false)).toEqual({ ok: false, reason: 'empty' });
    expect(validateServerUrl('api.resgrid.com', false)).toEqual({ ok: false, reason: 'invalid' });
    expect(validateServerUrl('ftp://api.resgrid.com', false)).toEqual({ ok: false, reason: 'invalid' });
    expect(validateServerUrl('https://user:pass@api.resgrid.com', false)).toEqual({ ok: false, reason: 'invalid' });
  });

  it('builds exactly one API suffix and compares servers case-insensitively', () => {
    expect(buildApiUrl('https://api.resgrid.com/api/v4')).toBe('https://api.resgrid.com/api/v4');
    expect(buildApiUrl('https://api.resgrid.com/')).toBe('https://api.resgrid.com/api/v4');
    expect(toBaseUrl('https://API.resgrid.com/api/v4//')).toBe('https://API.resgrid.com');
    expect(isSameServerUrl('https://API.resgrid.com', 'https://api.resgrid.com/api/v4')).toBe(true);
  });

  it('merges server-reported sites with the hosted ones and drops insecure entries', () => {
    const merged = mergeServerLocations([
      { Name: 'US-West', DisplayName: 'Custom label', LocationInfo: '', IsDefault: true, ApiUrl: 'https://api.resgrid.com', AllowsFreeAccounts: true },
      { Name: 'Bad', DisplayName: 'Bad', LocationInfo: '', IsDefault: false, ApiUrl: 'http://cleartext.example', AllowsFreeAccounts: false },
    ]);
    expect(merged.map((l) => l.Name)).toEqual(['US-West', 'EU-Central']);
    expect(merged[0].DisplayName).toBe('Custom label');
    expect(RESGRID_HOSTED_LOCATIONS.every((l) => l.ApiUrl.startsWith('https://'))).toBe(true);
  });
});

describe('the stored server', () => {
  it('reads the legacy JSON-encoded baseUrl contract key', () => {
    setupHarness('unit', { seed: { ResgridUnit: { baseUrl: JSON.stringify('https://resgrid.example.org/api/v4') } } });
    expect(getBaseApiUrl()).toBe('https://resgrid.example.org/api/v4');
    expect(getStoredServerUrlProblem()).toBeNull();
  });

  it('defaults to the build server when nothing is stored', () => {
    setupHarness('unit');
    expect(getBaseApiUrl()).toBe(DEFAULT_API_URL);
  });

  it('never sends credentials to an insecure server a legacy build accepted (kept, flagged, not used)', () => {
    const h = setupHarness('responder', { seed: { ResgridResponder: { baseUrl: JSON.stringify('http://resgrid.local/api/v4') } } });
    expect(getBaseApiUrl()).toBe(DEFAULT_API_URL);
    expect(getStoredServerUrlProblem()).toBe('insecure');
    expect(h.storage.main.getString('baseUrl')).toBe(JSON.stringify('http://resgrid.local/api/v4'));
  });
});

describe('switching servers (sign out first, then switch)', () => {
  afterEach(() => refreshEngine.endSession());

  it('rejects http in production without touching the session', async () => {
    const h = setupHarness('unit');
    await expect(switchServer('http://resgrid.example.org', false)).resolves.toEqual({ ok: false, reason: 'insecure' });
    expect(getBaseApiUrl()).toBe(DEFAULT_API_URL);
    expect(h.wipeScope).not.toHaveBeenCalled();
  });

  it('signs out before switching, so the push unregister reaches the old server', async () => {
    const h = setupHarness('unit');
    h.server.on('POST', '/connect/token', { data: tokenResponse({ access_token: 'old-server-token' }) });
    await useAuthStore.getState().login({ username: 'member', password: 'secret' });

    const unregisterCalls: { baseUrl: string; accessToken: string | null; currentServer: string }[] = [];
    registerSignOutHook(async ({ baseUrl, accessToken }) => {
      unregisterCalls.push({ baseUrl, accessToken, currentServer: getBaseApiUrl() });
    });
    const changes: string[] = [];
    registerServerChangeListener(({ apiUrl }) => {
      changes.push(apiUrl);
    });

    await expect(switchServer('https://api-eu-central.resgrid.com')).resolves.toEqual({ ok: true, apiUrl: 'https://api-eu-central.resgrid.com/api/v4', changed: true });

    expect(unregisterCalls).toEqual([{ baseUrl: DEFAULT_API_URL, accessToken: 'old-server-token', currentServer: DEFAULT_API_URL }]);
    expect(h.wipeScope).toHaveBeenCalledWith('server-switch');
    expect(getBaseApiUrl()).toBe('https://api-eu-central.resgrid.com/api/v4');
    expect(JSON.parse(h.storage.main.getString('baseUrl') ?? 'null')).toBe('https://api-eu-central.resgrid.com/api/v4');
    expect(h.apiCache.reset).toHaveBeenCalled();
    expect(h.apiCache.setScope).toHaveBeenLastCalledWith({ server: 'https://api-eu-central.resgrid.com/api/v4', userId: null, departmentId: null });
    expect(changes).toEqual(['https://api-eu-central.resgrid.com/api/v4']);
    expect(useAuthStore.getState().status).toBe('signedOut');

    // Requests now go to the new server.
    h.server.on('POST', '/connect/token', { data: tokenResponse() });
    await useAuthStore.getState().login({ username: 'member', password: 'secret' });
    expect(h.server.requests.slice(-1)[0].baseURL).toBe('https://api-eu-central.resgrid.com/api/v4');
  });

  it('does nothing for the same server', async () => {
    const h = setupHarness('unit');
    await expect(switchServer('https://API.resgrid.com/api/v4/')).resolves.toEqual({ ok: true, apiUrl: DEFAULT_API_URL, changed: false });
    expect(h.apiCache.reset).not.toHaveBeenCalled();
  });
});
