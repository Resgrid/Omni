import { createHash } from 'crypto';

import { fetchDepartmentSsoConfig, fetchSsoConfigForUser, normalizeSsoConfig, SSO_DISCOVERY_TIMEOUT_MS } from '../api/sso-discovery';
import { base64UrlToBytes, bytesToBase64Url } from '../mfa/base64url';
import { s256Challenge } from '../mfa/pkce';
import { getAuthApiContext } from '../runtime/api-context';
import { setDevelopmentBuildForTests } from '../runtime/platform';
import { refreshEngine, useAuthStore } from '../session/auth-store';
import { buildOidcRequestConfig, oidcRedirectUri } from '../sso/oidc';
import { handleSamlCallbackUrl, PENDING_SAML_STATE_TTL_MS, prepareSamlSignIn } from '../sso/saml';
import { parseSsoReturn, runSsoRoundTrip, ssoReturnTarget } from '../sso/sso-browser';
import { isValidSsoUrl } from '../sso/sso-url';
import { __resetWebBrowserFake, __setNextAuthSessionResult } from './fakes/expo-web-browser';
import { v4 } from './helpers/fake-server';
import { type Harness, setupHarness } from './helpers/harness';
import { tokenResponse } from './helpers/jwt';

describe('isValidSsoUrl (Responder)', () => {
  afterEach(() => setDevelopmentBuildForTests(null));

  it('accepts https identity-provider and SAML start pages', () => {
    expect(isValidSsoUrl('https://login.microsoftonline.com/tenant/v2.0')).toBe(true);
    expect(isValidSsoUrl('https://api.resgrid.com/api/v4/connect/saml-mobile-login?departmentToken=x')).toBe(true);
  });

  it('refuses http in production, custom schemes, javascript: and garbage', () => {
    for (const url of ['http://idp.example.com', 'http://localhost:5000', 'javascript:alert(1)', 'resgrid://x', 'ftp://idp', 'not a url', '', null, undefined]) {
      expect(isValidSsoUrl(url, false)).toBe(false);
    }
  });

  it('allows http only to localhost in a development build', () => {
    expect(isValidSsoUrl('http://localhost:5000/idp', true)).toBe(true);
    expect(isValidSsoUrl('http://127.0.0.1/idp', true)).toBe(true);
    expect(isValidSsoUrl('http://idp.example.com', true)).toBe(false);
  });
});

describe('PKCE and the brokered round trip', () => {
  beforeEach(() => {
    setupHarness('ic');
    __resetWebBrowserFake();
  });

  it('derives the RFC 7636 S256 challenge from the verifier', async () => {
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    await expect(s256Challenge(verifier)).resolves.toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });

  it('round-trips base64url bytes', () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 252, 253, 254, 255]);
    expect(Array.from(base64UrlToBytes(bytesToBase64Url(bytes)))).toEqual(Array.from(bytes));
    expect(bytesToBase64Url(new Uint8Array([251, 255]))).toBe('-_8');
  });

  it('sends only the challenge to the broker and keeps the verifier for redemption', async () => {
    const begin = jest.fn(async (secrets: { codeChallenge: string; state: string; returnTarget: string; platform: string }) => {
      __setNextAuthSessionResult({ type: 'success', url: `${secrets.returnTarget}?sso_code=one-time&state=${secrets.state}` });
      return { AuthorizeUrl: 'https://broker/authorize', SsoTransactionId: 'sso-9', ExpiresIn: 300 };
    });
    const result = await runSsoRoundTrip(begin, false);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const secrets = begin.mock.calls[0][0];
    const expected = createHash('sha256').update(result.trip.codeVerifier).digest('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(secrets.codeChallenge).toBe(expected);
    expect(secrets.codeChallenge).not.toBe(result.trip.codeVerifier);
    expect(result.trip.codeVerifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(secrets.returnTarget).toBe('resgridic://sso-return');
    expect(secrets.platform).toBe('ios');
    expect(result.trip).toMatchObject({ ssoTransactionId: 'sso-9', ssoCode: 'one-time' });
  });

  it('refuses a return whose state is not this round trip’s, and reports provider errors', async () => {
    const begin = async () => ({ AuthorizeUrl: 'https://broker/authorize', SsoTransactionId: 'sso-9', ExpiresIn: 300 });
    __setNextAuthSessionResult({ type: 'success', url: 'resgridic://sso-return?sso_code=x&state=other' });
    await expect(runSsoRoundTrip(begin, false)).resolves.toEqual({ ok: false, reason: 'state_mismatch' });

    const denied = await runSsoRoundTrip(async (secrets) => {
      __setNextAuthSessionResult({ type: 'success', url: `${secrets.returnTarget}?error=access_denied&state=${secrets.state}` });
      return begin();
    }, false);
    expect(denied).toEqual({ ok: false, reason: 'denied', code: 'access_denied' });
  });

  it('uses each variant’s return scheme from the manifest (Unit/IC no longer hardcode resgridunit)', () => {
    expect(ssoReturnTarget()).toBe('resgridic://sso-return');
    setupHarness('responder');
    expect(ssoReturnTarget()).toBe('resgrid://sso-return');
    setupHarness('bigboard');
    expect(ssoReturnTarget()).toBe('resgridbigboard://sso-return');
  });

  it('parses the broker return', () => {
    expect(parseSsoReturn('resgridunit://sso-return?sso_code=a&state=b#frag')).toEqual({ ssoCode: 'a', state: 'b', error: undefined });
    expect(parseSsoReturn('resgridunit://sso-return')).toEqual({ ssoCode: undefined, state: undefined, error: undefined });
  });
});

