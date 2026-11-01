/**
 * The push service API both platform implementations export (`push-notification.ts` native, `push-notification.web.ts`
 * browser + Electron). Metro picks the file per platform; TypeScript checks against the native one, so both must
 * keep this exact surface.
 */
import type { PushNotificationData } from './push-modal-store';

export interface RegisterOptions {
  /** Prompt for notification permission when it has not been granted. Defaults to true. */
  requestPermission?: boolean;
}

export interface PushNotificationService {
  /** Wires listeners (first), replays the launch tap, then creates channels/categories. Safe to call repeatedly. */
  initialize(): Promise<void>;
  /** Registers this device on the variant's push subject. Calls run one at a time; resolves the token or null. */
  registerForPushNotifications(options?: RegisterOptions): Promise<string | null>;
  /**
   * Takes this device's token off the server as the session that is signing out. Call it from the sign-out hook
   * BEFORE the access token is cleared and before any server switch: the server URL is read synchronously here.
   */
  unregisterAtSignOut(accessToken: string | null): Promise<void>;
  /** Local teardown after sign-out: token, badge, delivered notifications, dedupe state. */
  clearLocalState(): Promise<void>;
  /** Forgets what was registered so the next call registers again (department/store reset). */
  resetRegistration(): void;
  getPushToken(): string | null;
  /** Clears the app badge (on open / foreground). */
  clearBadge(): Promise<void>;
  /** Opens a notification as a tap would (deep link, else modal). */
  openNotification(notification: PushNotificationData): Promise<boolean>;
  /** Removes listeners. */
  cleanup(): void;
}

/**
 * What the registration hook watches. The app shell passes the reactive session values from its stores; the service
 * re-reads the injected getters when it runs, so these only decide WHEN to (re-)register.
 */
export interface PushRegistrationTrigger {
  signedIn: boolean;
  userId?: string | null;
  departmentCode?: string | null;
  unitId?: string | null;
  serverUrl?: string | null;
  /** Web/Electron: Core's Firebase web app has arrived (`Config/GetConfig` WebPush* fields). */
  webPushConfigured?: boolean;
}

export interface UsePushNotificationsResult {
  pushToken: string | null;
}
