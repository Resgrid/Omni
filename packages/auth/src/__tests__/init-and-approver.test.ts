import type { Logger } from '@resgrid/core/logging/types';

import { initAuth } from '../init-auth';
import { approvePendingRequest, approverEnabled, denyPendingRequest, fetchPendingApproval } from '../mfa/approver';
import { getActiveDepartmentId } from '../rights/security-store';
import { refreshEngine, useAuthStore } from '../session/auth-store';
import { getBaseApiUrl } from '../session/server-url';
import { __setPasskeyOutcome } from './fakes/react-native-passkey';
import { FakeServer, v4 } from './helpers/fake-server';
import { createMemoryStorage, resetAuthModules, setupHarness } from './helpers/harness';
import { accessToken, tokenResponse } from './helpers/jwt';
import { activateVariant } from './helpers/variant';

describe('initAuth (the shell’s one call)', () => {
  afterEach(() => refreshEngine.endSession());

  it('binds storage, wires the injected services, builds the authenticated context and restores the session', async () => {
    resetAuthModules();
    const manifest = activateVariant('unit');
    const storage = createMemoryStorage(manifest, {
      ResgridUnit: {
        'auth-storage': JSON.stringify({ state: { accessToken: accessToken(Math.floor(Date.now() / 1000) + 3600), refreshToken: 'r', userId: 'user-9' }, version: 0 }),
        'security-storage': JSON.stringify({ state: { rights: { DepartmentId: '21' } }, version: 0 }),
        baseUrl: JSON.stringify('https://resgrid.example.org/api/v4'),
      },
    });
    const logger: Logger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    const setTelemetryUser = jest.fn();
    const apiCache = { setScope: jest.fn(), reset: jest.fn() };

    const runtime = await initAuth({ storage, defaultServerUrl: 'https://api.resgrid.com', services: { apiCache, wipeScope: jest.fn(async () => undefined) }, logger, setTelemetryUser, isMobileApp: true });

    expect(useAuthStore.getState()).toMatchObject({ status: 'signedIn', userId: 'user-9', hydrated: true });
    expect(getActiveDepartmentId()).toBe('21');
    expect(getBaseApiUrl()).toBe('https://resgrid.example.org/api/v4');
    expect(setTelemetryUser).toHaveBeenCalledWith('user-9');
    expect(apiCache.setScope).toHaveBeenCalledWith({ departmentId: '21' });
    expect(apiCache.setScope).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user-9', server: 'https://resgrid.example.org/api/v4' }));

    // The returned context is the one the auth stores use, with the mobile scope requested.
    const server = new FakeServer(runtime.http);
    server.on('POST', '/connect/token', { data: tokenResponse() });
    await useAuthStore.getState().logout();
    await useAuthStore.getState().login({ username: 'member', password: 'pw' });
    expect(logger.info).toHaveBeenCalledWith(expect.objectContaining({ message: 'Signed in' }));
    expect(server.requests.slice(-1)[0]).toMatchObject({ baseURL: 'https://resgrid.example.org/api/v4', body: { scope: 'openid profile offline_access mobile', client_id: 'unit' } });
  });
});

describe('Responder as the approver (capabilities.push.approveSignIns)', () => {
  it('lists, approves with a passkey and denies — only in Responder', async () => {
    const h = setupHarness('responder');
    h.server.on('POST', '/connect/token', { data: tokenResponse() });
    await useAuthStore.getState().login({ username: 'member', password: 'pw' });
    expect(approverEnabled()).toBe(true);

    h.server.on('GET', '/MfaApproval/Pending', { data: v4({ ApprovalRequestId: 'ap-1', RequestingApp: 'unit', Purpose: 'login', AttemptsRemaining: 3 }) });
    await expect(fetchPendingApproval()).resolves.toMatchObject({ ApprovalRequestId: 'ap-1', RequestingApp: 'unit' });

    h.server.on('POST', '/MfaApproval/Options', { data: v4({ RequestId: 'req', Options: { challenge: 'c', rpId: 'responder.resgrid.com' } }) });
    h.server.on('POST', '/MfaApproval/Approve', { data: v4({ State: 'approved' }) });
    __setPasskeyOutcome({ ok: true, value: { id: 'cred', response: { authenticatorData: 'a', clientDataJSON: 'c', signature: 's' } } });
    await expect(approvePendingRequest('ap-1', ' 42 ')).resolves.toEqual({ ok: true, state: 'approved' });
    expect(h.server.requestsTo('POST', '/MfaApproval/Approve')[0].body).toMatchObject({ ApprovalRequestId: 'ap-1', MatchNumber: '42', RequestId: 'req' });
    expect(h.server.requestsTo('POST', '/MfaApproval/Approve')[0].headers.Authorization).toMatch(/^Bearer /);

    h.server.on('POST', '/MfaApproval/Deny', { data: v4({ State: 'denied' }) });
    await expect(denyPendingRequest('ap-1', 'not_me')).resolves.toEqual({ ok: true, state: 'denied' });
    refreshEngine.endSession();
  });

  it('refuses without calling the server in every other variant', async () => {
    const h = setupHarness('unit');
    expect(approverEnabled()).toBe(false);
    await expect(fetchPendingApproval()).resolves.toBeNull();
    await expect(approvePendingRequest('ap-1', '42')).resolves.toEqual({ ok: false, code: 'approval_unavailable' });
    await expect(denyPendingRequest('ap-1', 'declined')).resolves.toEqual({ ok: false, code: 'approval_unavailable' });
    expect(h.server.requests).toHaveLength(0);
  });
});
