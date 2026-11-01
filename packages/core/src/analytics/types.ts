export interface AnalyticsEventProperties {
  [key: string]: string | number | boolean;
}

/** The slice of Countly the analytics service uses; one implementation per platform. */
export interface CountlyClient {
  init: (appKey: string, serverUrl: string, options: { loggingEnabled: boolean }) => Promise<void>;
  recordEvent: (eventName: string, segmentation: Record<string, string>, count: number) => void;
  setUserData: (custom: Record<string, string>) => void;
  endSession: () => void;
}
