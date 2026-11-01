import { getBaseApiUrl, switchServer, useAuthStore } from '@resgrid/auth';
import { initI18n } from '@resgrid/i18n';
import { configureLocation } from '@resgrid/location';
import { configureNotifications, type NotificationsDependencies, pushNotificationService } from '@resgrid/notifications';
import { defaultResetRegistry } from '@resgrid/offline';
import { __getMmkvFile, __resetMmkvFake, __seedMmkvFile } from '@resgrid/offline/__tests__/fakes/mmkv';
import { configureRealtime, teardownRealtime } from '@resgrid/realtime';
import { configureVoice, registerVoiceResets } from '@resgrid/voice';

import { activateVariant } from '../../__tests__/helpers/variants';
import { defineRoutes } from '../../routes/define-routes';
import { setRouteContract } from '../../routes/href';
import { registerLegacyKeySource, resetLegacyKeySourcesForTests } from '../../runtime/legacy-keys';
import { getShellRuntime, resetShellRuntimeForTests } from '../../runtime/runtime-holder';
import { getShellState, resetShellStateForTests } from '../../runtime/shell-state';
import { createAppInit } from '../create-app-init';
import { createStartupSteps, resetDefaultStepsForTests } from '../default-steps';

const LEGACY_KEY = 'legacy-unit-key1';

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
    resetLegacyKeySourcesForTests();
    resetDefaultStepsForTests();
    defaultResetRegistry.clear();
    setRouteContract(defineRoutes(['home']));
    jest.clearAllMocks();
  });

  afterEach(() => {
    getShellRuntime().offline?.dispose();
  });

  it('runs Sentry → i18n → storage → preferences → auth → platform packages, in order', async () => {
    const { init } = startup();
    const status = await init.run();

    expect(status.state).toBe('ready');
    expect(status.completedSteps).toEqual(['startup.sentry', 'startup.i18n', 'startup.offline', 'startup.preferences', 'startup.auth', 'startup.packages']);
    expect(initI18n).toHaveBeenCalledWith({ variantResources: undefined });
    expect(getShellRuntime().offline).not.toBeNull();
    expect(getShellRuntime().auth).not.toBeNull();
    expect(configureRealtime).toHaveBeenCalledTimes(1);
    expect(configureLocation).toHaveBeenCalledTimes(1);
    expect(configureVoice).toHaveBeenCalledTimes(1);
    expect(pushNotificationService.initialize).toHaveBeenCalledTimes(1);
  });

  it('opens the frozen MMKV instance with the legacy key from a registered build-secret source and reads device preferences', async () => {
    __seedMmkvFile('ResgridUnit', LEGACY_KEY, { SELECTED_THEME: 'dark', IS_FIRST_TIME: false, local: 'de' });
    registerLegacyKeySource(({ keySecret, instanceId }) => (keySecret === 'UNIT_MMKV_KEY' && instanceId === 'ResgridUnit' ? LEGACY_KEY : null));
    const { init } = startup();

    await init.run();

    expect(getShellRuntime().offline?.storage.keySources.ResgridUnit).toBe('legacy');
    expect(getShellState().themeMode).toBe('dark');
    expect(getShellState().onboardingRequired).toBe(false);
    expect(initI18n).toHaveBeenLastCalledWith({ language: 'de', variantResources: undefined });
    expect(__getMmkvFile('ResgridUnit')?.data.get('SELECTED_THEME')).toBe('dark');
  });

  it('without a key source the legacy (encrypted) data is not readable — the documented S4 gap', async () => {
    __seedMmkvFile('ResgridUnit', LEGACY_KEY, { SELECTED_THEME: 'dark' });
    const { init } = startup();

    await init.run();

    expect(getShellRuntime().offline?.storage.keySources.ResgridUnit).toBe('none');
    expect(getShellState().themeMode).toBe('system');
    expect(getShellState().onboardingRequired).toBe(true);
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