describe('legacy OIDC (unbrokered)', () => {
  beforeEach(() => setupHarness('dispatch'));

  it('redirects to the manifest scheme (lowercase) at auth/callback', () => {
    expect(oidcRedirectUri()).toBe('resgriddispatch://auth/callback');
  });

  it('asks a shared installation to authenticate again', () => {
    expect(buildOidcRequestConfig({ clientId: 'cid', redirectUri: 'x://y', shared: true })).toMatchObject({ usePKCE: true, prompt: 'login', extraParams: { max_age: '0' } });
    expect(buildOidcRequestConfig({ clientId: '', redirectUri: 'x://y', shared: false })).toMatchObject({ clientId: 'placeholder', usePKCE: true });
    expect(buildOidcRequestConfig({ clientId: 'cid', redirectUri: 'x://y', shared: false }).prompt).toBeUndefined();
  });

  it('exchanges the IdP token at connect/external-token without grant_type, and retries with a code', async () => {
    const h = setupHarness('dispatch');
    h.server.once('POST', '/connect/external-token', { status: 400, data: { error: 'mfa_required' } });
    await useAuthStore.getState().loginWithExternalToken({ provider: 'oidc', externalToken: 'idp-token', username: 'member', departmentToken: 'dt' });
    expect(useAuthStore.getState()).toMatchObject({ status: 'mfaRequired', isSsoMfaPending: true });
    const first = h.server.requestsTo('POST', '/connect/external-token')[0].body;
    expect(first).toMatchObject({ provider: 'oidc', external_token: 'idp-token', username: 'member', department_token: 'dt', client_id: 'dispatch' });
    expect(first.grant_type).toBeUndefined();

    h.server.on('POST', '/connect/external-token', { data: tokenResponse() });
    await useAuthStore.getState().retrySsoWithOtp('654321');
    expect(h.server.requestsTo('POST', '/connect/external-token')[1].body).toMatchObject({ external_token: 'idp-token', totp_code: '654321' });
    expect(useAuthStore.getState()).toMatchObject({ status: 'signedIn', authMethod: 'external', isSsoMfaPending: false });
    refreshEngine.endSession();
  });
});

describe('SAML (Responder)', () => {
  let h: Harness;
  beforeEach(() => {
    h = setupHarness('responder');
  });
  afterEach(() => refreshEngine.endSession());

  it("tags the RelayState with this app's client id and refuses a non-https start page", async () => {
    const url = await prepareSamlSignIn('https://api.resgrid.com/api/v4/connect/saml-mobile-login?departmentToken=dt', 'dt');
    expect(url).toMatch(/^https:\/\/api\.resgrid\.com\/api\/v4\/connect\/saml-mobile-login\?departmentToken=dt&RelayState=responder\./);
    await expect(prepareSamlSignIn('http://idp.example.com/sso', 'dt')).resolves.toBeNull();
  });

  it('exchanges a callback whose relay_state matches, once', async () => {
    const start = Date.now();
    const url = (await prepareSamlSignIn('https://api.resgrid.com/start', 'dt-stored', start)) as string;
    const relayState = decodeURIComponent(url.split('RelayState=')[1]);
    h.server.on('POST', '/connect/external-token', { data: tokenResponse() });

    await expect(handleSamlCallbackUrl(`resgrid://auth/callback?saml_response=relay-token&relay_state=${encodeURIComponent(relayState)}`, start + 1000)).resolves.toBe(true);
    expect(h.server.requestsTo('POST', '/connect/external-token')[0].body).toMatchObject({ provider: 'saml2', external_token: 'relay-token', department_token: 'dt-stored' });
    expect(useAuthStore.getState().status).toBe('signedIn');

    // The pending state is spent: a replayed callback is ignored.
    await expect(handleSamlCallbackUrl(`resgrid://auth/callback?saml_response=relay-token&relay_state=${encodeURIComponent(relayState)}`, start + 2000)).resolves.toBe(false);
  });

  it('refuses a forged or expired callback (login CSRF)', async () => {
    const start = Date.now();
    const url = (await prepareSamlSignIn('https://api.resgrid.com/start', 'dt', start)) as string;
    const relayState = decodeURIComponent(url.split('RelayState=')[1]);
    await expect(handleSamlCallbackUrl('resgrid://auth/callback?saml_response=x&relay_state=responder.forged', start)).resolves.toBe(false);

    await prepareSamlSignIn('https://api.resgrid.com/start', 'dt', start);
    await expect(handleSamlCallbackUrl(`resgrid://auth/callback?saml_response=x&relay_state=${encodeURIComponent(relayState)}`, start + PENDING_SAML_STATE_TTL_MS + 1)).resolves.toBe(false);
    expect(h.server.requestsTo('POST', '/connect/external-token')).toHaveLength(0);
  });
});

