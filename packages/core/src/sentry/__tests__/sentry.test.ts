import { resetActiveVariantForTests } from '@resgrid/config';

import { resetEnvForTests } from '../../env/env';
import { logger } from '../../logging/logger';
import { captureBoundaryError, createSentryOptions, getSentryRelease, initSentry, isSentryInitialized, resetSentryForTests, setSentryUser, wrapRootComponent } from '../sentry';

jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: {} } }));
jest.mock('react-native-logs', () => ({ consoleTransport: jest.fn(), logger: { createLogger: () => ({}) } }));
jest.mock('@sentry/react-native', () => {
  const mockScope = { setTags: jest.fn() };
  return {
    init: jest.fn(),
    addBreadcrumb: jest.fn(),
    captureException: jest.fn(),
    captureMessage: jest.fn(),
    setUser: jest.fn(),
    getGlobalScope: jest.fn(() => mockScope),
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
    wrap: jest.fn((component: unknown) => component),
    reactNavigationIntegration: jest.fn(() => ({ name: 'ReactNavigation' })),
    httpClientIntegration: jest.fn(() => ({ name: 'HttpClient' })),
    mobileReplayIntegration: jest.fn((options: unknown) => ({ name: 'MobileReplay', options })),
  };
});

const mockPlatform = jest.requireMock('react-native').Platform as { OS: string };
const mockConstants = jest.requireMock('expo-constants').default as { expoConfig: { extra?: Record<string, unknown> } };
const mockSentry = jest.requireMock('@sentry/react-native') as Record<'init' | 'addBreadcrumb' | 'captureException' | 'captureMessage' | 'setUser' | 'getGlobalScope' | 'wrap' | 'mobileReplayIntegration', jest.Mock> & {
  logger: Record<'info' | 'warn' | 'error', jest.Mock>;
};

const setEnv = (env: Record<string, unknown>) => {
  mockConstants.expoConfig.extra = { env: { APP_ENV: 'production', ...env }, version: { version: '8.12', buildNumber: 10012 } };
  resetEnvForTests();
};

describe('Sentry init', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetSentryForTests();
    resetActiveVariantForTests();
    mockPlatform.OS = 'ios';
  });

  it('does nothing without a DSN (DSN guard)', () => {
    setEnv({ SENTRY_DSN: '' });
    expect(initSentry()).toBe(false);
    expect(mockSentry.init).not.toHaveBeenCalled();
    expect(isSentryInitialized()).toBe(false);
  });

  it('initialises once with the merged options', () => {
    setEnv({ SENTRY_DSN: 'https://key@sentry.resgrid.net/7', APP_ENV: 'staging' });
    expect(initSentry()).toBe(true);
    expect(initSentry()).toBe(true);
    expect(mockSentry.init).toHaveBeenCalledTimes(1);
    const options = mockSentry.init.mock.calls[0][0];
    expect(options).toEqual(
      expect.objectContaining({
        dsn: 'https://key@sentry.resgrid.net/7',
        environment: 'staging',
        sendDefaultPii: false,
        enableAutoSessionTracking: true,
        enableAppHangTracking: true,
        enableWatchdogTerminationTracking: true,
        enableNativeFramesTracking: true,
        enableMetricKit: true,
        enableUserInteractionTracing: true,
        attachScreenshot: true,
        screenshot: { maskAllText: true, maskAllImages: true },
        attachViewHierarchy: true,
        replaysOnErrorSampleRate: 1,
        replaysSessionSampleRate: 0,
        enableLogs: true,
        logsOrigin: 'js',
        enableAutoConsoleLogs: false,
        debug: false,
      })
    );
    // Native keeps the SDK's own release so the Xcode/Gradle source-map upload matches.
    expect(options.release).toBeUndefined();
    // Failed requests come from the JS integration only: the native iOS capture would skip beforeSend.
    expect(options.enableCaptureFailedRequests).toBeUndefined();
    expect(options.integrations).toEqual([{ name: 'ReactNavigation' }, { name: 'HttpClient' }, { name: 'MobileReplay', options: { maskAllText: true, maskAllImages: true, maskAllVectors: true } }]);
    // Tags go on the global scope (initialScope is deprecated).
    expect(options).not.toHaveProperty('initialScope');
    expect(mockSentry.getGlobalScope().setTags).toHaveBeenCalledWith({ platform: 'ios', runtime: 'native', app_env: 'staging' });
    expect(options.beforeBreadcrumb({ category: 'console', message: 'x' })).toBeNull();
    expect(options.beforeSendTransaction({ contexts: { trace: { op: 'navigation', data: {} } } })).toBeNull();
  });

  it('uses web-safe options and a release from extra.version on web', () => {
    mockPlatform.OS = 'web';
    setEnv({ SENTRY_DSN: 'https://key@sentry/1' });
    const options = createSentryOptions();
    expect(options).toEqual(
      expect.objectContaining({ enableAutoPerformanceTracing: false, enableAutoSessionTracking: true, enableNativeFramesTracking: false, enableAppHangTracking: false, attachScreenshot: false, enableLogs: true })
    );
    expect(options).not.toHaveProperty('replaysOnErrorSampleRate');
    expect(options.integrations).toEqual([{ name: 'ReactNavigation' }, { name: 'HttpClient' }]);
    expect(options.release).toBe('resgrid@8.12+10012');
    expect(getSentryRelease()).toBe('resgrid@8.12+10012');
    expect(options.dist).toBe('10012');
  });

  it('lets callers override options', () => {
    setEnv({ SENTRY_DSN: 'https://key@sentry/1' });
    expect(createSentryOptions({ tracesSampleRate: 1 }).tracesSampleRate).toBe(1);
  });

  it("keeps the SDK's default integrations, which tag events with the expo-updates id, channel and runtime version", () => {
    // An integrations ARRAY is added to the defaults; a function or `defaultIntegrations: false` would drop ExpoContext,
    // which sets the `expo.updates.*` tags and reports emergency launches (docs/subsystems/app-updates.md).
    setEnv({ SENTRY_DSN: 'https://key@sentry/1' });
    const options = createSentryOptions();
    expect(Array.isArray(options.integrations)).toBe(true);
    expect(options).not.toHaveProperty('defaultIntegrations');
  });
});

