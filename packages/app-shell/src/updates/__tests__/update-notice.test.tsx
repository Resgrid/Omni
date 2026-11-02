import { checkForAppUpdate, configureAppUpdates, recordUserActivity, registerAppUpdateRestartGuard, resetAppUpdatesForTests, resetUserActivityForTests, type UpdatesModule } from '@resgrid/core';
import { FormFactorProvider, ToastContainer, useToastStore } from '@resgrid/ui';
import { useLiveKitStore } from '@resgrid/voice';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { ShellUpdateNotice } from '../update-notice';
import { voiceSessionRestartGuard } from '../update-steps';
import { decideWallAutoRestart, WALL_AUTO_RESTART_CHECK_INTERVAL_MS, WALL_AUTO_RESTART_IDLE_MS } from '../wall-auto-restart';

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

const START = new Date('2026-11-01T08:00:00Z').getTime();

async function renderNotice({ wall = false }: { wall?: boolean } = {}) {
  await render(
    <FormFactorProvider kiosk={wall}>
      <ShellUpdateNotice />
      <ToastContainer />
    </FormFactorProvider>
  );
}

async function downloadUpdate(): Promise<void> {
  await act(async () => {
    await checkForAppUpdate('manual');
  });
}

async function advance(ms: number): Promise<void> {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

describe('ShellUpdateNotice', () => {
  let module: ReturnType<typeof mockUpdatesModule>;

  beforeEach(() => {
    jest.useFakeTimers({ now: START });
    resetAppUpdatesForTests();
    resetUserActivityForTests(START);
    useLiveKitStore.setState({ isConnected: false, isConnecting: false });
    module = mockUpdatesModule();
    configureAppUpdates({ module });
    registerAppUpdateRestartGuard('voice', voiceSessionRestartGuard);
  });

  afterEach(() => {
    useToastStore.getState().clearToasts();
    resetAppUpdatesForTests();
    jest.useRealTimers();
  });

  it('shows nothing until an update is downloaded, then a non-modal "Update ready" toast', async () => {
    await renderNotice();
    expect(screen.queryByText('Update ready')).toBeNull();

    await downloadUpdate();

    expect(screen.getByText('Update ready')).toBeOnTheScreen();
    expect(screen.getByText('Tap to restart now. Otherwise the update installs the next time the app starts.')).toBeOnTheScreen();
    expect(module.reloadAsync).not.toHaveBeenCalled();
  });

  it('restarts only when the member taps the notice', async () => {
    await renderNotice();
    await downloadUpdate();
    await fireEvent.press(screen.getByText('Update ready'));
    expect(module.reloadAsync).toHaveBeenCalledTimes(1);
  });

  it('restarts on a tap even while a voice session is connected: the member chose to', async () => {
    useLiveKitStore.setState({ isConnected: true });
    await renderNotice();
    await downloadUpdate();
    await fireEvent.press(screen.getByText('Update ready'));
    expect(module.reloadAsync).toHaveBeenCalledTimes(1);
  });

  it('does not bring a dismissed notice back for the same update', async () => {
    await renderNotice();
    await downloadUpdate();
    const [toast] = useToastStore.getState().toasts;
    await fireEvent.press(screen.getByTestId(`toast-dismiss-${toast.id}`));
    expect(screen.queryByText('Update ready')).toBeNull();

    await downloadUpdate();
    expect(screen.queryByText('Update ready')).toBeNull();
  });

  it('never restarts by itself on a phone or tablet', async () => {
    await renderNotice();
    await downloadUpdate();
    await advance(60 * 60_000);
    expect(module.reloadAsync).not.toHaveBeenCalled();
  });

  describe('on a wall display', () => {
    it('restarts by itself once the display has been idle for the idle window after the download', async () => {
      await renderNotice({ wall: true });
      await downloadUpdate();
      expect(screen.getByText('Tap to restart now, or the display restarts by itself after 5 minutes without use.')).toBeOnTheScreen();

      await advance(WALL_AUTO_RESTART_IDLE_MS - WALL_AUTO_RESTART_CHECK_INTERVAL_MS);
      expect(module.reloadAsync).not.toHaveBeenCalled();

      await advance(WALL_AUTO_RESTART_CHECK_INTERVAL_MS);
      expect(module.reloadAsync).toHaveBeenCalledTimes(1);

      await advance(5 * WALL_AUTO_RESTART_CHECK_INTERVAL_MS);
      expect(module.reloadAsync).toHaveBeenCalledTimes(1);
    });

    it('waits while someone is using the display (touches restart the idle timer)', async () => {
      await renderNotice({ wall: true });
      await downloadUpdate();

      await advance(4 * 60_000);
      recordUserActivity(Date.now());
      await advance(4 * 60_000);
      expect(module.reloadAsync).not.toHaveBeenCalled();

      await advance(60_000 + WALL_AUTO_RESTART_CHECK_INTERVAL_MS);
      expect(module.reloadAsync).toHaveBeenCalledTimes(1);
    });

    it('never restarts while a voice session is connected, and restarts after it ends', async () => {
      useLiveKitStore.setState({ isConnected: true });
      await renderNotice({ wall: true });
      await downloadUpdate();

      await advance(30 * 60_000);
      expect(module.reloadAsync).not.toHaveBeenCalled();

      useLiveKitStore.setState({ isConnected: false });
      await advance(WALL_AUTO_RESTART_CHECK_INTERVAL_MS);
      expect(module.reloadAsync).toHaveBeenCalledTimes(1);
    });
  });
});

describe('decideWallAutoRestart', () => {
  const base = { now: START + WALL_AUTO_RESTART_IDLE_MS, readyAt: START, lastActivityAt: START, isActive: true, restartBlocker: null };

  it('restarts once idle for the window since both the download and the last touch', () => {
    expect(decideWallAutoRestart(base)).toBe('restart');
    expect(decideWallAutoRestart({ ...base, now: base.now - 1 })).toBe('wait-for-idle');
    expect(decideWallAutoRestart({ ...base, lastActivityAt: START + 60_000 })).toBe('wait-for-idle');
    expect(decideWallAutoRestart({ ...base, readyAt: START + 60_000, lastActivityAt: START - 60 * 60_000 })).toBe('wait-for-idle');
  });

  it('waits for the foreground and for any restart guard (a connected voice session)', () => {
    expect(decideWallAutoRestart({ ...base, isActive: false })).toBe('wait-for-foreground');
    expect(decideWallAutoRestart({ ...base, restartBlocker: 'voice' })).toBe('held');
  });
});
