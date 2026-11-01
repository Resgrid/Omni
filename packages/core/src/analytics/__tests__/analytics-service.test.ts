// Ported from Unit services/__tests__/countly.service.test.ts and Responder services/__tests__/analytics.service.test.ts.
import { resetEnvForTests } from '../../env/env';
import { AnalyticsService, toSegmentation } from '../analytics-service';
import type { CountlyClient } from '../types';

jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: {} } }));
jest.mock('react-native-logs', () => ({ consoleTransport: jest.fn(), logger: { createLogger: () => ({}) } }));
jest.mock('countly-sdk-react-native-bridge', () => ({ __esModule: true, default: {} }));
jest.mock('countly-sdk-react-native-bridge/CountlyConfig', () => ({ __esModule: true, default: jest.fn() }));

const mockConstants = jest.requireMock('expo-constants').default as { expoConfig: { extra?: Record<string, unknown> } };

const makeClient = () => {
  const client = {
    init: jest.fn<Promise<void>, Parameters<CountlyClient['init']>>(() => Promise.resolve()),
    recordEvent: jest.fn<void, Parameters<CountlyClient['recordEvent']>>(),
    setUserData: jest.fn<void, Parameters<CountlyClient['setUserData']>>(),
    endSession: jest.fn<void, []>(),
  };
  return client;
};

const ready = async (options = {}) => {
  const client = makeClient();
  const service = new AnalyticsService(client, { enableLogging: false, ...options });
  await service.initialize('app-key', 'https://countly.example.com');
  return { client, service };
};

