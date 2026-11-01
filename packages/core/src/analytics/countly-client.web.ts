import type { CountlyClient } from './types';

/**
 * Web and Electron: a minimal direct-post sender to the Countly `/i` endpoint (Dispatch/BigBoard). No SDK script
 * is injected from the analytics server. Analytics must never throw.
 */
const DEVICE_ID_KEY = 'countly_device_id';

let config: { appKey: string; serverUrl: string } | null = null;

const getWebDeviceId = (): string => {
  try {
    const stored = window.localStorage.getItem(DEVICE_ID_KEY);
    if (stored) return stored;
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
    window.localStorage.setItem(DEVICE_ID_KEY, id);
    return id;
  } catch {
    return 'unknown';
  }
};

const post = (params: Record<string, string>): void => {
  try {
    if (!config || typeof fetch === 'undefined') return;
    const body = new URLSearchParams({ app_key: config.appKey, device_id: getWebDeviceId(), ...params });
    fetch(`${config.serverUrl.replace(/\/+$/, '')}/i`, { method: 'POST', body, keepalive: true }).catch(() => undefined);
  } catch {
    // Analytics must never throw.
  }
};

export const countlyClient: CountlyClient = {
  async init(appKey, serverUrl) {
    config = { appKey, serverUrl };
  },
  recordEvent(eventName, segmentation, count) {
    post({ events: JSON.stringify([{ key: eventName, count, segmentation }]) });
  },
  setUserData(custom) {
    post({ user_details: JSON.stringify({ custom }) });
  },
  endSession() {
    post({ end_session: '1' });
  },
};

/** Test helper. Not for app code. */
export function resetWebCountlyForTests(): void {
  config = null;
}
