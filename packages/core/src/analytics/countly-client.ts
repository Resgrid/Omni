import Countly from 'countly-sdk-react-native-bridge';
import CountlyConfig from 'countly-sdk-react-native-bridge/CountlyConfig';

import type { CountlyClient } from './types';

type GlobalErrorHandler = (error: unknown, isFatal?: boolean) => void;

interface ErrorUtilsLike {
  getGlobalHandler: () => GlobalErrorHandler;
  setGlobalHandler: (handler: GlobalErrorHandler) => void;
}

const getErrorUtils = (): ErrorUtilsLike | null => (globalThis as unknown as { ErrorUtils?: ErrorUtilsLike }).ErrorUtils ?? null;

// Analytics calls must never surface as unhandled rejections (Sentry would report them as app errors).
const settle = (result: unknown): void => {
  if (result instanceof Promise) result.catch(() => undefined);
};

/**
 * Runs Countly's init, which installs its JS crash handler around the global handler set before it (Sentry's). That
 * handler throws on anything that is not an Error (`throw 'text'`, a null rejection) before handing the error on, so
 * Sentry never saw those. The handler Countly wraps is marked, and when Countly fails before reaching it, the error
 * is handed on here.
 */
async function initWithGuardedCrashHandler(init: () => Promise<void>): Promise<void> {
  const errorUtils = getErrorUtils();
  const previous = errorUtils?.getGlobalHandler();
  if (!errorUtils || !previous) {
    await init();
    return;
  }
  let handedOn = false;
  errorUtils.setGlobalHandler((error, isFatal) => {
    handedOn = true;
    previous(error, isFatal);
  });
  try {
    await init();
  } catch (error) {
    errorUtils.setGlobalHandler(previous);
    throw error;
  }
  const countlyHandler = errorUtils.getGlobalHandler();
  errorUtils.setGlobalHandler((error, isFatal) => {
    handedOn = false;
    try {
      countlyHandler(error, isFatal);
    } catch {
      if (!handedOn) previous(error, isFatal);
    }
  });
}

/**
 * iOS/Android: the Countly native bridge. Web and Electron use countly-client.web.ts. Automatic sessions, native and
 * JS crash reports, and APM: launch time (ended by `appLoaded`) and foreground/background time.
 */
export const countlyClient: CountlyClient = {
  async init(appKey, serverUrl, { loggingEnabled }) {
    const config = new CountlyConfig(serverUrl, appKey).setLoggingEnabled(loggingEnabled).enableCrashReporting().setRequiresConsent(false);
    config.apm.enableAppStartTimeTracking().enableForegroundBackgroundTracking().enableManualAppLoadedTrigger();
    await initWithGuardedCrashHandler(() => Countly.initWithConfig(config));
  },
  recordEvent(eventName, segmentation, count) {
    Countly.events.recordEvent(eventName, segmentation, count);
  },
  recordView(viewName, segmentation) {
    settle(Countly.views.startAutoStoppedView(viewName, Object.keys(segmentation).length ? segmentation : undefined));
  },
  appLoaded() {
    settle(Countly.appLoadingFinished());
  },
  setUserData(custom) {
    settle(Countly.setUserData({ custom }));
  },
  endSession() {
    Countly.endSession();
  },
};