describe('AnalyticsService', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  describe('initialization', () => {
    it('initialises the client once', async () => {
      const { client, service } = await ready();
      await service.initialize('app-key', 'https://countly.example.com');
      expect(client.init).toHaveBeenCalledTimes(1);
      expect(client.init).toHaveBeenCalledWith('app-key', 'https://countly.example.com', { loggingEnabled: false });
      expect(service.isServiceInitialized()).toBe(true);
    });

    it('rethrows an SDK init failure and stays uninitialised', async () => {
      const client = makeClient();
      client.init.mockRejectedValueOnce(new Error('native module missing'));
      const service = new AnalyticsService(client, { enableLogging: false });
      await expect(service.initialize('k', 'u')).rejects.toThrow('native module missing');
      expect(service.isServiceInitialized()).toBe(false);
    });

    it('initializeWithEnv skips quietly when Countly is not configured (Responder)', async () => {
      mockConstants.expoConfig.extra = { env: { COUNTLY_APP_KEY: '', COUNTLY_SERVER_URL: '' } };
      resetEnvForTests();
      const client = makeClient();
      const service = new AnalyticsService(client, { enableLogging: false });
      await service.initializeWithEnv();
      expect(client.init).not.toHaveBeenCalled();
    });

    it('initializeWithEnv reads COUNTLY_APP_KEY and COUNTLY_SERVER_URL and never rejects', async () => {
      mockConstants.expoConfig.extra = { env: { COUNTLY_APP_KEY: 'env-key', COUNTLY_SERVER_URL: 'https://countly.env' } };
      resetEnvForTests();
      const client = makeClient();
      client.init.mockRejectedValueOnce(new Error('boom'));
      const service = new AnalyticsService(client, { enableLogging: false });
      await expect(service.initializeWithEnv()).resolves.toBeUndefined();
      expect(client.init).toHaveBeenCalledWith('env-key', 'https://countly.env', { loggingEnabled: false });
    });
  });

  describe('tracking', () => {
    it('skips events before initialisation', () => {
      const client = makeClient();
      new AnalyticsService(client, { enableLogging: false }).trackEvent('call_viewed');
      expect(client.recordEvent).not.toHaveBeenCalled();
    });

    it('records events with string segmentation and count 1', async () => {
      const { client, service } = await ready();
      service.trackEvent('call_viewed', { callId: 12, priority: 'high', hasNotes: true });
      expect(client.recordEvent).toHaveBeenCalledWith('call_viewed', { callId: '12', priority: 'high', hasNotes: 'true' }, 1);
    });

    it('never sends sensitive-looking properties', () => {
      expect(toSegmentation({ username: 'pat', userEmail: 'p@x', accessToken: 't', screen: 'login' })).toEqual({ screen: 'login' });
    });

    it('does not track while disabled', async () => {
      const { client, service } = await ready();
      client.recordEvent.mockImplementation(() => {
        throw new Error('fail');
      });
      service.trackEvent('a');
      service.trackEvent('b');
      expect(service.isAnalyticsDisabled()).toBe(true);
      client.recordEvent.mockClear();
      service.trackEvent('c');
      expect(client.recordEvent).not.toHaveBeenCalled();
      service.reset();
    });
  });

  describe('error handling', () => {
    it('handles tracking errors gracefully', async () => {
      const { client, service } = await ready();
      client.recordEvent.mockImplementationOnce(() => {
        throw new Error('Network error');
      });
      expect(() => service.trackEvent('x')).not.toThrow();
      expect(service.getStatus().retryCount).toBe(1);
    });

    it('resets the retry counter after a successful event (Unit fix)', async () => {
      const { client, service } = await ready();
      client.recordEvent.mockImplementationOnce(() => {
        throw new Error('transient');
      });
      service.trackEvent('fails');
      expect(service.getStatus().retryCount).toBe(1);
      service.trackEvent('succeeds');
      expect(service.getStatus().retryCount).toBe(0);
    });

    it('does not disable analytics for isolated failures separated by successes', async () => {
      const { client, service } = await ready({ maxRetries: 2 });
      const fail = () => {
        throw new Error('transient');
      };
      client.recordEvent.mockImplementationOnce(fail);
      service.trackEvent('1');
      service.trackEvent('2');
      client.recordEvent.mockImplementationOnce(fail);
      service.trackEvent('3');
      // Without the reset, two lifetime errors would have disabled analytics.
      expect(service.isAnalyticsDisabled()).toBe(false);
      expect(service.getStatus().retryCount).toBe(1);
    });

    it('disables after max consecutive failures and re-enables after the timeout', async () => {
      jest.useFakeTimers();
      const { client, service } = await ready({ maxRetries: 2, disableTimeoutMs: 60_000 });
      client.recordEvent.mockImplementation(() => {
        throw new Error('down');
      });
      service.trackEvent('1');
      service.trackEvent('2');
      expect(service.getStatus()).toEqual(expect.objectContaining({ isDisabled: true, retryCount: 2, disableTimeoutMinutes: 1 }));

      jest.advanceTimersByTime(60_000);
      expect(service.isAnalyticsDisabled()).toBe(false);
      expect(service.getStatus().retryCount).toBe(0);
    });
  });

  describe('user properties and sessions (Responder)', () => {
    it('sets string user properties without sensitive keys', async () => {
      const { client, service } = await ready();
      service.setUserProperties({ departmentId: 42, isAdmin: false, email: 'pat@example.com' });
      expect(client.setUserData).toHaveBeenCalledWith({ departmentId: '42', isAdmin: 'false' });
    });

    it('ends the session only when initialised', async () => {
      const client = makeClient();
      const service = new AnalyticsService(client, { enableLogging: false });
      service.endSession();
      expect(client.endSession).not.toHaveBeenCalled();
      await service.initialize('k', 'u');
      service.endSession();
      expect(client.endSession).toHaveBeenCalledTimes(1);
    });

    it('swallows client errors', async () => {
      const { client, service } = await ready();
      client.setUserData.mockImplementation(() => {
        throw new Error('x');
      });
      client.endSession.mockImplementation(() => {
        throw new Error('y');
      });
      expect(() => service.setUserProperties({ a: 1 })).not.toThrow();
      expect(() => service.endSession()).not.toThrow();
    });
  });

  it('reset clears counters, and a full reset forgets initialisation', async () => {
    const { client, service } = await ready();
    client.recordEvent.mockImplementationOnce(() => {
      throw new Error('x');
    });
    service.trackEvent('a');
    service.reset();
    expect(service.getStatus()).toEqual(expect.objectContaining({ retryCount: 0, isDisabled: false, isInitialized: true }));
    service.reset(true);
    expect(service.isServiceInitialized()).toBe(false);
  });
});
