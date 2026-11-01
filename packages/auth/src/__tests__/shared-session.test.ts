import { refreshEngine, useAuthStore } from '../session/auth-store';
import { clientHeaders } from '../session/client-headers';
import { readSharedInstallation, saveSharedInstallation } from '../session/shared-installation';
import {
  afterSharedUnlock,
  checkSharedSession,
  endSharedShift,
  lockSharedSession,
  registerSharedSessionRealtimeControls,
  reportOperatorActivity,
  sharedSessionsEnabled,
} from '../shared-session/shared-session-controller';
import { applySharedSessionStatus, markSharedSessionLocked, resetSharedSession, sharedLockGeneration, useSharedSessionStore } from '../shared-session/shared-session-store';
import { v4 } from './helpers/fake-server';
import { flush, type Harness, setupHarness } from './helpers/harness';
import { tokenResponse } from './helpers/jwt';

const current = (overrides: Record<string, unknown> = {}) => ({
  Operator: 'Member One',
  Client: 'unit',
  Shared: true,
  Locked: false,
  LockVersion: 3,
  LockReason: null,
  IdleLockMinutes: 10,
  IdleLocksAt: '2030-01-01T10:00:00',
  ShiftEndsAt: '2030-01-01T18:00:00',
  InstallationLabel: 'Engine 12 MDT',
  ...overrides,
});

const signIn = async (h: Harness): Promise<void> => {
  h.server.on('POST', '/connect/token', { data: tokenResponse() });
  await useAuthStore.getState().login({ username: 'member', password: 'secret' });
};

describe('shared installation setting', () => {
  it('is an installation setting for variants with shared devices, sent as a header on every request', () => {
    setupHarness('unit');
    expect(readSharedInstallation()).toEqual({ configured: false, shared: false, label: null });
    saveSharedInstallation({ shared: true, label: ' Engine\u0007 12 MDT ' });
    expect(readSharedInstallation()).toEqual({ configured: true, shared: true, label: 'Engine 12 MDT' });
    expect(clientHeaders()).toMatchObject({
      'X-Resgrid-Client': 'unit',
      'X-Resgrid-Shared-Installation': 'true',
      'X-Resgrid-Device-Name': 'Engine 12 MDT',
      'X-Resgrid-Device-Type': 'Pixel 9',
      'X-Resgrid-App-Version': '8.100',
    });
  });

  it('can never be shared in a variant without the capability (Responder is personal)', () => {
    setupHarness('responder');
    expect(sharedSessionsEnabled()).toBe(false);
    saveSharedInstallation({ shared: true, label: 'x' });
    expect(readSharedInstallation().shared).toBe(false);
    expect(clientHeaders()['X-Resgrid-Shared-Installation']).toBeUndefined();
  });
});

describe('shared session store (IC lock generation)', () => {
  beforeEach(() => setupHarness('ic'));

  it('follows the server and reads zone-less UTC timestamps as UTC', () => {
    applySharedSessionStatus(current());
    expect(useSharedSessionStore.getState()).toMatchObject({ shared: true, locked: false, lockVersion: 3, operator: 'Member One', idleLocksAt: Date.UTC(2030, 0, 1, 10), shiftEndsAt: Date.UTC(2030, 0, 1, 18) });
  });

  it('bumps the generation on every lock and on reset, and keeps the known lock version', () => {
    const before = sharedLockGeneration();
    markSharedSessionLocked(9);
    markSharedSessionLocked(null);
    expect(useSharedSessionStore.getState()).toMatchObject({ locked: true, lockVersion: 9 });
    resetSharedSession();
    expect(sharedLockGeneration()).toBe(before + 3);
    expect(useSharedSessionStore.getState().locked).toBe(false);
  });
});