describe('SSO discovery (Unit + Responder, with a timeout)', () => {
  it('reads PascalCase and camelCase, null-safe', () => {
    expect(
      normalizeSsoConfig({ SsoEnabled: true, ProviderType: 'OIDC', Authority: 'https://idp', ClientId: 'cid', DepartmentId: 4, DepartmentToken: 'dt', BrokeredSsoAvailable: true, AllowLocalLogin: false })
    ).toMatchObject({
      ssoEnabled: true,
      providerType: 'oidc',
      authority: 'https://idp',
      departmentId: 4,
      departmentToken: 'dt',
      brokeredSsoAvailable: true,
      allowLocalLogin: false,
    });
    expect(normalizeSsoConfig({ ssoEnabled: true, providerType: 'saml2', samlLoginUrl: 'https://s' })).toMatchObject({ providerType: 'saml2', samlLoginUrl: 'https://s', allowLocalLogin: true, departmentId: null });
    expect(normalizeSsoConfig(null)).toBeNull();
    expect(normalizeSsoConfig({})).toMatchObject({ ssoEnabled: false, providerType: null, authority: null });
  });

  it('asks anonymously with the app header and a bounded timeout', async () => {
    const h = setupHarness('unit');
    h.server.on('GET', '/Connect/sso-config-for-user', { data: v4({ SsoEnabled: true, ProviderType: 'oidc', DepartmentId: 3 }) });
    const result = await fetchSsoConfigForUser(getAuthApiContext(), 'member@example.com');
    expect(result).toMatchObject({ userExists: true, failed: false, config: { ssoEnabled: true, departmentId: 3 } });
    const [request] = h.server.requestsTo('GET', '/Connect/sso-config-for-user');
    expect(request.headers.Authorization).toBeUndefined();
    expect(request.headers['X-Resgrid-Client']).toBe('unit');
    expect(SSO_DISCOVERY_TIMEOUT_MS).toBeLessThanOrEqual(15_000);
  });

  it('treats an empty answer as an unknown user and a failure as "fall back to password"', async () => {
    const h = setupHarness('unit');
    h.server.on('GET', '/Connect/sso-config-for-user', { data: v4(null) });
    await expect(fetchSsoConfigForUser(getAuthApiContext(), 'nobody')).resolves.toEqual({ config: null, userExists: false, failed: false });
    h.server.on('GET', '/Connect/sso-config-for-user', { network: true });
    await expect(fetchSsoConfigForUser(getAuthApiContext(), 'member')).resolves.toEqual({ config: null, userExists: false, failed: true });
  });

  it('looks up by department code (and throws on failure for the screen to show)', async () => {
    const h = setupHarness('responder');
    h.server.on('GET', '/Connect/sso-config', { data: v4({ SsoEnabled: true, ProviderType: 'saml2' }) });
    await expect(fetchDepartmentSsoConfig(getAuthApiContext(), { departmentCode: 'ABCD' })).resolves.toMatchObject({ providerType: 'saml2' });
    expect(h.server.requestsTo('GET', '/Connect/sso-config')[0].url).toContain('departmentCode=ABCD');
    h.server.on('GET', '/Connect/sso-config', { status: 500 });
    await expect(fetchDepartmentSsoConfig(getAuthApiContext(), { departmentCode: 'ABCD' })).rejects.toBeDefined();
  });
});
