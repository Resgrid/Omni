import { getBaseApiUrl, switchServer, useAuthStore } from '@resgrid/auth';
import { initI18n, loadLanguage } from '@resgrid/i18n';
import { configureLocation } from '@resgrid/location';
import { configureNotifications, type NotificationsDependencies, pushNotificationService } from '@resgrid/notifications';
import { defaultResetRegistry, secureKeyName } from '@resgrid/offline';
import { __resetSecureStoreFake, setItemAsync } from '@resgrid/offline/__tests__/fakes/expo-secure-store';
import { __getMmkvFile, __resetMmkvFake, __seedMmkvFile } from '@resgrid/offline/__tests__/fakes/mmkv';
import { configureRealtime, teardownRealtime } from '@resgrid/realtime';
import { configureVoice, registerVoiceResets } from '@resgrid/voice';

import { activateVariant } from '../../__tests__/helpers/variants';
import { defineRoutes } from '../../routes/define-routes';
import { setRouteContract } from '../../routes/href';
import { getShellRuntime, resetShellRuntimeForTests } from '../../runtime/runtime-holder';
import { getShellState, resetShellStateForTests } from '../../runtime/shell-state';
import { createAppInit } from '../create-app-init';
import { createStartupSteps, LANGUAGE_LOAD_BUDGET_MS, resetDefaultStepsForTests } from '../default-steps';

const LEGACY_KEY = '9f066882-5c07-47a4-9bf3-783074b590d5';
const DEVICE_KEY = 'DEVICEKEY0123456';

function startup() {
  const variant = activateVariant('unit');
  const init = createAppInit({ name: 'startup-test', retry: false, steps: createStartupSteps({ variant, i18nResources: undefined }) });
  return { variant, init };
}

const notificationDeps = (): NotificationsDependencies => {
  const calls = (configureNotifications as jest.Mock).mock.calls;
  return calls[calls.length - 1][0] as NotificationsDependencies;
};

