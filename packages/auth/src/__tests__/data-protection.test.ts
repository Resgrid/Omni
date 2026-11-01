import { getCurrentUsersRights, getSsoConfig } from '@resgrid/api';

import { readProtectedGrantHeaders } from '../data-protection/grant-provider';
import { dataProtectionStore, ensureGrant, fetchDataProtectionCapabilities, getProtectedGrantHeaders, grantFrom, isStepUpActive, verifyStepUpOtp } from '../data-protection/grant-store';
import { isFieldRedacted, isRedactedValue, ProtectedFieldIds, REDACTION_VALUE, revealedValue } from '../data-protection/redacted';
import { getAuthApiContext } from '../runtime/api-context';
import { refreshEngine, useAuthStore } from '../session/auth-store';
import { markSharedSessionLocked } from '../shared-session/shared-session-store';
import { v4 } from './helpers/fake-server';
import { flush, type Harness, setupHarness } from './helpers/harness';
import { tokenResponse } from './helpers/jwt';

const grant = (token: string, expiresInMs: number) => ({ GrantId: 'g', GrantToken: token, StepUpExpiresOnUtc: new Date(Date.now() + expiresInMs).toISOString().replace('Z', ''), StepUpWindowMinutes: 15 });

describe('protected-data grants (memory only, absolute window)', () => {
  let h: Harness;
  beforeEach(async () => {
    h = setupHarness('dispatch');
    h.server.on('POST', '/connect/token', { data: tokenResponse() });
    await useAuthStore.getState().login({ username: 'dispatcher', password: 'pw' });
  });
  afterEach(() => {
    refreshEngine.endSession();
    jest.useRealTimers();
  });

  it('sends X-Resgrid-Protected-Grant on authenticated requests while the grant is live, never on anonymous ones', async () => {
    h.server.on('POST', '/DataProtection/VerifyStepUp', { data: grant('grant-token', 15 * 60_000) });
    await expect(verifyStepUpOtp(' 123456 ')).resolves.toBe(true);
    expect(h.server.requestsTo('POST', '/DataProtection/VerifyStepUp')[0].body).toEqual({ Code: '123456' });
    expect(isStepUpActive()).toBe(true);

    h.server.on('GET', '/Security/GetCurrentUsersRights', { data: v4({}) });
    await getCurrentUsersRights(getAuthApiContext());
    expect(h.server.requestsTo('GET', '/Security/GetCurrentUsersRights')[0].headers['X-Resgrid-Protected-Grant']).toBe('grant-token');

    h.server.on('GET', '/Connect/sso-config', { data: v4({}) });
    await getSsoConfig(getAuthApiContext(), { departmentCode: 'x' });
    expect(h.server.requestsTo('GET', '/Connect/sso-config')[0].headers['X-Resgrid-Protected-Grant']).toBeUndefined();
  });

  it('conceals at the window end (expiry timer) and never attaches a lapsed grant', async () => {
    jest.useFakeTimers();
    h.server.on('POST', '/DataProtection/VerifyStepUp', { data: grant('short', 60_000) });
    await verifyStepUpOtp('123456');
    expect(readProtectedGrantHeaders()).toEqual({ 'X-Resgrid-Protected-Grant': 'short' });
    await jest.advanceTimersByTimeAsync(60_001);
    expect(dataProtectionStore.getState().grantToken).toBeNull();
    expect(getProtectedGrantHeaders()).toEqual({});
  });

  it('checks expiry at the moment of use, even before the timer runs', () => {
    dataProtectionStore.setState({ grantToken: 'stale', stepUpExpiresAt: Date.now() - 1 });
    expect(getProtectedGrantHeaders()).toEqual({});
    expect(isStepUpActive()).toBe(false);
  });

  it('refuses a token-less or already-expired answer as a grant', () => {
    expect(grantFrom({ GrantToken: null, StepUpExpiresOnUtc: new Date(Date.now() + 60_000).toISOString() })).toBeNull();
    expect(grantFrom({ GrantToken: 't', StepUpExpiresOnUtc: new Date(Date.now() - 1).toISOString() })).toBeNull();
    // Zone-less UTC is read as UTC.
    const zoneless = grantFrom({ GrantToken: 't', StepUpExpiresOnUtc: '2099-01-01T00:00:00' });
    expect(zoneless?.stepUpExpiresAt).toBe(Date.UTC(2099, 0, 1));
  });

  it('drops the grant on sign-out and discards a step-up that finishes afterwards (session generation)', async () => {
    let release: () => void = () => undefined;
    h.server.on('POST', '/DataProtection/VerifyStepUp', () => new Promise((resolve) => (release = () => resolve({ data: grant('late', 60_000) }))));
    const verifying = verifyStepUpOtp('123456');
    await flush(10);
    await useAuthStore.getState().logout();
    release();
    await expect(verifying).resolves.toBe(false);
    expect(dataProtectionStore.getState()).toMatchObject({ grantToken: null, isVerifying: false });
  });

  it('conceals when the shared session locks (Unit shared-lock generation)', async () => {
    h.server.on('POST', '/DataProtection/VerifyStepUp', { data: grant('g1', 60_000) });
    await verifyStepUpOtp('123456');
    h.server.on('GET', '/DataProtection/Capabilities', { data: v4({ IsProtectionEnabled: true, StepUpWindowMinutes: 10 }) });
    await fetchDataProtectionCapabilities();
    markSharedSessionLocked(3);
    expect(dataProtectionStore.getState()).toMatchObject({ grantToken: null, capabilities: { isProtectionEnabled: true, stepUpWindowMinutes: 10 } });
  });

  it('ensureGrant: an exempt client is granted, everyone else steps up, an unconfigured server is unavailable', async () => {
    h.server.on('POST', '/DataProtection/RequestGrant', { data: grant('exempt', 60_000) });
    await expect(ensureGrant()).resolves.toBe('granted');
    dataProtectionStore.setState({ grantToken: null, stepUpExpiresAt: null });

    h.server.on('POST', '/DataProtection/RequestGrant', { status: 403, data: { type: 'step_up_required' } });
    await expect(ensureGrant()).resolves.toBe('step_up_required');
    h.server.on('POST', '/DataProtection/RequestGrant', { status: 503, data: { type: 'grants_not_configured' } });
    await expect(ensureGrant()).resolves.toBe('unavailable');
    h.server.on('POST', '/DataProtection/RequestGrant', { network: true });
    await expect(ensureGrant()).resolves.toBe('step_up_required');
  });

  it('reports a wrong code by type, never the code', async () => {
    h.server.on('POST', '/DataProtection/VerifyStepUp', { status: 400, data: { type: 'invalid_totp' } });
    await expect(verifyStepUpOtp('000000')).resolves.toBe(false);
    expect(dataProtectionStore.getState().lastError).toBe('invalid_totp');
  });
});

describe('REDACTED sentinel helpers', () => {
  it('prefers the RedactedFields list (an empty list means nothing was withheld) and falls back to the sentinel', () => {
    expect(isFieldRedacted(['Calls.Notes'], ProtectedFieldIds.callNotes, 'x')).toBe(true);
    expect(isFieldRedacted([], ProtectedFieldIds.callNotes, REDACTION_VALUE)).toBe(false);
    expect(isFieldRedacted(null, ProtectedFieldIds.callNotes, REDACTION_VALUE)).toBe(true);
    expect(isFieldRedacted(undefined, ProtectedFieldIds.callNotes, 'redacted')).toBe(false);
    expect(isRedactedValue('REDACTED')).toBe(true);
    expect(revealedValue(['calls.address'], ProtectedFieldIds.callAddress, 'REDACTED')).toBeNull();
    expect(revealedValue([], ProtectedFieldIds.callAddress, 'REDACTED')).toBe('REDACTED');
  });
});
