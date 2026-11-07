import { getConfig } from '@resgrid/api';
import { enforceAppAccess, loadSessionGates } from '@resgrid/auth';
import { refreshDataWorkingSet } from '@resgrid/data';
import { useRealtimeStore } from '@resgrid/realtime';
import { initializeVoice } from '@resgrid/voice';

import { activateVariant } from '../../__tests__/helpers/variants';
import { resetShellRuntimeForTests, setShellRuntime } from '../../runtime/runtime-holder';
import { getShellState, resetShellSessionState, resetShellStateForTests, setShellState } from '../../runtime/shell-state';
import { createAppInit } from '../create-app-init';
import { createSessionSteps } from '../default-steps';

jest.mock('@resgrid/auth', () => ({
  ...jest.requireActual('@resgrid/auth'),
  loadSessionGates: jest.fn(async () => ({ appAccess: 'allowed' })),
  enforceAppAccess: jest.fn(async (onDenied?: () => void) => {
    onDenied?.();

    return true;
  }),
}));

jest.mock('@resgrid/api', () => ({
  ...jest.requireActual('@resgrid/api'),
  getConfig: jest.fn(async () => ({ Data: { EventingUrl: 'https://events.example.com/', NovuApplicationId: 'novu' } })),
}));

const mockHydrate = jest.fn(async () => ({ fieldReady: true }));
const mockOutboxRefresh = jest.fn(async () => ({}));
const mockOutboxDrain = jest.fn(async () => ({ status: 'completed' }));
const mockIsOnline = jest.fn(() => true);

function session(variantId: 'unit' | 'bigboard' = 'unit') {
  const variant = activateVariant(variantId);

  return createAppInit({ name: 'session-test', retry: false, steps: createSessionSteps({ variant }) });
}

describe('session (signed-in) steps', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetShellStateForTests();
    resetShellRuntimeForTests();
    setShellRuntime({ auth: { context: {} } as never, offline: { sync: { hydrate: mockHydrate }, outbox: { refresh: mockOutboxRefresh, drain: mockOutboxDrain }, connectivity: { isOnline: mockIsOnline } } as never });
  });

  it('runs gates (+ department config) → outbox recount → working set → outbox drain → realtime hubs → hydration → voice → push', async () => {
    const init = session('unit');
    const status = await init.run();

    expect(status.state).toBe('ready');
    expect(status.completedSteps).toEqual(['session.gates', 'session.outbox', 'session.working-set', 'session.outbox-drain', 'session.realtime', 'session.hydration', 'session.voice', 'session.push']);
    expect(loadSessionGates).toHaveBeenCalledTimes(1);
    // Storage opened before the session existed, so its outbox snapshot held every write back: counted again for this user.
    expect(mockOutboxRefresh).toHaveBeenCalledTimes(1);
    expect(getConfig).toHaveBeenCalledTimes(1);
    expect(getShellState().departmentConfig?.EventingUrl).toBe('https://events.example.com/');
    expect(refreshDataWorkingSet).toHaveBeenCalledTimes(1);
    // Nothing else would send the writes it can now see while the connection stays up; sent after the pull, as on a reconnect.
    expect(mockOutboxDrain).toHaveBeenCalledTimes(1);
    expect(mockOutboxDrain.mock.invocationCallOrder[0]).toBeGreaterThan(jest.mocked(refreshDataWorkingSet).mock.invocationCallOrder[0] ?? Infinity);
    expect(useRealtimeStore.getState().connectAll).toHaveBeenCalledTimes(1);
    expect(mockHydrate).toHaveBeenCalledTimes(1);
    expect(initializeVoice).toHaveBeenCalledTimes(1);
    // CallKeep is set up in every app with voice (the legacy apps' text, translated, with the app's name).
    expect(initializeVoice).toHaveBeenCalledWith({
      callKeep: expect.objectContaining({ appName: expect.stringMatching(/^Resgrid /), android: expect.objectContaining({ foregroundService: expect.objectContaining({ channelId: 'voice_call' }) }) }),
    });
    expect(getShellState().pushRegistrationArmed).toBe(true);
  });

  // The working set is dozens of requests on a slow link: the bootstrap no longer waits for it before connecting the
  // hubs and arming push; the drain and hydration follow it in the background, as on a reconnect.
  it('is ready, with hubs and push armed, while the working set is still loading', async () => {
    let finishPull: () => void = () => undefined;
    jest.mocked(refreshDataWorkingSet).mockImplementationOnce(() => new Promise<void>((resolve) => (finishPull = resolve)));
    const status = await session('unit').run();

    expect(status.state).toBe('ready');
    expect(useRealtimeStore.getState().connectAll).toHaveBeenCalledTimes(1);
    expect(getShellState().pushRegistrationArmed).toBe(true);
    expect(mockOutboxDrain).not.toHaveBeenCalled();
    expect(mockHydrate).not.toHaveBeenCalled();

    finishPull();
    await new Promise((resolve) => setImmediate(resolve));
    expect(mockOutboxDrain).toHaveBeenCalledTimes(1);
    expect(mockHydrate).toHaveBeenCalledTimes(1);
  });

  it('skips voice where the variant has no PTT (BigBoard)', async () => {
    const init = session('bigboard');
    await init.run();
    expect(initializeVoice).not.toHaveBeenCalled();
  });

  it('leaves queued writes to the reconnect trigger when signing in offline', async () => {
    mockIsOnline.mockReturnValueOnce(false);
    const status = await session().run();

    expect(status.completedSteps).toContain('session.outbox-drain');
    expect(mockOutboxRefresh).toHaveBeenCalledTimes(1);
    expect(mockOutboxDrain).not.toHaveBeenCalled();
  });

  it('a failing hub, working-set, outbox refresh or drain does not fail the bootstrap (optional steps)', async () => {
    (refreshDataWorkingSet as jest.Mock).mockRejectedValueOnce(new Error('offline'));
    mockOutboxRefresh.mockRejectedValueOnce(new Error('database busy'));
    mockOutboxDrain.mockRejectedValueOnce(new Error('database busy'));
    (useRealtimeStore.getState().connectAll as jest.Mock).mockRejectedValueOnce(new Error('hub down'));
    const status = await session().run();
    expect(status.state).toBe('ready');
  });

  it('stops (no retry) after the app-access gate signs a member out, leaving the denial notice', async () => {
    (loadSessionGates as jest.Mock).mockResolvedValueOnce({ appAccess: 'denied' });
    const status = await session().run();

    expect(status.state).toBe('stopped');
    expect(enforceAppAccess).toHaveBeenCalledTimes(1);
    expect(getShellState().accessDeniedNotice).toBe(true);
    expect(refreshDataWorkingSet).not.toHaveBeenCalled();
    expect(mockOutboxRefresh).not.toHaveBeenCalled();
    expect(mockOutboxDrain).not.toHaveBeenCalled();
  });

  it('keeps going when the department config cannot be loaded', async () => {
    (getConfig as jest.Mock).mockRejectedValueOnce(new Error('timeout'));
    const status = await session().run();
    expect(status.state).toBe('ready');
    expect(getShellState().departmentConfig).toBeNull();
  });

  it('a sign-out drops the ending session’s sync counts and keeps the connection state', () => {
    setShellState({ isOffline: true, unsentChanges: 3, changesNeedingAttention: 2 });
    resetShellSessionState();
    expect(getShellState()).toMatchObject({ isOffline: true, unsentChanges: 0, changesNeedingAttention: 0 });
  });
});
