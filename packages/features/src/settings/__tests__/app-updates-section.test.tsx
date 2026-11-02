/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock factories run before imports, so they require their stand-ins. */
import './test-setup';

import { configureAppUpdates, registerAppUpdateRestartGuard, resetAppUpdatesForTests, type UpdatesCheckResult, type UpdatesModule } from '@resgrid/core';
import { createMemoryKvBackend, DurableKv } from '@resgrid/offline';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { fakeAuthStore, resetFakeAuth } from '../../auth-ui/__tests__/auth-fake';
import { setDevicePreferencesKv } from '../../auth-ui/lib/device-kv';
import { resetSettingsSectionsForTests } from '../registry';
import { resetSettingsRuntimeForTests } from '../runtime';
import { SettingsScreen } from '../screens/settings-screen';
import { AppUpdatesSection } from '../sections/app-updates-section';
import { activateTestVariant } from './variant';

jest.mock('@resgrid/auth', () => require('../../auth-ui/__tests__/auth-fake').buildAuthMock(jest.requireActual('@resgrid/auth')));
jest.mock('@resgrid/voice', () => require('./native-mocks').voiceModule());
jest.mock('@resgrid/notifications', () => require('./native-mocks').notificationsModule());
jest.mock('@resgrid/realtime', () => require('./native-mocks').realtimeModule());
jest.mock('@resgrid/location', () => require('./native-mocks').locationModule());
jest.mock('../../auth-ui/lib/api-context', () => ({ authUiApi: () => ({}), hasAuthUiApi: () => false }));

const AVAILABLE: UpdatesCheckResult = { isAvailable: true, isRollBackToEmbedded: false, manifest: { id: 'f00dbabe-2222-4333-8444-555566667777' } };

/** Stands in for `expo-updates` (what apps/omni passes to configureAppUpdates). */
const mockUpdatesModule = (overrides: Partial<UpdatesModule> = {}): UpdatesModule & { checkForUpdateAsync: jest.Mock; fetchUpdateAsync: jest.Mock; reloadAsync: jest.Mock } =>
  ({
    isEnabled: true,
    updateId: '0a1b2c3d-1111-4222-8333-444455556666',
    channel: 'production',
    runtimeVersion: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678',
    createdAt: new Date('2026-10-30T12:00:00Z'),
    isEmbeddedLaunch: true,
    isEmergencyLaunch: false,
    emergencyLaunchReason: null,
    checkForUpdateAsync: jest.fn(async () => ({ isAvailable: false, isRollBackToEmbedded: false })),
    fetchUpdateAsync: jest.fn(async () => ({ isNew: true, isRollBackToEmbedded: false, manifest: AVAILABLE.manifest })),
    reloadAsync: jest.fn(async () => undefined),
    ...overrides,
  }) as UpdatesModule & { checkForUpdateAsync: jest.Mock; fetchUpdateAsync: jest.Mock; reloadAsync: jest.Mock };

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};

const sectionIds = (): string[] => screen.getAllByTestId(/^settings-section-/).map((node) => String(node.props.testID).replace('settings-section-', ''));

