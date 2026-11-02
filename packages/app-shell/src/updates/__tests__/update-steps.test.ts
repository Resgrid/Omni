import { applyAppUpdate, checkForAppUpdate, configureAppUpdates, getAppUpdateRestartBlocker, getAppUpdatesState, resetAppUpdatesForTests, type UpdatesModule } from '@resgrid/core';
import { useLiveKitStore } from '@resgrid/voice';

import { createAppInit, type InitStep } from '../../init/create-app-init';
import { APP_UPDATES_SESSION_STEP_ID, APP_UPDATES_STARTUP_STEP_ID, createAppUpdatesSessionStep, createAppUpdatesStartupStep, registerAppUpdateSteps } from '../update-steps';

/** Stands in for `expo-updates` (what apps/omni passes to configureAppUpdates). */
const mockUpdatesModule = (overrides: Partial<UpdatesModule> = {}): UpdatesModule & { checkForUpdateAsync: jest.Mock; fetchUpdateAsync: jest.Mock; reloadAsync: jest.Mock } =>
  ({
    isEnabled: true,
    updateId: 'update-1',
    channel: 'production',
    runtimeVersion: 'abc123',
    createdAt: new Date('2026-10-30T12:00:00Z'),
    isEmbeddedLaunch: false,
    isEmergencyLaunch: false,
    emergencyLaunchReason: null,
    checkForUpdateAsync: jest.fn(async () => ({ isAvailable: true, isRollBackToEmbedded: false, manifest: { id: 'update-2' } })),
    fetchUpdateAsync: jest.fn(async () => ({ isNew: true, isRollBackToEmbedded: false, manifest: { id: 'update-2' } })),
    reloadAsync: jest.fn(async () => undefined),
    ...overrides,
  }) as UpdatesModule & { checkForUpdateAsync: jest.Mock; fetchUpdateAsync: jest.Mock; reloadAsync: jest.Mock };

const step = (id: string, run: InitStep['run'] = () => undefined): InitStep => ({ id, run });

const flushPromises = async (): Promise<void> => {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
};

describe('app update init steps', () => {
  beforeEach(() => {
    resetAppUpdatesForTests();
    useLiveKitStore.setState({ isConnected: false, isConnecting: false });
  });

  afterEach(() => resetAppUpdatesForTests());

  it('places the startup step after Sentry and the session step after the bootstrap', () => {
    const startup = createAppInit({ name: 'startup-test', retry: false, steps: [step('startup.sentry'), step('startup.i18n'), step('startup.packages')] });
    const session = createAppInit({ name: 'session-test', retry: false, steps: [step('session.gates'), step('session.realtime'), step('session.push')] });
    registerAppUpdateSteps(startup, session);
    expect(startup.getSteps().map((s) => s.id)).toEqual(['startup.sentry', APP_UPDATES_STARTUP_STEP_ID, 'startup.i18n', 'startup.packages']);
    expect(session.getSteps().map((s) => s.id)).toEqual(['session.gates', 'session.realtime', 'session.push', APP_UPDATES_SESSION_STEP_ID]);
  });

  it('starts the check without waiting for it: the bootstrap finishes while the check is still out', async () => {
    const module = mockUpdatesModule({ checkForUpdateAsync: jest.fn(() => new Promise(() => undefined)) });
    configureAppUpdates({ module });
    const session = createAppInit({ name: 'session-test', retry: false, steps: [step('session.gates'), createAppUpdatesSessionStep(), step('session.after')] });

    const status = await session.run();

    expect(status.state).toBe('ready');
    expect(status.completedSteps).toEqual(['session.gates', APP_UPDATES_SESSION_STEP_ID, 'session.after']);
    expect(module.checkForUpdateAsync).toHaveBeenCalledTimes(1);
    expect(getAppUpdatesState().status).toBe('checking');
  });

  it('cannot fail the bootstrap: a failing check is logged and the phase stays ready', async () => {
    const module = mockUpdatesModule({ checkForUpdateAsync: jest.fn(async () => Promise.reject(new Error('offline'))) });
    configureAppUpdates({ module });
    const session = createAppInit({ name: 'session-test', retry: false, steps: [createAppUpdatesSessionStep()] });

    const status = await session.run();
    await flushPromises();

    expect(status.state).toBe('ready');
    expect(status.failedStep).toBeNull();
    expect(getAppUpdatesState()).toEqual(expect.objectContaining({ status: 'error', errorCode: 'Error' }));
  });

  it('is a no-op where updates are disabled (no module on web, Electron and development builds)', async () => {
    configureAppUpdates({ module: null });
    const session = createAppInit({ name: 'session-test', retry: false, steps: [createAppUpdatesSessionStep()] });
    await expect(session.run()).resolves.toEqual(expect.objectContaining({ state: 'ready' }));
    expect(getAppUpdatesState().lastCheckAt).toBeNull();
  });

  it('registers the voice guard at startup: no restart while a voice session is connected or connecting', async () => {
    const module = mockUpdatesModule();
    configureAppUpdates({ module });
    const startup = createAppInit({ name: 'startup-test', retry: false, steps: [createAppUpdatesStartupStep()] });
    await startup.run();
    await checkForAppUpdate('manual');

    useLiveKitStore.setState({ isConnecting: true });
    expect(getAppUpdateRestartBlocker()).toBe('voice');
    useLiveKitStore.setState({ isConnecting: false, isConnected: true });
    // The wall rule waits for the voice session to end...
    await expect(applyAppUpdate('auto')).resolves.toBe('blocked');
    expect(module.reloadAsync).not.toHaveBeenCalled();

    useLiveKitStore.setState({ isConnected: false });
    expect(getAppUpdateRestartBlocker()).toBeNull();
    await expect(applyAppUpdate('auto')).resolves.toBe('restarting');
    expect(module.reloadAsync).toHaveBeenCalledTimes(1);
  });
});