describe('startup steps', () => {
  beforeEach(() => {
    __resetMmkvFake();
    resetShellRuntimeForTests();
    resetShellStateForTests();
    __resetSecureStoreFake();
    resetDefaultStepsForTests();
    defaultResetRegistry.clear();
    setRouteContract(defineRoutes(['home']));
    jest.clearAllMocks();
  });

  afterEach(() => {
    getShellRuntime().offline?.dispose();
  });

  it('runs Sentry → analytics → i18n → storage → preferences → auth → platform packages → push, in order', async () => {
    const { init } = startup();
    const status = await init.run();

    expect(status.state).toBe('ready');
    expect(status.completedSteps).toEqual(['startup.sentry', 'startup.analytics', 'startup.i18n', 'startup.offline', 'startup.preferences', 'startup.auth', 'startup.packages', 'startup.push']);
    expect(initI18n).toHaveBeenCalledWith({ variantResources: undefined });
    expect(getShellRuntime().offline).not.toBeNull();
    expect(getShellRuntime().auth).not.toBeNull();
    expect(configureRealtime).toHaveBeenCalledTimes(1);
    expect(configureLocation).toHaveBeenCalledTimes(1);
    expect(configureVoice).toHaveBeenCalledTimes(1);
    // Voice keeps channels and streams alive in the background: the Android service, and connectivity for reconnects.
    expect(configureVoice).toHaveBeenCalledWith(expect.objectContaining({ foregroundService: expect.any(Object), connectivity: getShellRuntime().offline?.connectivity, restrictCallKit: false }));
    expect(pushNotificationService.initialize).toHaveBeenCalledTimes(1);
  });

  // A push setup that fails (permissions, notifee, a browser without push) used to fail the required packages step and
  // hold the app on its loading screen through every retry.
  it('starts without push when its setup fails', async () => {
    jest.mocked(pushNotificationService.initialize).mockRejectedValueOnce(new Error('notifee unavailable'));
    const { init } = startup();
    const status = await init.run();

    expect(status.state).toBe('ready');
    expect(getShellRuntime().auth).not.toBeNull();
  });

  // Only English is bundled: a language chunk that never arrives (a stalled web request) shows English after a moment
  // instead of holding startup for the step timeout.
  it('waits for the language strings only for a moment', async () => {
    jest.mocked(loadLanguage).mockImplementationOnce(() => new Promise<boolean>(() => undefined));
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });

    try {
      const { init } = startup();
      const running = init.run();

      await jest.advanceTimersByTimeAsync(LANGUAGE_LOAD_BUDGET_MS);
      expect((await running).state).toBe('ready');
    } finally {
      jest.useRealTimers();
    }
  });

  it('opens the frozen MMKV instance with its device key from SecureStore and reads device preferences', async () => {
    await setItemAsync(secureKeyName('ResgridUnit'), DEVICE_KEY);
    __seedMmkvFile('ResgridUnit', DEVICE_KEY, { SELECTED_THEME: 'dark', IS_FIRST_TIME: false, local: 'de' });
    const { init } = startup();

    await init.run();

    expect(getShellRuntime().offline?.storage.keySources.ResgridUnit).toBe('secure');
    expect(getShellRuntime().offline?.storage.reinitialized).toEqual([]);
    expect(getShellState().themeMode).toBe('dark');
    expect(getShellState().onboardingRequired).toBe(false);
    expect(initI18n).toHaveBeenLastCalledWith({ language: 'de', variantResources: undefined });
    expect(__getMmkvFile('ResgridUnit')?.key).toBe(DEVICE_KEY);
  });

  it('starts an upgraded Unit install over: the legacy file is deleted and the user onboards again under a new device key', async () => {
    __seedMmkvFile('ResgridUnit', LEGACY_KEY, { SELECTED_THEME: 'dark', IS_FIRST_TIME: false });
    const { init } = startup();

    await init.run();

    const storage = getShellRuntime().offline?.storage;
    expect(storage?.keySources.ResgridUnit).toBe('secure');
    expect(storage?.reinitialized).toEqual(['ResgridUnit']);
    expect(getShellState().themeMode).toBe('system');
    expect(getShellState().onboardingRequired).toBe(true);
    expect(__getMmkvFile('ResgridUnit')?.key).not.toBe(LEGACY_KEY);
    expect(__getMmkvFile('ResgridUnit')?.data.has('SELECTED_THEME')).toBe(false);
  });

  it('wires notifications deep links to the route contract', async () => {
    const { init } = startup();
    await init.run();
    const deps = notificationDeps();

    expect(deps.resolveRoute?.({ kind: 'call', id: '12' })).toBeNull();
    setRouteContract(defineRoutes(['home', 'callDetail']));
    expect(deps.resolveRoute?.({ kind: 'call', id: '12' })).toBe('/call/12');
    expect(deps.isSignedIn()).toBe(false);
    expect(deps.getDeviceUuid()).toBe(deps.getDeviceUuid());
  });

  it('registers the realtime, voice and notification teardowns with the wipe registry', async () => {
    const { init } = startup();
    await init.run();

    expect([...defaultResetRegistry.getTeardowns().keys()]).toEqual(expect.arrayContaining(['realtime', 'notifications']));
    expect(registerVoiceResets).toHaveBeenCalledWith(defaultResetRegistry);
  });

  it('sign-out unregisters push as the ending session BEFORE a server switch changes the URL, then tears down', async () => {
    const { init } = startup();
    await init.run();
    const before = getBaseApiUrl();
    let urlAtUnregister: string | null = null;
    (pushNotificationService.unregisterAtSignOut as jest.Mock).mockImplementation(async () => {
      urlAtUnregister = getBaseApiUrl();
    });
    useAuthStore.setState({ status: 'signedIn', accessToken: 'ending-token', refreshToken: 'refresh', userId: 'user-1' });

    const result = await switchServer('https://api.example.com');

    expect(result).toEqual(expect.objectContaining({ ok: true, changed: true }));
    expect(pushNotificationService.unregisterAtSignOut).toHaveBeenCalledWith('ending-token');
    expect(urlAtUnregister).toBe(before);
    expect(getBaseApiUrl()).not.toBe(before);
    expect(teardownRealtime).toHaveBeenCalled();
    expect(pushNotificationService.clearLocalState).toHaveBeenCalled();
  });

  it('is idempotent across runs (a background relaunch reuses what startup opened)', async () => {
    const { init } = startup();
    await init.run();
    const offline = getShellRuntime().offline;
    await init.run();
    expect(getShellRuntime().offline).toBe(offline);
    expect(pushNotificationService.initialize).toHaveBeenCalledTimes(1);
  });
});
