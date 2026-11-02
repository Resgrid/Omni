import { resetAppLifecycleForTests } from '../../lifecycle/app-lifecycle';
import { addLogListener, logger } from '../../logging/logger';
import type { LogRecord } from '../../logging/types';
import {
  APP_UPDATE_FOREGROUND_INTERVAL_MS,
  applyAppUpdate,
  checkForAppUpdate,
  configureAppUpdates,
  getAppUpdateRestartBlocker,
  getAppUpdatesState,
  isForegroundCheckDue,
  registerAppUpdateRestartGuard,
  resetAppUpdatesForTests,
  startAppUpdates,
  subscribeAppUpdates,
} from '../app-updates';
import type { UpdatesCheckResult, UpdatesFetchResult, UpdatesModule } from '../types';

jest.mock('react-native', () => {
  const handlers: ((state: string) => void)[] = [];
  return {
    Platform: { OS: 'ios' },
    AppState: {
      currentState: 'active',
      addEventListener: jest.fn((_event: string, handler: (state: string) => void) => {
        handlers.push(handler);
        return { remove: () => handlers.splice(handlers.indexOf(handler), 1) };
      }),
      __emit: (state: string) => handlers.forEach((h) => h(state)),
    },
  };
});
jest.mock('react-native-logs', () => ({ consoleTransport: jest.fn(), logger: { createLogger: () => ({}) } }));

const rn = jest.requireMock('react-native') as { Platform: { OS: string }; AppState: { currentState: string; __emit: (s: string) => void } };

const NOT_AVAILABLE: UpdatesCheckResult = { isAvailable: false, isRollBackToEmbedded: false };
const AVAILABLE: UpdatesCheckResult = { isAvailable: true, isRollBackToEmbedded: false, manifest: { id: 'update-2' } };
const FETCHED: UpdatesFetchResult = { isNew: true, isRollBackToEmbedded: false, manifest: { id: 'update-2' } };

/** Stands in for `expo-updates` (the shape apps/omni passes in). */
function mockUpdatesModule(overrides: Partial<UpdatesModule> = {}): UpdatesModule & { checkForUpdateAsync: jest.Mock; fetchUpdateAsync: jest.Mock; reloadAsync: jest.Mock } {
  return {
    isEnabled: true,
    updateId: 'update-1',
    channel: 'production',
    runtimeVersion: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678',
    createdAt: new Date('2026-10-30T12:00:00Z'),
    isEmbeddedLaunch: false,
    isEmergencyLaunch: false,
    emergencyLaunchReason: null,
    checkForUpdateAsync: jest.fn(async () => NOT_AVAILABLE),
    fetchUpdateAsync: jest.fn(async () => FETCHED),
    reloadAsync: jest.fn(async () => undefined),
    ...overrides,
  } as UpdatesModule & { checkForUpdateAsync: jest.Mock; fetchUpdateAsync: jest.Mock; reloadAsync: jest.Mock };
}

/** Lets settled mock promises run their continuations (fake timers do not fake promises). */
const flushPromises = async (): Promise<void> => {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
};

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};