describe('shared session controller (Unit)', () => {
  let h: Harness;
  const realtime = { stop: jest.fn(async () => undefined), resume: jest.fn(async () => undefined) };

  beforeEach(async () => {
    h = setupHarness('unit');
    saveSharedInstallation({ shared: true, label: 'Engine 12' });
    registerSharedSessionRealtimeControls(realtime);
    realtime.stop.mockClear();
    realtime.resume.mockClear();
    await signIn(h);
  });
  afterEach(() => refreshEngine.endSession());

  it('discards a status answer that left before a newer lock', async () => {
    let release: () => void = () => undefined;
    h.server.on('GET', '/sessions/current', () => new Promise((resolve) => (release = () => resolve({ data: v4(current({ Locked: false })) }))));
    const checking = checkSharedSession();
    await flush(10);
    markSharedSessionLocked(4);
    release();
    await checking;
    expect(useSharedSessionStore.getState()).toMatchObject({ locked: true, lockVersion: 4 });
  });

  it('never unlocks from a poll: only an unlock ends a lock', async () => {
    markSharedSessionLocked(4);
    h.server.on('GET', '/sessions/current', { data: v4(current({ Locked: false })) });
    await checkSharedSession();
    expect(useSharedSessionStore.getState().locked).toBe(true);
  });

  it('reports real operator activity at most every 30 seconds, with the activity header', async () => {
    applySharedSessionStatus(current());
    h.server.on('GET', '/sessions/current', { data: v4(current()) });
    reportOperatorActivity(false, 100_000);
    reportOperatorActivity(false, 110_000);
    reportOperatorActivity(false, 131_000);
    await flush(10);
    const polls = h.server.requestsTo('GET', '/sessions/current');
    expect(polls).toHaveLength(2);
    expect(polls[0].headers['X-Resgrid-Operator-Activity']).toBe('1');
  });

  it('locks at once even when the server cannot be reached, and stops the hubs', async () => {
    h.server.on('POST', '/sessions/lock', { network: true });
    await lockSharedSession('background');
    expect(useSharedSessionStore.getState().locked).toBe(true);
    expect(realtime.stop).toHaveBeenCalled();
    expect(useAuthStore.getState().status).toBe('signedIn');
  });

  it('records the lock version the server returns', async () => {
    h.server.on('POST', '/sessions/lock', { data: v4({ Locked: true, LockVersion: 12 }) });
    await lockSharedSession('explicit');
    expect(useSharedSessionStore.getState()).toMatchObject({ locked: true, lockVersion: 12 });
  });

  it('ends the shift and signs out even when the server cannot be reached', async () => {
    h.server.on('POST', '/sessions/end-shift', { network: true });
    await endSharedShift(true);
    expect(h.server.requestsTo('POST', '/sessions/end-shift')[0].body).toEqual({ SwitchOperator: true });
    expect(useAuthStore.getState().status).toBe('signedOut');
    expect(h.wipeScope).toHaveBeenCalledWith('logout');
  });

  it('after an unlock, runs the refresh that waited and resumes the hubs — unless it locked again', async () => {
    refreshEngine.cancel();
    h.server.on('POST', '/connect/token', { data: tokenResponse({ refresh_token: 'after-unlock' }) });
    await afterSharedUnlock();
    expect(useAuthStore.getState().refreshToken).toBe('after-unlock');
    expect(realtime.resume).toHaveBeenCalledTimes(1);

    refreshEngine.cancel();
    markSharedSessionLocked(5);
    await afterSharedUnlock();
    expect(realtime.resume).toHaveBeenCalledTimes(1);
  });

  it('turns a refresh refused because the session is locked into the lock screen, never a sign-out', async () => {
    h.server.on('POST', '/connect/token', { status: 400, data: { error: 'invalid_grant', shared_session_locked: true } });
    await expect(useAuthStore.getState().refreshAccessToken()).resolves.toBe(false);
    expect(useSharedSessionStore.getState().locked).toBe(true);
    expect(useAuthStore.getState().status).toBe('signedIn');
    expect(h.wipeScope).not.toHaveBeenCalled();
  });
});
