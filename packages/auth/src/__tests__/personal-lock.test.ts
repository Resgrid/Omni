import { createHash } from 'crypto';

import { startInactivityMonitor } from '../personal-lock/inactivity-monitor';
import { clearPasswordVerification, computePasswordVerification, hasPasswordVerification, PASSWORD_VERIFICATION_HASH_KEY, PASSWORD_VERIFICATION_SALT_KEY, verifyPassword } from '../personal-lock/password-verifier';
import {
  applyPersonalLockAtLaunch,
  isPersonalLockEnabled,
  lockPersonalSession,
  personalLockStore,
  setDefaultInactivityTimeout,
  setLockTimeout,
  shouldLock,
  unlockPersonalSession,
} from '../personal-lock/personal-lock-store';
import { refreshEngine, useAuthStore } from '../session/auth-store';
import { saveSharedInstallation } from '../session/shared-installation';
import { __setAppState } from './fakes/react-native';
import { v4 } from './helpers/fake-server';
import { type Harness, setupHarness } from './helpers/harness';
import { tokenResponse } from './helpers/jwt';

const signInWithPassword = async (h: Harness, password = 'correct horse'): Promise<void> => {
  h.server.on('POST', '/connect/token', { data: tokenResponse() });
  await useAuthStore.getState().login({ username: 'dispatcher', password });
};

describe('lock screen password verifier (Dispatch: salted SHA-256, never the password)', () => {
  let h: Harness;
  beforeEach(async () => {
    h = setupHarness('dispatch');
    await signInWithPassword(h);
  });
  afterEach(() => refreshEngine.endSession());

  it('stores a salted hash after a password sign-in, under the keys Dispatch used', () => {
    const salt = JSON.parse(h.storage.main.getString(PASSWORD_VERIFICATION_SALT_KEY) ?? 'null') as string;
    const hash = JSON.parse(h.storage.main.getString(PASSWORD_VERIFICATION_HASH_KEY) ?? 'null') as string;
    expect(salt).toEqual(expect.any(String));
    expect(hash).toBe(createHash('sha256').update(`${salt}:correct horse`).digest('hex'));
    expect(hash).not.toBe(createHash('sha256').update('correct horse').digest('hex'));
    const everything = h.storage.all().flatMap((kv) => kv.keys().map((key) => kv.getString(key) ?? ''));
    expect(everything.some((value) => value.includes('correct horse'))).toBe(false);
  });

  it('verifies offline: true on a match, false on a mismatch, null with no verifier', async () => {
    await expect(verifyPassword('correct horse')).resolves.toBe(true);
    await expect(verifyPassword('wrong')).resolves.toBe(false);
    clearPasswordVerification();
    await expect(verifyPassword('correct horse')).resolves.toBeNull();
  });

  it('reuses the salt when recomputing', async () => {
    const first = await computePasswordVerification('x');
    const second = await computePasswordVerification('x');
    expect(first?.salt).toBe(second?.salt);
  });

  it('is removed on sign-out', async () => {
    await useAuthStore.getState().logout();
    expect(hasPasswordVerification()).toBe(false);
  });

  it('holds the verifier in memory while the second factor is pending, and stores it only when the sign-in finishes', async () => {
    await useAuthStore.getState().logout();
    h.server.on('POST', '/connect/token', { status: 400, data: { error: 'mfa_required', mfa_transaction: 'tx', mfa_methods: 'totp', mfa_enrolled: 'totp' } });
    await useAuthStore.getState().login({ username: 'dispatcher', password: 'pending pw' });
    expect(hasPasswordVerification()).toBe(false);
    h.server.on('POST', '/Authentication/CompleteTotp', { data: v4({ CompletionCode: 'c', ExpiresIn: 60, Recovery: false, RecoveryCodes: null }) });
    h.server.on('POST', '/connect/token', { data: tokenResponse() });
    await useAuthStore.getState().verifyLoginMfa({ method: 'totp', code: '123456' });
    await expect(verifyPassword('pending pw')).resolves.toBe(true);
  });
});

