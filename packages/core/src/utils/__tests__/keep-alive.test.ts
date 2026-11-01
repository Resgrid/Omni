// Ported in spirit from Unit src/lib/hooks/__tests__/use-keep-alive.test.tsx (storage moved to the offline package).
import { logger } from '../../logging/logger';
import { isKeepAwakeSupported, KEEP_ALIVE_STORAGE_KEY, loadKeepAliveState, setKeepAwake } from '../keep-alive';

jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
jest.mock('react-native-logs', () => ({ consoleTransport: jest.fn(), logger: { createLogger: () => ({}) } }));
jest.mock('expo-keep-awake', () => ({ activateKeepAwakeAsync: jest.fn(() => Promise.resolve()), deactivateKeepAwake: jest.fn(() => Promise.resolve()) }));

const mockPlatform = jest.requireMock('react-native').Platform as { OS: string };
const keepAwake = jest.requireMock('expo-keep-awake') as { activateKeepAwakeAsync: jest.Mock; deactivateKeepAwake: jest.Mock };

describe('keep alive', () => {
  beforeEach(() => {
    mockPlatform.OS = 'ios';
    jest.clearAllMocks();
  });

  it('keeps the legacy storage key', () => {
    expect(KEEP_ALIVE_STORAGE_KEY).toBe('KEEP_ALIVE_ENABLED');
  });

  it('activates and deactivates keep-awake on native', async () => {
    await expect(setKeepAwake(true)).resolves.toBe(true);
    expect(keepAwake.activateKeepAwakeAsync).toHaveBeenCalledWith('settings');
    await expect(setKeepAwake(false)).resolves.toBe(true);
    expect(keepAwake.deactivateKeepAwake).toHaveBeenCalledWith('settings');
  });

  it('skips keep-awake on web (Dispatch/BigBoard)', async () => {
    mockPlatform.OS = 'web';
    expect(isKeepAwakeSupported()).toBe(false);
    await expect(setKeepAwake(true)).resolves.toBe(false);
    await loadKeepAliveState(() => true);
    expect(keepAwake.activateKeepAwakeAsync).not.toHaveBeenCalled();
  });

  it('logs failures instead of throwing (Unit)', async () => {
    const errorSpy = jest.spyOn(logger, 'error');
    keepAwake.activateKeepAwakeAsync.mockRejectedValueOnce(new Error('no activity'));
    await expect(setKeepAwake(true)).resolves.toBe(false);
    expect(errorSpy).toHaveBeenCalledWith(expect.objectContaining({ message: 'Failed to update keep alive state' }));
    errorSpy.mockRestore();
  });

  it('re-applies the stored choice on startup only when enabled', async () => {
    await loadKeepAliveState(() => false);
    await loadKeepAliveState(() => undefined);
    expect(keepAwake.activateKeepAwakeAsync).not.toHaveBeenCalled();
    await loadKeepAliveState(() => true);
    expect(keepAwake.activateKeepAwakeAsync).toHaveBeenCalledTimes(1);
  });

  it('survives a failing storage read', async () => {
    await expect(
      loadKeepAliveState(() => {
        throw new Error('corrupt');
      })
    ).resolves.toBeUndefined();
  });
});
