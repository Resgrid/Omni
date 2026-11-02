import { getAppVersionInfo } from '../env/env';
import { isElectron } from '../platform/platform';
import type { CountlyClient } from './types';

/**
 * Web and Electron: a minimal direct-post sender to the Countly Write API `/i` (Dispatch/BigBoard). No SDK script
 * is injected from the analytics server. It reports what the native SDK reports on its own: a session (begun at
 * init, its duration every minute while the page is visible, ended when the page goes away) with device metrics,
 * views and their duration, launch time (APM), events and custom user data. Requests are fire-and-forget: nothing
 * is queued while offline. Analytics must never throw.
 */
const DEVICE_ID_KEY = 'countly_device_id';
const SDK_NAME = 'resgrid-omni-web';
const SDK_VERSION = '1.0.0';
const SESSION_UPDATE_MS = 60_000;
const VIEW_EVENT_KEY = '[CLY]_view';

interface CountlyEvent {
  key: string;
  count: number;
  segmentation: Record<string, string | number>;
  timestamp: number;
  hour: number;
  dow: number;
  dur?: number;
}

let config: { appKey: string; serverUrl: string } | null = null;
let sessionActive = false;
let sessionHasView = false;
// Start of the session time not yet reported; 0 while the page is hidden (hidden time is not session time).
let unreportedSince = 0;
let heartbeat: ReturnType<typeof setInterval> | null = null;
let currentView: { name: string; startedAt: number; segmentation: Record<string, string> } | null = null;
// The view open when the page was hidden into the back/forward cache, restarted when it comes back.
let pausedView: { name: string; segmentation: Record<string, string> } | null = null;
let appStartReported = false;
let detachListeners: (() => void) | null = null;

const getWebDeviceId = (): string => {
  try {
    const stored = window.localStorage.getItem(DEVICE_ID_KEY);
    if (stored) return stored;
    const id = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
    window.localStorage.setItem(DEVICE_ID_KEY, id);
    return id;
  } catch {
    return 'unknown';
  }
};

const timeOf = (now: number): { timestamp: number; hour: number; dow: number } => {
  const date = new Date(now);
  return { timestamp: now, hour: date.getHours(), dow: date.getDay() };
};

const post = (params: Record<string, string>): void => {
  try {
    if (!config || typeof fetch === 'undefined') return;
    const now = Date.now();
    const { timestamp, hour, dow } = timeOf(now);
    const body = new URLSearchParams({
      app_key: config.appKey,
      device_id: getWebDeviceId(),
      sdk_name: SDK_NAME,
      sdk_version: SDK_VERSION,
      timestamp: String(timestamp),
      hour: String(hour),
      dow: String(dow),
      tz: String(-new Date(now).getTimezoneOffset()),
      ...params,
    });
    fetch(`${config.serverUrl}/i`, { method: 'POST', body, keepalive: true }).catch(() => undefined);
  } catch {
    // Analytics must never throw.
  }
};

const postEvents = (events: CountlyEvent[]): void => {
  if (events.length) post({ events: JSON.stringify(events) });
};

/** The metrics the Countly web SDK sends with `begin_session`; the server derives OS, browser and device from `_ua`. */
const getMetrics = (): Record<string, string> => {
  const metrics: Record<string, string> = {};
  const version = getAppVersionInfo()?.version;
  if (version) metrics._app_version = version;
  try {
    if (typeof navigator !== 'undefined') {
      if (navigator.userAgent) metrics._ua = navigator.userAgent;
      if (navigator.language) metrics._locale = navigator.language;
    }
    if (typeof window !== 'undefined') {
      if (window.screen?.width) metrics._resolution = `${window.screen.width}x${window.screen.height}`;
      if (window.devicePixelRatio) metrics._density = String(window.devicePixelRatio);
    }
  } catch {
    // Metrics are best effort.
  }
  return metrics;
};

const isPageVisible = (): boolean => {
  try {
    return typeof document === 'undefined' || document.visibilityState !== 'hidden';
  } catch {
    return true;
  }
};

/** Whole seconds of visible session time since the last report; the remainder carries over to the next one. */
const takeSessionSeconds = (now = Date.now()): number => {
  if (!unreportedSince) return 0;
  const seconds = Math.max(0, Math.floor((now - unreportedSince) / 1000));
  unreportedSince += seconds * 1000;
  return seconds;
};

const reportSessionDuration = (): void => {
  if (!sessionActive) return;
  const seconds = takeSessionSeconds();
  if (seconds > 0) post({ session_duration: String(seconds) });
};

const platformSegment = (): string => (isElectron() ? 'Electron' : 'Web');