describe('app updates service', () => {
  let logs: LogRecord[];
  let detach: () => void;

  beforeEach(() => {
    rn.Platform.OS = 'ios';
    rn.AppState.currentState = 'active';
    resetAppLifecycleForTests();
    resetAppUpdatesForTests();
    logger.setMinLevel('debug');
    logs = [];
    detach = addLogListener((record) => logs.push(record));
  });

  afterEach(() => {
    detach();
    logger.setMinLevel('warn');
    resetAppUpdatesForTests();
    resetAppLifecycleForTests();
    jest.useRealTimers();
  });

  describe('when disabled', () => {
    it('is a no-op without a module (web, Electron, development builds)', async () => {
      configureAppUpdates({ module: null });
      expect(getAppUpdatesState()).toEqual(expect.objectContaining({ enabled: false, status: 'idle', current: null }));
      await expect(checkForAppUpdate('manual')).resolves.toEqual(expect.objectContaining({ enabled: false, lastCheckAt: null }));
      await expect(applyAppUpdate('user')).resolves.toBe('disabled');
      startAppUpdates();
      expect(logs).toEqual([]);
    });

    it('is a no-op when expo-updates reports isEnabled false (Expo Go, no update URL)', async () => {
      const module = mockUpdatesModule({ isEnabled: false });
      configureAppUpdates({ module });
      await checkForAppUpdate('manual');
      expect(module.checkForUpdateAsync).not.toHaveBeenCalled();
      expect(getAppUpdatesState().enabled).toBe(false);
    });

    it('stays off on web even when a module is passed (expo-updates web stub reports enabled)', async () => {
      rn.Platform.OS = 'web';
      const module = mockUpdatesModule();
      configureAppUpdates({ module });
      await checkForAppUpdate('manual');
      expect(module.checkForUpdateAsync).not.toHaveBeenCalled();
      expect(getAppUpdatesState().enabled).toBe(false);
    });
  });

  it('exposes the running update', () => {
    configureAppUpdates({ module: mockUpdatesModule({ isEmbeddedLaunch: true }) });
    expect(getAppUpdatesState()).toEqual({
      enabled: true,
      status: 'idle',
      lastCheckAt: null,
      pending: null,
      errorCode: null,
      current: {
        updateId: 'update-1',
        channel: 'production',
        runtimeVersion: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678',
        createdAt: new Date('2026-10-30T12:00:00Z'),
        isEmbeddedLaunch: true,
        isEmergencyLaunch: false,
        emergencyLaunchReason: null,
      },
    });
  });

  it('checks, then fetches, then reports ready', async () => {
    jest.useFakeTimers({ now: new Date('2026-11-01T08:00:00Z') });
    const module = mockUpdatesModule({ checkForUpdateAsync: jest.fn(async () => AVAILABLE) });
    configureAppUpdates({ module });
    const statuses: string[] = [];
    subscribeAppUpdates(() => statuses.push(getAppUpdatesState().status));

    const result = await checkForAppUpdate('manual');

    expect(module.checkForUpdateAsync).toHaveBeenCalledTimes(1);
    expect(module.fetchUpdateAsync).toHaveBeenCalledTimes(1);
    expect(statuses).toEqual(['checking', 'downloading', 'ready']);
    expect(result).toEqual(
      expect.objectContaining({ status: 'ready', lastCheckAt: Date.parse('2026-11-01T08:00:00Z'), pending: { updateId: 'update-2', isRollBackToEmbedded: false, downloadedAt: Date.parse('2026-11-01T08:00:00Z') } })
    );
    expect(logs.map((record) => record.message)).toContain('App update downloaded');
  });

  it('does not fetch when the server has nothing newer', async () => {
    const module = mockUpdatesModule();
    configureAppUpdates({ module });
    const result = await checkForAppUpdate('bootstrap');
    expect(module.fetchUpdateAsync).not.toHaveBeenCalled();
    expect(result.status).toBe('idle');
    expect(result.lastCheckAt).not.toBeNull();
    expect(result.pending).toBeNull();
  });

  it('treats a roll-back to the embedded update as ready to apply', async () => {
    const module = mockUpdatesModule({
      checkForUpdateAsync: jest.fn(async () => ({ isAvailable: false, isRollBackToEmbedded: true })),
      fetchUpdateAsync: jest.fn(async () => ({ isNew: false, isRollBackToEmbedded: true })),
    });
    configureAppUpdates({ module });
    const result = await checkForAppUpdate('manual');
    expect(result.status).toBe('ready');
    expect(result.pending).toEqual(expect.objectContaining({ updateId: null, isRollBackToEmbedded: true }));
  });

  it('runs one check at a time: concurrent callers share it', async () => {
    const gate = deferred<UpdatesCheckResult>();
    const module = mockUpdatesModule({ checkForUpdateAsync: jest.fn(() => gate.promise) });
    configureAppUpdates({ module });

    const first = checkForAppUpdate('bootstrap');
    const second = checkForAppUpdate('foreground');
    const third = checkForAppUpdate('manual');
    expect(second).toBe(first);
    expect(third).toBe(first);
    expect(getAppUpdatesState().status).toBe('checking');

    gate.resolve(AVAILABLE);
    await Promise.all([first, second, third]);
    expect(module.checkForUpdateAsync).toHaveBeenCalledTimes(1);
    expect(module.fetchUpdateAsync).toHaveBeenCalledTimes(1);

    // Settled: the next call starts a new check.
    await checkForAppUpdate('manual');
    expect(module.checkForUpdateAsync).toHaveBeenCalledTimes(2);
  });

  it('swallows a failed check, keeps the error code and logs no server text', async () => {
    const failure = Object.assign(new Error('GET https://u.expo.dev/x?token=secret-value failed'), { code: 'ERR_UPDATES_CHECK' });
    const module = mockUpdatesModule({ checkForUpdateAsync: jest.fn(async () => Promise.reject(failure)) });
    configureAppUpdates({ module });

    await expect(checkForAppUpdate('foreground')).resolves.toEqual(expect.objectContaining({ status: 'error', errorCode: 'ERR_UPDATES_CHECK' }));

    const warning = logs.find((record) => record.level === 'warn');
    expect(warning).toEqual(expect.objectContaining({ message: 'App update check failed', context: expect.objectContaining({ trigger: 'foreground', code: 'ERR_UPDATES_CHECK' }) }));
    expect(JSON.stringify(logs)).not.toContain('secret-value');
    expect(JSON.stringify(logs)).not.toContain('u.expo.dev');
  });

  it('swallows a failed download and keeps an update that is already downloaded', async () => {
    const module = mockUpdatesModule({ checkForUpdateAsync: jest.fn(async () => AVAILABLE) });
    configureAppUpdates({ module });
    await checkForAppUpdate('manual');
    expect(getAppUpdatesState().status).toBe('ready');

    module.fetchUpdateAsync.mockRejectedValueOnce(new TypeError('Network request failed'));
    await expect(checkForAppUpdate('manual')).resolves.toEqual(expect.objectContaining({ status: 'ready', errorCode: 'TypeError', pending: expect.objectContaining({ updateId: 'update-2' }) }));
  });

  describe('apply', () => {
    async function downloaded(overrides: Partial<UpdatesModule> = {}) {
      const module = mockUpdatesModule({ checkForUpdateAsync: jest.fn(async () => AVAILABLE), ...overrides });
      configureAppUpdates({ module });
      await checkForAppUpdate('manual');
      return module;
    }

    it('restarts with reloadAsync once an update is downloaded', async () => {
      const module = mockUpdatesModule();
      configureAppUpdates({ module });
      await expect(applyAppUpdate('user')).resolves.toBe('nothing-pending');
      expect(module.reloadAsync).not.toHaveBeenCalled();

      const ready = await downloaded();
      await expect(applyAppUpdate('user')).resolves.toBe('restarting');
      expect(ready.reloadAsync).toHaveBeenCalledTimes(1);
      // A second tap does not reload twice.
      await expect(applyAppUpdate('user')).resolves.toBe('restarting');
      expect(ready.reloadAsync).toHaveBeenCalledTimes(1);
    });

    it('holds an automatic restart while a guard objects (voice session) and logs the reason', async () => {
      const module = await downloaded();
      let voiceConnected = true;
      registerAppUpdateRestartGuard('voice', () => (voiceConnected ? 'voice' : null));

      expect(getAppUpdateRestartBlocker()).toBe('voice');
      await expect(applyAppUpdate('auto')).resolves.toBe('blocked');
      expect(module.reloadAsync).not.toHaveBeenCalled();
      expect(logs.find((record) => record.message === 'App update restart held')?.context).toEqual(expect.objectContaining({ reason: 'voice', trigger: 'auto' }));

      voiceConnected = false;
      await expect(applyAppUpdate('auto')).resolves.toBe('restarting');
      expect(module.reloadAsync).toHaveBeenCalledTimes(1);
    });

    it('restarts when a person taps restart, even while a guard objects', async () => {
      const module = await downloaded();
      registerAppUpdateRestartGuard('voice', () => 'voice');
      await expect(applyAppUpdate('user')).resolves.toBe('restarting');
      expect(module.reloadAsync).toHaveBeenCalledTimes(1);
    });

    it('treats a guard that throws as a reason to wait', async () => {
      await downloaded();
      registerAppUpdateRestartGuard('broken', () => {
        throw new Error('store unavailable');
      });
      expect(getAppUpdateRestartBlocker()).toBe('broken');
      await expect(applyAppUpdate('auto')).resolves.toBe('blocked');
    });

    it('reports a refused reload without throwing', async () => {
      const module = await downloaded({ reloadAsync: jest.fn(async () => Promise.reject(Object.assign(new Error('no runtime'), { code: 'ERR_UPDATES_RELOAD' }))) });
      await expect(applyAppUpdate('user')).resolves.toBe('failed');
      expect(logs.find((record) => record.level === 'warn')?.context).toEqual(expect.objectContaining({ code: 'ERR_UPDATES_RELOAD' }));
      // A later attempt may try again.
      module.reloadAsync.mockResolvedValueOnce(undefined);
      await expect(applyAppUpdate('user')).resolves.toBe('restarting');
    });
  });

  describe('launch report', () => {
    it('logs a warning for an emergency launch, once', () => {
      configureAppUpdates({ module: mockUpdatesModule({ isEmergencyLaunch: true, isEmbeddedLaunch: true, emergencyLaunchReason: 'Failed to launch update update-9' }) });
      startAppUpdates();
      startAppUpdates();
      const warnings = logs.filter((record) => record.level === 'warn');
      expect(warnings).toHaveLength(1);
      expect(warnings[0].message).toMatch(/Emergency launch/);
      expect(warnings[0].context).toEqual(expect.objectContaining({ reason: 'Failed to launch update update-9', updateId: 'update-1', channel: 'production' }));
    });

    it('logs no warning for a normal launch', () => {
      configureAppUpdates({ module: mockUpdatesModule() });
      startAppUpdates();
      expect(logs.filter((record) => record.level === 'warn')).toEqual([]);
    });
  });

  describe('foreground checks', () => {
    const goBackgroundThenActive = (): void => {
      rn.AppState.__emit('background');
      jest.advanceTimersByTime(200);
      rn.AppState.__emit('active');
      jest.advanceTimersByTime(200);
    };

    it('checks on return to the foreground at most every 30 minutes', async () => {
      jest.useFakeTimers({ now: new Date('2026-11-01T08:00:00Z') });
      const module = mockUpdatesModule();
      configureAppUpdates({ module });
      startAppUpdates();

      goBackgroundThenActive();
      await flushPromises();
      expect(module.checkForUpdateAsync).toHaveBeenCalledTimes(1);
      expect(getAppUpdatesState().status).toBe('idle');

      // Ten minutes later: throttled.
      jest.setSystemTime(new Date('2026-11-01T08:10:00Z'));
      goBackgroundThenActive();
      await flushPromises();
      expect(module.checkForUpdateAsync).toHaveBeenCalledTimes(1);

      // Thirty minutes after the first check: due again.
      jest.setSystemTime(new Date('2026-11-01T08:30:01Z'));
      goBackgroundThenActive();
      await flushPromises();
      expect(module.checkForUpdateAsync).toHaveBeenCalledTimes(2);
    });

    it('counts a recent bootstrap check against the window', async () => {
      jest.useFakeTimers({ now: new Date('2026-11-01T08:00:00Z') });
      const module = mockUpdatesModule();
      configureAppUpdates({ module });
      startAppUpdates();
      await checkForAppUpdate('bootstrap');

      jest.setSystemTime(new Date('2026-11-01T08:05:00Z'));
      goBackgroundThenActive();
      expect(module.checkForUpdateAsync).toHaveBeenCalledTimes(1);
    });

    it('does nothing where updates are disabled', () => {
      jest.useFakeTimers();
      const module = mockUpdatesModule({ isEnabled: false });
      configureAppUpdates({ module });
      startAppUpdates();
      goBackgroundThenActive();
      expect(module.checkForUpdateAsync).not.toHaveBeenCalled();
    });

    it('applies the throttle rule', () => {
      expect(isForegroundCheckDue(null, 1_000)).toBe(true);
      expect(isForegroundCheckDue(0, APP_UPDATE_FOREGROUND_INTERVAL_MS - 1)).toBe(false);
      expect(isForegroundCheckDue(0, APP_UPDATE_FOREGROUND_INTERVAL_MS)).toBe(true);
    });
  });
});
