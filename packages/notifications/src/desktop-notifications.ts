/**
 * Desktop toasts for SignalR-driven notices (Dispatch `electron-notification.ts`, omni-plan §7.6). On Electron the app
 * learns about events over SignalR; this surfaces them as native OS notifications so people see them with the window
 * unfocused. Uses the preload bridge `window.electronNotifications` (`show`, `isSupported`, `onNotificationClicked`)
 * — or Unit's names for the same bridge on `window.electronAPI` — and falls back to the Web Notification API.
 * A click opens the notice like a tapped push (deep link, else the push modal).
 *
 * No native imports: safe on every platform (a no-op outside web/Electron).
 */
import { isElectron, isWeb, logger } from '@resgrid/core';

import { openNotification } from './deep-links';
import { usePushNotificationModalStore } from './push-modal-store';

export interface DesktopNotificationPayload {
  title: string;
  body: string;
  /** Push-style event code: makes the toast clickable to its target and drives the in-app alert. */
  eventCode?: string;
  data?: Record<string, unknown>;
  /** Also raise the in-app push modal when the payload has an event code (Dispatch behaviour). Default true. */
  showInApp?: boolean;
}

/** apps/desktop/src/preload.js `window.electronNotifications`. */
export interface ElectronNotificationsBridge {
  show: (payload: { title: string; body: string; data?: unknown }) => Promise<boolean>;
  isSupported: () => Promise<boolean>;
  onNotificationClicked: (callback: (data: unknown) => void) => () => void;
}

interface ElectronApiNotifications {
  showNotification?: (payload: { title: string; body: string; data?: unknown }) => Promise<boolean>;
  onNotificationClicked?: (callback: (data: unknown) => void) => () => void;
}

/** The notifications bridge in the Electron shell, or null elsewhere. */
export function getElectronNotificationsBridge(): ElectronNotificationsBridge | null {
  if (typeof window === 'undefined' || !isElectron()) {
    return null;
  }
  const w = window as unknown as { electronNotifications?: Partial<ElectronNotificationsBridge>; electronAPI?: ElectronApiNotifications };
  const bridge = w.electronNotifications;
  if (bridge && typeof bridge.show === 'function') {
    return {
      show: bridge.show,
      isSupported: typeof bridge.isSupported === 'function' ? bridge.isSupported : async () => true,
      onNotificationClicked: typeof bridge.onNotificationClicked === 'function' ? bridge.onNotificationClicked : () => () => undefined,
    };
  }
  const api = w.electronAPI;
  if (api && typeof api.showNotification === 'function') {
    const show = api.showNotification;
    return { show, isSupported: async () => true, onNotificationClicked: typeof api.onNotificationClicked === 'function' ? api.onNotificationClicked : () => () => undefined };
  }
  return null;
}

const hasWebNotifications = (): boolean => typeof window !== 'undefined' && 'Notification' in window;

const eventCodeOf = (data: unknown): string | null => {
  if (!data || typeof data !== 'object') return null;
  const eventCode = (data as Record<string, unknown>).eventCode;
  return typeof eventCode === 'string' && eventCode ? eventCode : null;
};

const openFromClick = (data: unknown): void => {
  const eventCode = eventCodeOf(data);
  if (!eventCode) return;
  const record = data as Record<string, unknown>;
  void openNotification({
    eventCode,
    data: record,
    ...(typeof record.title === 'string' ? { title: record.title } : {}),
    ...(typeof record.body === 'string' ? { body: record.body } : {}),
  });
};

let detachClicks: (() => void) | null = null;
let permissionGranted = false;

/** Asks for permission (Electron usually grants it) and wires toast clicks. Safe to call repeatedly; no-op off web. */
export async function initializeDesktopNotifications(): Promise<void> {
  if (!isWeb()) return;
  const bridge = getElectronNotificationsBridge();
  if (bridge && !detachClicks) {
    detachClicks = bridge.onNotificationClicked(openFromClick);
  }
  if (!bridge && hasWebNotifications()) {
    try {
      if (Notification.permission === 'granted') permissionGranted = true;
      else if (Notification.permission !== 'denied') permissionGranted = (await Notification.requestPermission()) === 'granted';
    } catch (error) {
      logger.warn({ message: 'Desktop notifications: permission request failed', context: { error } });
    }
  }
}

function showWebNotification(payload: DesktopNotificationPayload, data: Record<string, unknown>): boolean {
  if (!hasWebNotifications() || (Notification.permission !== 'granted' && !permissionGranted)) {
    return false;
  }
  try {
    const notification = new Notification(payload.title, { body: payload.body, silent: false, ...(payload.eventCode ? { tag: payload.eventCode } : {}) });
    notification.onclick = () => {
      try {
        window.focus();
      } catch {
        // Focus refused by the browser.
      }
      openFromClick(data);
    };
    return true;
  } catch (error) {
    logger.warn({ message: 'Desktop notifications: web notification failed', context: { error } });
    return false;
  }
}

/**
 * Shows a desktop toast for a notice (Electron native notification, else the Web Notification API) and, when it has
 * an event code, the in-app push modal with its sound. Resolves true when a toast was shown.
 */
export async function showDesktopNotification(payload: DesktopNotificationPayload): Promise<boolean> {
  if (!isWeb()) {
    return false;
  }
  const data: Record<string, unknown> = { ...(payload.data ?? {}), title: payload.title, body: payload.body, ...(payload.eventCode ? { eventCode: payload.eventCode } : {}) };

  if (payload.eventCode && payload.showInApp !== false) {
    void usePushNotificationModalStore
      .getState()
      .showNotificationModal({ eventCode: payload.eventCode, title: payload.title, body: payload.body, data }, { playSound: true })
      .catch(() => undefined);
  }

  const bridge = getElectronNotificationsBridge();
  if (bridge) {
    try {
      if (await bridge.show({ title: payload.title, body: payload.body, data })) {
        return true;
      }
    } catch (error) {
      logger.warn({ message: 'Electron notification failed, falling back to a web notification', context: { error } });
    }
  }
  return showWebNotification(payload, data);
}

/** Test hook. */
export function resetDesktopNotificationsForTests(): void {
  detachClicks?.();
  detachClicks = null;
  permissionGranted = false;
}
