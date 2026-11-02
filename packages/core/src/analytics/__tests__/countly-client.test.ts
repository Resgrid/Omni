import Countly from 'countly-sdk-react-native-bridge';
import CountlyConfig from 'countly-sdk-react-native-bridge/CountlyConfig';

import { countlyClient } from '../countly-client';

jest.mock('countly-sdk-react-native-bridge', () => ({
  __esModule: true,
  default: {
    initWithConfig: jest.fn(() => Promise.resolve()),
    events: { recordEvent: jest.fn() },
    views: { startAutoStoppedView: jest.fn(() => Promise.resolve('view-id')) },
    appLoadingFinished: jest.fn(() => Promise.resolve()),
    setUserData: jest.fn(() => Promise.resolve()),
    endSession: jest.fn(),
  },
}));

jest.mock('countly-sdk-react-native-bridge/CountlyConfig', () => {
  const mockApm: Record<'enableAppStartTimeTracking' | 'enableForegroundBackgroundTracking' | 'enableManualAppLoadedTrigger', jest.Mock> = {
    enableAppStartTimeTracking: jest.fn(() => mockApm),
    enableForegroundBackgroundTracking: jest.fn(() => mockApm),
    enableManualAppLoadedTrigger: jest.fn(() => mockApm),
  };
  return {
    __esModule: true,
    default: jest.fn(function mockCountlyConfig(this: Record<string, unknown>, serverUrl: string, appKey: string) {
      Object.assign(this, { serverUrl, appKey, apm: mockApm });
      this.setLoggingEnabled = jest.fn(() => this);
      this.enableCrashReporting = jest.fn(() => this);
      this.setRequiresConsent = jest.fn(() => this);
    }),
  };
});

type Handler = (error: unknown, isFatal?: boolean) => void;

const mockCountly = Countly as unknown as {
  initWithConfig: jest.Mock;
  views: { startAutoStoppedView: jest.Mock };
  appLoadingFinished: jest.Mock;
  setUserData: jest.Mock;
};
const mockConfig = CountlyConfig as unknown as jest.Mock;

const installErrorUtils = (initial: Handler) => {
  let current = initial;
  const errorUtils = { getGlobalHandler: () => current, setGlobalHandler: (next: Handler) => (current = next) };
  Object.defineProperty(globalThis, 'ErrorUtils', { value: errorUtils, configurable: true, writable: true });
  return errorUtils;
};

// What Countly's initWithConfig does with crash reporting on: wrap the previous handler, reading error.message first.
const countlyInstallsItsHandler = (errorUtils: ReturnType<typeof installErrorUtils>, logged: jest.Mock) => () => {
  const previous = errorUtils.getGlobalHandler();
  errorUtils.setGlobalHandler((error, isFatal) => {
    logged((error as Error).message.trim());
    previous(error, isFatal);
  });
  return Promise.resolve();
};

describe('native Countly client', () => {
  afterEach(() => {
    Object.defineProperty(globalThis, 'ErrorUtils', { value: undefined, configurable: true, writable: true });
  });

  it('turns on crash reporting and APM launch / foreground time with a manual app-loaded trigger, without consent', async () => {
    await countlyClient.init('app-key', 'https://countly.example.com', { loggingEnabled: false });

    expect(mockConfig).toHaveBeenCalledWith('https://countly.example.com', 'app-key');
    const config = mockConfig.mock.instances[0] as Record<string, jest.Mock> & { apm: Record<string, jest.Mock> };
    expect(config.setLoggingEnabled).toHaveBeenCalledWith(false);
    expect(config.enableCrashReporting).toHaveBeenCalled();
    expect(config.setRequiresConsent).toHaveBeenCalledWith(false);
    expect(config.apm.enableAppStartTimeTracking).toHaveBeenCalled();
    expect(config.apm.enableForegroundBackgroundTracking).toHaveBeenCalled();
    expect(config.apm.enableManualAppLoadedTrigger).toHaveBeenCalled();
    expect(mockCountly.initWithConfig).toHaveBeenCalledWith(config);
  });

  it('records auto-stopped views and the app-loaded mark without leaking rejections', async () => {
    mockCountly.views.startAutoStoppedView.mockReturnValueOnce(Promise.reject(new Error('bridge')));
    countlyClient.recordView('/calls/[id]', {});
    countlyClient.recordView('/settings', { tab: 'about' });
    countlyClient.appLoaded();
    await Promise.resolve();

    expect(mockCountly.views.startAutoStoppedView).toHaveBeenNthCalledWith(1, '/calls/[id]', undefined);
    expect(mockCountly.views.startAutoStoppedView).toHaveBeenNthCalledWith(2, '/settings', { tab: 'about' });
    expect(mockCountly.appLoadingFinished).toHaveBeenCalledTimes(1);
  });

  describe('crash handler guard', () => {
    it('hands errors Countly cannot read on to the handler it wrapped (Sentry), exactly once', async () => {
      const sentryHandler = jest.fn();
      const logged = jest.fn();
      const errorUtils = installErrorUtils(sentryHandler);
      mockCountly.initWithConfig.mockImplementationOnce(countlyInstallsItsHandler(errorUtils, logged));

      await countlyClient.init('k', 'https://c', { loggingEnabled: false });

      errorUtils.getGlobalHandler()('a thrown string', true);
      expect(sentryHandler).toHaveBeenCalledTimes(1);
      expect(sentryHandler).toHaveBeenCalledWith('a thrown string', true);

      const error = new Error(' boom ');
      errorUtils.getGlobalHandler()(error, false);
      expect(logged).toHaveBeenCalledWith('boom');
      expect(sentryHandler).toHaveBeenCalledTimes(2);
      expect(sentryHandler).toHaveBeenLastCalledWith(error, false);
    });

    it('puts the previous handler back when init fails', async () => {
      const sentryHandler = jest.fn();
      const errorUtils = installErrorUtils(sentryHandler);
      mockCountly.initWithConfig.mockImplementationOnce(() => Promise.reject(new Error('native module missing')));

      await expect(countlyClient.init('k', 'https://c', { loggingEnabled: false })).rejects.toThrow('native module missing');
      expect(errorUtils.getGlobalHandler()).toBe(sentryHandler);
    });
  });
});