describe('logger → Sentry forwarding', () => {
  beforeAll(() => {
    setEnv({ SENTRY_DSN: 'https://key@sentry/1' });
    resetSentryForTests();
    initSentry();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    logger.setMinLevel('debug');
  });

  it('captures an error log as an exception with a stripped Error (IC)', () => {
    const axiosError = Object.assign(new Error('Request failed with status code 400'), {
      name: 'AxiosError',
      isAxiosError: true,
      config: { method: 'post', url: '/Connect/token', data: 'password=hunter2&grant_type=password' },
      response: { status: 400 },
    });
    logger.error({ message: 'Failed to send location to API', context: { error: axiosError, unitId: 'unit-123' } });

    expect(mockSentry.captureMessage).not.toHaveBeenCalled();
    expect(mockSentry.captureException).toHaveBeenCalledTimes(1);
    const [captured, hint] = mockSentry.captureException.mock.calls[0];
    expect(captured).toBeInstanceOf(Error);
    expect(captured).not.toBe(axiosError);
    expect(captured.name).toBe('AxiosError');
    expect(captured).not.toHaveProperty('config');
    expect(hint.extra).toEqual(expect.objectContaining({ message: 'Failed to send location to API', unitId: 'unit-123' }));
    expect(JSON.stringify(mockSentry.captureException.mock.calls)).not.toContain('hunter2');
    expect(mockSentry.addBreadcrumb).toHaveBeenCalledWith(expect.objectContaining({ category: 'log', level: 'error' }));
  });

  it('falls back to captureMessage when no Error is present', () => {
    logger.error({ message: 'Token refresh rejected', context: { error: 'invalid_grant' } });
    expect(mockSentry.captureException).not.toHaveBeenCalled();
    expect(mockSentry.captureMessage).toHaveBeenCalledWith('Token refresh rejected', { level: 'error', extra: { error: 'invalid_grant' } });
  });

  it('turns warn into a breadcrumb but no event; info and debug add no breadcrumb', () => {
    logger.warn({ message: 'Slow response', context: { password: 'x' } });
    logger.info({ message: 'info' });
    logger.debug({ message: 'debug' });
    expect(mockSentry.captureException).not.toHaveBeenCalled();
    expect(mockSentry.captureMessage).not.toHaveBeenCalled();
    expect(mockSentry.addBreadcrumb).toHaveBeenCalledTimes(1);
    expect(mockSentry.addBreadcrumb.mock.calls[0][0]).toEqual(expect.objectContaining({ level: 'warning', message: 'Slow response', data: { password: '[REDACTED]' } }));
  });

  it('sends info, warn and error (never debug) as sanitized Sentry logs', () => {
    logger.debug({ message: 'debug' });
    logger.info({ message: 'Analytics initialized', context: { attempt: 1 } });
    logger.warn({ message: 'Department config could not be loaded', context: { accessToken: 'secret' } });
    logger.error({ message: 'Token refresh rejected' });
    expect(mockSentry.logger.info).toHaveBeenCalledWith('Analytics initialized', { attempt: 1 });
    expect(mockSentry.logger.warn).toHaveBeenCalledWith('Department config could not be loaded', { accessToken: '[REDACTED]' });
    expect(mockSentry.logger.error).toHaveBeenCalledWith('Token refresh rejected', {});
    expect(JSON.stringify(mockSentry.logger.warn.mock.calls)).not.toContain('secret');
  });

  it('identifies users by id only', () => {
    setSentryUser('user-1');
    expect(mockSentry.setUser).toHaveBeenCalledWith({ id: 'user-1' });
    setSentryUser(null);
    expect(mockSentry.setUser).toHaveBeenLastCalledWith(null);
  });
});

describe('root wrapper and error boundaries', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetSentryForTests();
    setEnv({ SENTRY_DSN: 'https://key@sentry/1' });
  });

  it('wraps the root without copying touched text into breadcrumbs', () => {
    const Root = () => null;
    expect(wrapRootComponent(Root)).toBe(Root);
    expect(mockSentry.wrap).toHaveBeenCalledWith(Root, { touchEventBoundaryProps: { extractTextFromChildren: false } });
  });

  it('reports each caught render error once, as handled, and only once Sentry is up', () => {
    const error = new Error('Cannot read properties of undefined');
    captureBoundaryError(error);
    expect(mockSentry.captureException).not.toHaveBeenCalled();

    initSentry();
    captureBoundaryError(error);
    captureBoundaryError(error);
    expect(mockSentry.captureException).toHaveBeenCalledTimes(1);
    expect(mockSentry.captureException).toHaveBeenCalledWith(error, { mechanism: { type: 'auto.expo_router.error_boundary', handled: true } });

    captureBoundaryError(new Error('another'));
    expect(mockSentry.captureException).toHaveBeenCalledTimes(2);
  });
});
