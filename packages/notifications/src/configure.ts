/**
 * Injection points for @resgrid/notifications (layer L3). The package never imports auth, stores, routes or app code:
 * the app shell configures it once at startup with getters for the session and the services it needs.
 */
import type { ApiContext } from '@resgrid/api';
import { getCapability } from '@resgrid/config';
import type { Href } from 'expo-router';

import type { NotificationTarget } from './event-codes';
import type { NotificationsKv } from './registration-storage';

/** The signed-in session as the auth package exposes it. */
export interface NotificationsSession {
  userId: string;
  departmentId?: string | null;
  departmentCode: string;
  rights?: {
    /** Novu subscriberHash for `{code}_User_{userId}` (Security/GetCurrentUsersRights). */
    NovuSubscriberHash?: string | null;
    /** Novu subscriberHash for `{code}_IC_User_{userId}`. */
    NovuICSubscriberHash?: string | null;
  } | null;
}

/** The Firebase web app Core hands out (`Config/GetConfig` WebPush* fields) for browser and desktop push. */
export interface WebPushFirebaseConfig {
  apiKey: string;
  authDomain?: string;
  projectId: string;
  messagingSenderId: string;
  appId: string;
  vapidKey: string;
}

export interface NotificationsDependencies {
  /** Current session, read at call time (never cached). Null when signed out. */
  getSession: () => NotificationsSession | null;
  /** True once the session has hydrated and is signed in; deep links wait on it. */
  isSignedIn: () => boolean;
  /** Active unit (Unit app subject); null when none. */
  getActiveUnitId: () => string | null;
  /** API context for `@resgrid/api` endpoint functions. */
  getApiContext: () => ApiContext;
  /** v4 base of the server the session belongs to, e.g. `https://api.resgrid.com/api/v4` (sign-out calls go straight to it). */
  getBaseApiUrl: () => string;
  /** Stable per-install device id (`unitDeviceUuid`). */
  getDeviceUuid: () => string;
  /** Extra headers for the direct sign-out calls (`X-Resgrid-Client`, …). */
  getRequestHeaders?: () => Record<string, string>;
  /**
   * The session's current access token. Web only, optional: lets a browser registration that Core accepted after its
   * session ended be taken off at once with that session's token (otherwise the next sync or sign-out cleanup does it).
   */
  getAccessToken?: () => string | null;
  /** Durable storage for the native registration (IC's `nativePushRegistration` key); in memory when omitted. */
  storage?: NotificationsKv;
  /** Maps a target to the variant's route, or null when the variant has no screen for it (route contract, later phase). */
  resolveRoute?: (target: NotificationTarget) => Href | null;
  /** Chat channels that are the assistant open `chatbot` targets. */
  isChatbotChannel?: (channelId: string) => boolean;
  /** The check-in action on a call notification (check-in timers live in a higher layer). */
  onCheckInAction?: () => void | Promise<void>;
  /** Firebase web app for browser/desktop push; null while Core has web push off. */
  getWebPushConfig?: () => WebPushFirebaseConfig | null;
}

let dependencies: NotificationsDependencies | null = null;

export function configureNotifications(next: NotificationsDependencies): void {
  dependencies = next;
}

/** Throws when the app shell has not configured the package yet. */
export function getNotificationsDependencies(): NotificationsDependencies {
  if (!dependencies) {
    throw new Error('@resgrid/notifications is not configured. Call configureNotifications() at startup, before push or deep links are used.');
  }
  return dependencies;
}

export function getOptionalNotificationsDependencies(): NotificationsDependencies | null {
  return dependencies;
}

/** Test helper. Not for app code. */
export function resetNotificationsConfigurationForTests(): void {
  dependencies = null;
}

export type PushSubjectKind = 'user' | 'unit' | 'icUser' | 'none';

/** Whose Novu subscriber this variant registers on (variant manifest `capabilities.push.subject`). */
export function getPushSubjectKind(): PushSubjectKind {
  try {
    return getCapability('push').subject;
  } catch {
    return 'none';
  }
}

/** Variant manifest `capabilities.push.desktopPush`. */
export function isDesktopPushEnabled(): boolean {
  try {
    return getCapability('push').desktopPush;
  } catch {
    return false;
  }
}

/** Variant manifest `capabilities.checkIn.actions`. */
export function hasCheckInActions(): boolean {
  try {
    return getCapability('checkIn').actions;
  } catch {
    return false;
  }
}

/** Safe wrapper around the session getter: a throwing getter reads as signed out. */
export function readSession(deps: NotificationsDependencies): NotificationsSession | null {
  try {
    const session = deps.getSession();
    return session && session.userId && session.departmentCode ? session : null;
  } catch {
    return null;
  }
}

export function readSignedIn(deps: NotificationsDependencies | null): boolean {
  try {
    return deps?.isSignedIn() === true;
  } catch {
    return false;
  }
}

export function readActiveUnitId(deps: NotificationsDependencies): string | null {
  try {
    const unitId = deps.getActiveUnitId();
    return unitId && unitId.trim() !== '' ? unitId : null;
  } catch {
    return null;
  }
}
