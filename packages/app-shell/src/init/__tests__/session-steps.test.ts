import { getConfig } from '@resgrid/api';
import { enforceAppAccess, loadSessionGates } from '@resgrid/auth';
import { refreshDataWorkingSet } from '@resgrid/data';
import { useRealtimeStore } from '@resgrid/realtime';
import { initializeVoice } from '@resgrid/voice';

import { activateVariant } from '../../__tests__/helpers/variants';
import { resetShellRuntimeForTests, setShellRuntime } from '../../runtime/runtime-holder';
import { getShellState, resetShellStateForTests } from '../../runtime/shell-state';
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

function session(variantId: 'unit' | 'bigboard' = 'unit') {
  const variant = activateVariant(variantId);
  return createAppInit({ name: 'session-test', retry: false, steps: createSessionSteps({ variant }) });
}

describe('session (signed-in) steps', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetShellStateForTests();
    resetShellRuntimeForTests();
    setShellRuntime({ auth: { context: {} } as never, offline: { sync: { hydrate: mockHydrate } } as never });
  });

  it('runs gates (+ department config) → working set → realtime hubs → hydration → voice → push', async () => {
    const init = session('unit');
    const status = await init.run();

    expect(status.state).toBe('ready');
    expect(status.completedSteps).toEqual(['session.gates', 'session.working-set', 'session.realtime', 'session.hydration', 'session.voice', 'session.push']);
    expect(loadSessionGates).toHaveBeenCalledTimes(1);
    expect(getConfig).toHaveBeenCalledTimes(1);
    expect(getShellState().departmentConfig?.EventingUrl).toBe('https://events.example.com/');
    expect(refreshDataWorkingSet).toHaveBeenCalledTimes(1);
    expect(useRealtimeStore.getState().connectAll).toHaveBeenCalledTimes(1);
    expect(mockHydrate).toHaveBeenCalledTimes(1);
    expect(initializeVoice).toHaveBeenCalledTimes(1);
    expect(getShellState().pushRegistrationArmed).toBe(true);
  });

  it('skips voice where the variant has no PTT (BigBoard)', async () => {
    const init = session('bigboard');
    await init.run();
    expect(initializeVoice).not.toHaveBeenCalled();
  });

  it('a failing hub or working-set refresh does not fail the bootstrap (optional steps)', async () => {
    (refreshDataWorkingSet as jest.Mock).mockRejectedValueOnce(new Error('offline'));
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
  });

  it('keeps going when the department config cannot be loaded', async () => {
    (getConfig as jest.Mock).mockRejectedValueOnce(new Error('timeout'));
    const status = await session().run();
    expect(status.state).toBe('ready');
    expect(getShellState().departmentConfig).toBeNull();
  });
});