describe('personal lock (capability-gated, persisted)', () => {
  afterEach(() => {
    refreshEngine.endSession();
    jest.useRealTimers();
  });

  it('applies only to Dispatch password sessions on a personal installation', async () => {
    let h = setupHarness('dispatch');
    await signInWithPassword(h);
    expect(isPersonalLockEnabled()).toBe(true);

    h = setupHarness('dispatch');
    saveSharedInstallation({ shared: true, label: 'Console 2' });
    await signInWithPassword(h);
    expect(isPersonalLockEnabled()).toBe(false);
    expect(hasPasswordVerification()).toBe(false);

    h = setupHarness('unit');
    await signInWithPassword(h);
    expect(isPersonalLockEnabled()).toBe(false);
    expect(hasPasswordVerification()).toBe(false);
  });

  it('does not apply to SSO sessions (no verifier is kept)', async () => {
    const h = setupHarness('dispatch');
    h.server.on('POST', '/connect/external-token', { data: tokenResponse() });
    await useAuthStore.getState().loginWithExternalToken({ provider: 'oidc', externalToken: 'idp', departmentToken: 'dt' });
    expect(useAuthStore.getState().authMethod).toBe('external');
    expect(isPersonalLockEnabled()).toBe(false);
  });

  it('locks after the inactivity timeout and unlocks only with the right password', async () => {
    const h = setupHarness('dispatch');
    await signInWithPassword(h);
    setLockTimeout(15);
    personalLockStore.setState({ lastActivityTime: 1_000 });
    expect(shouldLock(1_000 + 14 * 60_000)).toBe(false);
    expect(shouldLock(1_000 + 15 * 60_000)).toBe(true);
    lockPersonalSession();
    await expect(unlockPersonalSession('nope')).resolves.toBe('wrong_password');
    expect(personalLockStore.getState()).toMatchObject({ isLocked: true, failedAttempts: 1 });
    await expect(unlockPersonalSession('correct horse')).resolves.toBe('unlocked');
    expect(personalLockStore.getState()).toMatchObject({ isLocked: false, failedAttempts: 0 });
  });

  it('applies the configured default timeout when none was persisted, and keeps a persisted choice', async () => {
    const h = setupHarness('dispatch');
    setDefaultInactivityTimeout(20);
    await personalLockStore.persist.rehydrate();
    expect(personalLockStore.getState().lockTimeout).toBe(20);

    setLockTimeout(5);
    await personalLockStore.persist.rehydrate();
    expect(personalLockStore.getState().lockTimeout).toBe(5);
    expect(h.storage.main.getString('personal-lock-storage')).toContain('"lockTimeout":5');
    setDefaultInactivityTimeout(60);
  });

  it('a timeout of 0 turns the automatic lock off', async () => {
    const h = setupHarness('dispatch');
    await signInWithPassword(h);
    setLockTimeout(0);
    expect(shouldLock(Date.now() + 365 * 86400_000)).toBe(false);
  });

  it('persists the lock: killing the app no longer skips it (Dispatch bug)', async () => {
    const h = setupHarness('dispatch');
    await signInWithPassword(h);
    lockPersonalSession();
    const onDisk = h.storage.main.getString('personal-lock-storage') ?? '{}';
    expect((JSON.parse(onDisk) as { state: { isLocked: boolean } }).state.isLocked).toBe(true);

    // "Restart": a fresh process starts unlocked in memory and reads what was on disk when it was killed.
    personalLockStore.setState({ isLocked: false });
    h.storage.main.set('personal-lock-storage', onDisk);
    await personalLockStore.persist.rehydrate();
    applyPersonalLockAtLaunch();
    expect(personalLockStore.getState().isLocked).toBe(true);
  });

  it('opens locked on a cold start after the inactivity window', async () => {
    const h = setupHarness('dispatch');
    await signInWithPassword(h);
    personalLockStore.setState({ isLocked: false, lastActivityTime: Date.now() - 2 * 3600_000, lockTimeout: 60 });
    applyPersonalLockAtLaunch();
    expect(personalLockStore.getState().isLocked).toBe(true);
  });

  it('the inactivity monitor locks on its interval and on a resume past the timeout', async () => {
    jest.useFakeTimers();
    const h = setupHarness('dispatch');
    await signInWithPassword(h);
    setLockTimeout(1);
    personalLockStore.setState({ lastActivityTime: Date.now() });
    const onLock = jest.fn();
    const stop = startInactivityMonitor({ onLock, intervalMs: 30_000 });
    await jest.advanceTimersByTimeAsync(30_000);
    expect(onLock).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(30_000);
    expect(onLock).toHaveBeenCalledTimes(1);
    stop();

    await unlockPersonalSession('correct horse');
    const onResumeLock = jest.fn();
    const stopAgain = startInactivityMonitor({ onLock: onResumeLock });
    __setAppState('background');
    personalLockStore.setState({ lastActivityTime: Date.now() - 2 * 60_000 });
    __setAppState('active');
    expect(onResumeLock).toHaveBeenCalledTimes(1);
    stopAgain();
  });
});
