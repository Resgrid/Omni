import Countly from 'countly-sdk-react-native-bridge';
import CountlyConfig from 'countly-sdk-react-native-bridge/CountlyConfig';

import type { CountlyClient } from './types';

/** iOS/Android: the Countly native bridge. Web and Electron use countly-client.web.ts. */
export const countlyClient: CountlyClient = {
  async init(appKey, serverUrl, { loggingEnabled }) {
    const config = new CountlyConfig(serverUrl, appKey).setLoggingEnabled(loggingEnabled).enableCrashReporting().setRequiresConsent(false);
    await Countly.initWithConfig(config);
  },
  recordEvent(eventName, segmentation, count) {
    Countly.events.recordEvent(eventName, segmentation, count);
  },
  setUserData(custom) {
    void Countly.setUserData({ custom });
  },
  endSession() {
    Countly.endSession();
  },
};