describe('Settings → App updates', () => {
  beforeEach(() => {
    resetAppUpdatesForTests();
    resetFakeAuth();
    resetSettingsSectionsForTests();
    resetSettingsRuntimeForTests();
    fakeAuthStore.setState({ status: 'signedIn', accessToken: 'token' });
    setDevicePreferencesKv(new DurableKv(createMemoryKvBackend('settings-updates')));
  });

  afterEach(() => {
    setDevicePreferencesKv(undefined);
    resetAppUpdatesForTests();
  });

  it('is listed between Advanced and About where updates work, and hidden where they do not (web, Electron, development)', async () => {
    activateTestVariant('bigboard');
    const { unmount } = await render(<SettingsScreen />);
    expect(sectionIds()).not.toContain('app-updates');
    await unmount();

    configureAppUpdates({ module: mockUpdatesModule() });
    await render(<SettingsScreen />);
    expect(sectionIds()).toEqual(['account', 'preferences', 'notifications', 'advanced', 'app-updates', 'about', 'logout']);
  });

  it('shows the version, channel, runtime version and the running update', async () => {
    configureAppUpdates({ module: mockUpdatesModule() });
    await render(<AppUpdatesSection />);

    expect(screen.getByTestId('settings-updates-version')).toHaveTextContent(/settings\.version/);
    expect(screen.getByTestId('settings-updates-channel')).toHaveTextContent(/production/);
    expect(screen.getByTestId('settings-updates-runtime')).toHaveTextContent(/a1b2c3d4e5f6/);
    expect(screen.getByTestId('settings-updates-runtime')).not.toHaveTextContent(/a1b2c3d4e5f60718/);
    expect(screen.getByTestId('settings-updates-current')).toHaveTextContent(/0a1b2c3d/);
    expect(screen.getByTestId('settings-updates-current')).not.toHaveTextContent(/1111-4222/);
    expect(screen.getByTestId('settings-updates-current')).toHaveTextContent(/settings\.app_updates\.published \[date=/);
    expect(screen.getByTestId('settings-updates-source')).toHaveTextContent(/settings\.app_updates\.source_embedded/);
    expect(screen.queryByTestId('settings-updates-status')).toBeNull();
    expect(screen.queryByTestId('settings-updates-restart')).toBeNull();
    expect(screen.queryByTestId('settings-updates-emergency')).toBeNull();
  });

  it('explains an emergency launch', async () => {
    configureAppUpdates({ module: mockUpdatesModule({ isEmergencyLaunch: true, emergencyLaunchReason: 'launch failed' }) });
    await render(<AppUpdatesSection />);
    expect(screen.getByTestId('settings-updates-emergency')).toHaveTextContent('settings.app_updates.emergency_launch');
  });

  it('checks on demand, shows progress and ignores a second tap while the check runs', async () => {
    const gate = deferred<UpdatesCheckResult>();
    const module = mockUpdatesModule({ checkForUpdateAsync: jest.fn(() => gate.promise) });
    configureAppUpdates({ module });
    await render(<AppUpdatesSection />);

    await fireEvent.press(screen.getByTestId('settings-updates-check'));
    expect(screen.getByTestId('settings-updates-status')).toHaveTextContent('settings.app_updates.checking');
    expect(screen.getByTestId('settings-updates-check')).toBeDisabled();
    await fireEvent.press(screen.getByTestId('settings-updates-check'));
    expect(module.checkForUpdateAsync).toHaveBeenCalledTimes(1);

    await act(async () => {
      gate.resolve({ isAvailable: false, isRollBackToEmbedded: false });
      await gate.promise;
    });
    expect(screen.getByTestId('settings-updates-status')).toHaveTextContent(/settings\.app_updates\.up_to_date \[time=/);
    expect(screen.getByTestId('settings-updates-check')).not.toBeDisabled();
    expect(screen.queryByTestId('settings-updates-restart')).toBeNull();
  });

  it('says when the check failed', async () => {
    configureAppUpdates({ module: mockUpdatesModule({ checkForUpdateAsync: jest.fn(async () => Promise.reject(new Error('offline'))) }) });
    await render(<AppUpdatesSection />);
    await fireEvent.press(screen.getByTestId('settings-updates-check'));
    expect(await screen.findByText('settings.app_updates.check_failed')).toBeOnTheScreen();
  });

  it('offers "Restart to update" once an update is downloaded and restarts through the service', async () => {
    const module = mockUpdatesModule({ checkForUpdateAsync: jest.fn(async () => AVAILABLE) });
    configureAppUpdates({ module });
    await render(<AppUpdatesSection />);

    await fireEvent.press(screen.getByTestId('settings-updates-check'));
    expect(await screen.findByTestId('settings-updates-restart')).toBeOnTheScreen();
    expect(screen.getByTestId('settings-updates-status')).toHaveTextContent('settings.app_updates.ready');
    expect(module.fetchUpdateAsync).toHaveBeenCalledTimes(1);

    await fireEvent.press(screen.getByTestId('settings-updates-restart'));
    expect(module.reloadAsync).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByTestId('settings-updates-restart'));
    expect(module.reloadAsync).toHaveBeenCalledTimes(1);
  });

  it('restarts on the button even while a voice session is connected: the member chose to', async () => {
    const module = mockUpdatesModule({ checkForUpdateAsync: jest.fn(async () => AVAILABLE) });
    configureAppUpdates({ module });
    registerAppUpdateRestartGuard('voice', () => 'voice');
    await render(<AppUpdatesSection />);

    await fireEvent.press(screen.getByTestId('settings-updates-check'));
    await fireEvent.press(await screen.findByTestId('settings-updates-restart'));

    expect(module.reloadAsync).toHaveBeenCalledTimes(1);
  });
});