/** The closing `[CLY]_view` event that carries the current view's duration. */
const stopCurrentView = (now: number): CountlyEvent[] => {
  if (!currentView) return [];
  const dur = Math.max(0, Math.round((now - currentView.startedAt) / 1000));
  const event: CountlyEvent = { key: VIEW_EVENT_KEY, count: 1, dur, segmentation: { name: currentView.name, segment: platformSegment() }, ...timeOf(now) };
  return [event];
};

const startView = (name: string, segmentation: Record<string, string>, now: number): CountlyEvent => {
  const event: CountlyEvent = { key: VIEW_EVENT_KEY, count: 1, segmentation: { ...segmentation, name, segment: platformSegment(), visit: 1, ...(sessionHasView ? {} : { start: 1 }) }, ...timeOf(now) };
  sessionHasView = true;
  currentView = { name, startedAt: now, segmentation };
  return event;
};

const beginSession = (): void => {
  if (sessionActive) return;
  sessionActive = true;
  sessionHasView = false;
  unreportedSince = isPageVisible() ? Date.now() : 0;
  post({ begin_session: '1', metrics: JSON.stringify(getMetrics()) });
  if (!heartbeat && typeof setInterval !== 'undefined') heartbeat = setInterval(reportSessionDuration, SESSION_UPDATE_MS);
};

/** Ends the session; the current view is closed with its duration and remembered so a resumed page restarts it. */
const endCurrentSession = (): { name: string; segmentation: Record<string, string> } | null => {
  if (!sessionActive) return null;
  const now = Date.now();
  const view = currentView ? { name: currentView.name, segmentation: currentView.segmentation } : null;
  postEvents(stopCurrentView(now));
  currentView = null;
  post({ end_session: '1', session_duration: String(takeSessionSeconds(now)) });
  sessionActive = false;
  unreportedSince = 0;
  if (heartbeat) clearInterval(heartbeat);
  heartbeat = null;
  return view;
};

const attachPageListeners = (): void => {
  if (detachListeners || typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
  const onVisibilityChange = (): void => {
    if (!sessionActive) return;
    if (isPageVisible()) {
      if (!unreportedSince) unreportedSince = Date.now();
    } else {
      reportSessionDuration();
      unreportedSince = 0;
    }
  };
  // `pagehide` (not `beforeunload`) also fires on mobile browsers and when the page enters the back/forward cache.
  const onPageHide = (): void => {
    pausedView = endCurrentSession();
  };
  const onPageShow = (event: PageTransitionEvent): void => {
    if (!event.persisted || !config) return;
    beginSession();
    if (pausedView) postEvents([startView(pausedView.name, pausedView.segmentation, Date.now())]);
    pausedView = null;
  };
  const target = window;
  const doc = typeof document === 'undefined' ? null : document;
  target.addEventListener('pagehide', onPageHide);
  target.addEventListener('pageshow', onPageShow);
  doc?.addEventListener('visibilitychange', onVisibilityChange);
  detachListeners = () => {
    target.removeEventListener('pagehide', onPageHide);
    target.removeEventListener('pageshow', onPageShow);
    doc?.removeEventListener('visibilitychange', onVisibilityChange);
  };
};

export const countlyClient: CountlyClient = {
  async init(appKey, serverUrl) {
    if (config) return;
    config = { appKey, serverUrl: serverUrl.replace(/\/+$/, '') };
    try {
      attachPageListeners();
    } catch {
      // Without page events the session still begins; it just is not ended on unload.
    }
    beginSession();
  },
  recordEvent(eventName, segmentation, count) {
    postEvents([{ key: eventName, count, segmentation, ...timeOf(Date.now()) }]);
  },
  recordView(viewName, segmentation) {
    if (!config) return;
    if (!sessionActive) beginSession();
    const now = Date.now();
    postEvents([...stopCurrentView(now), startView(viewName, segmentation, now)]);
  },
  appLoaded() {
    if (!config || appStartReported) return;
    try {
      if (typeof performance === 'undefined' || typeof performance.now !== 'function') return;
      // Launch time on web: from navigation start (the performance time origin) until the app is usable.
      const duration = Math.round(performance.now());
      const end = Date.now();
      appStartReported = true;
      post({ apm: JSON.stringify({ type: 'device', name: 'app_start', apm_metrics: { duration }, stz: end - duration, etz: end }) });
    } catch {
      // Analytics must never throw.
    }
  },
  setUserData(custom) {
    post({ user_details: JSON.stringify({ custom }) });
  },
  endSession() {
    // Sign-out: the signed-in session ends and the sign-in screen starts a new one.
    endCurrentSession();
    if (config) beginSession();
  },
};

/** Test helper. Not for app code. */
export function resetWebCountlyForTests(): void {
  detachListeners?.();
  detachListeners = null;
  if (heartbeat) clearInterval(heartbeat);
  heartbeat = null;
  config = null;
  sessionActive = false;
  sessionHasView = false;
  unreportedSince = 0;
  currentView = null;
  pausedView = null;
  appStartReported = false;
}
