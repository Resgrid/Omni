/**
 * Push on the web and desktop (Electron) editions (omni-plan §7.6, Unit baseline).
 *
 * Both end with an FCM token registered on the variant's push subject as Platform 3 (Core keeps those on a web
 * channel beside the subscriber's phones). They differ in where the token comes from:
 *  - a browser mints it with the Firebase JS SDK against /service-worker.js, which shows each push and hands clicks
 *    back here;
 *  - Electron has no browser push service, so its main process holds an FCM connection of its own
 *    (apps/desktop/src/main/push-receiver.js) and shows notifications natively; the preload bridge
 *    (`window.electronAPI.pushStart/pushStop/pushTakePendingClick/onPushReceived/onPushNotificationClick`) hands the
 *    token and clicks to this page.
 * The Firebase web app comes from Core's config (WebPush* fields, injected as `getWebPushConfig`); without it there is
 * no push here.
 *
 * Every SDK and IPC step has its own timeout, so a stalled one releases the queue and sign-out can still remove the
 * previous token. Nothing registered outlives its session: sign-out takes the token off the server and kills it on
 * this device (queued behind any sync in flight), and a different subject/department rotates the token first.
 */
import { IC_PUSH_SOURCE, type PushSubject, registerPushDevice, unregisterPushToken } from '@resgrid/api';
import { isElectron, logger } from '@resgrid/core';
import { getApps, initializeApp } from 'firebase/app';
import { deleteToken, getMessaging, getToken, isSupported, type Messaging } from 'firebase/messaging';
import { useEffect, useState } from 'react';

import {
  getOptionalNotificationsDependencies,
  getPushSubjectKind,
  isDesktopPushEnabled,
  type NotificationsDependencies,
  type PushSubjectKind,
  readActiveUnitId,
  readSession,
  readSignedIn,
  type WebPushFirebaseConfig,
} from './configure';
import { openNotification } from './deep-links';
import { type PushNotificationData, usePushNotificationModalStore } from './push-modal-store';
import type { PushNotificationService, PushRegistrationTrigger, RegisterOptions, UsePushNotificationsResult } from './push-types';

/** One push as the service worker or the Electron main process hands it over (Core's webPush data block). */
export interface WebPushPayload {
  title: string;
  body: string;
  eventCode: string;
  type?: string;
  category?: string;
}

/** What apps/desktop/src/preload.js exposes for push on `window.electronAPI`. */
export interface DesktopPushBridge {
  pushStart: (config: WebPushFirebaseConfig) => Promise<{ token?: string; error?: string } | null>;
  pushStop: (forget: boolean) => Promise<void>;
  pushTakePendingClick: () => Promise<WebPushPayload | null>;
  onPushReceived: (callback: (payload: WebPushPayload) => void) => () => void;
  onPushNotificationClick: (callback: (payload: WebPushPayload) => void) => () => void;
}

interface WebIdentity {
  kind: Exclude<PushSubjectKind, 'none'>;
  subject: PushSubject;
  userId: string;
  prefix: string;
  unitId?: string;
}

interface StoredRegistration {
  key: string;
  token: string;
  prefix: string;
  registeredAt: number;
  /** Absent on Unit's legacy records (always a unit). */
  kind?: Exclude<PushSubjectKind, 'none'>;
  unitId?: string;
  userId?: string;
}

/** Platforms.Web on the server. */
export const WEB_PUSH_PLATFORM = 3;
export const SERVICE_WORKER_URL = '/service-worker.js';
/** Unit's keys (kept, so an upgraded browser's registration is still found and taken off at sign-out). */
export const WEB_PUSH_REGISTRATION_KEY = 'rg.webPush.registration';
/** When the permission prompt was last dismissed without an answer. */
export const WEB_PUSH_ASKED_KEY = 'rg.webPush.asked';
/** A dismissed prompt waits a week: browsers stop a site's prompts for a while after a few dismissals. */
export const ASK_AGAIN_AFTER_MS = 7 * 24 * 60 * 60 * 1000;
/** FCM rotates web tokens; re-registering daily keeps the server's copy current. */
export const REREGISTER_AFTER_MS = 24 * 60 * 60 * 1000;
/** A stalled SDK or IPC operation must release the queue so sign-out can remove the previous token. */
export const PUSH_OPERATION_TIMEOUT_MS = 10_000;

const FIREBASE_APP_NAME = 'rg-web-push';

async function withPushTimeout<T>(operation: string, work: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`Web push: ${operation} timed out`));
      controller.abort();
    }, PUSH_OPERATION_TIMEOUT_MS);
  });
  try {
    return await Promise.race([work(controller.signal), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

const statusListeners = new Set<() => void>();

function notifyStatus(): void {
  statusListeners.forEach((listener) => listener());
}

/** Calls back whenever this device's push status may have changed. Returns the unsubscribe. */
export function subscribeWebPush(listener: () => void): () => void {
  statusListeners.add(listener);
  return () => {
    statusListeners.delete(listener);
  };
}

function readJson<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage unavailable: the registration just isn't remembered across reloads.
  }
}

const readRegistration = (): StoredRegistration | null => {
  const stored = readJson<StoredRegistration>(WEB_PUSH_REGISTRATION_KEY);
  return stored && typeof stored.token === 'string' && typeof stored.prefix === 'string' ? stored : null;
};
const writeRegistration = (registration: StoredRegistration | null): void => writeJson(WEB_PUSH_REGISTRATION_KEY, registration);

/** The Electron push bridge, when this page runs in the desktop shell and the variant has desktop push. */
export function getDesktopPushBridge(): DesktopPushBridge | null {
  if (typeof window === 'undefined' || !isElectron() || !isDesktopPushEnabled()) {
    return null;
  }
  const api = (window as unknown as { electronAPI?: Partial<DesktopPushBridge> }).electronAPI;
  return api && typeof api.pushStart === 'function' && typeof api.pushStop === 'function' ? (api as DesktopPushBridge) : null;
}

function isWebPushConfig(value: unknown): value is WebPushFirebaseConfig {
  if (!value || typeof value !== 'object') return false;
  const config = value as Record<string, unknown>;
  return ['apiKey', 'projectId', 'messagingSenderId', 'appId', 'vapidKey'].every((field) => typeof config[field] === 'string' && (config[field] as string).length > 0);
}

export function getWebPushConfig(deps: NotificationsDependencies | null = getOptionalNotificationsDependencies()): WebPushFirebaseConfig | null {
  try {
    const config = deps?.getWebPushConfig?.() ?? null;
    return isWebPushConfig(config) ? config : null;
  } catch {
    return null;
  }
}

function browserCanPush(): boolean {
  return typeof window !== 'undefined' && window.isSecureContext === true && typeof navigator !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

function currentIdentity(deps: NotificationsDependencies | null): WebIdentity | null {
  if (!deps || !readSignedIn(deps)) return null;
  const kind = getPushSubjectKind();
  if (kind === 'none') return null;
  const session = readSession(deps);
  if (!session) return null;
  if (kind === 'unit') {
    const unitId = readActiveUnitId(deps);
    return unitId ? { kind, subject: { kind: 'unit', unitId }, userId: session.userId, prefix: session.departmentCode, unitId } : null;
  }
  return { kind, subject: kind === 'icUser' ? { kind: 'icUser' } : { kind: 'user' }, userId: session.userId, prefix: session.departmentCode };
}

/** Unit keeps its legacy `unit:{unitId}:{prefix}` key; person subjects key on the user. */
const keyOf = (identity: WebIdentity): string => (identity.kind === 'unit' ? `unit:${identity.unitId}:${identity.prefix}` : `${identity.kind}:${identity.userId}:${identity.prefix}`);

const subjectOfStored = (stored: StoredRegistration): PushSubject => {
  const kind = stored.kind ?? (stored.unitId ? 'unit' : 'user');
  if (kind === 'unit' && stored.unitId) return { kind: 'unit', unitId: stored.unitId };
  if (kind === 'icUser') return { kind: 'icUser' };
  return { kind: 'user' };
};

// --- Browser (Firebase JS SDK) ---

async function loadMessaging(config: WebPushFirebaseConfig): Promise<Messaging | null> {
  if (!(await withPushTimeout('messaging support', () => isSupported()))) {
    return null;
  }
  const app =
    getApps().find((candidate) => candidate.name === FIREBASE_APP_NAME) ??
    initializeApp({ apiKey: config.apiKey, authDomain: config.authDomain, projectId: config.projectId, messagingSenderId: config.messagingSenderId, appId: config.appId }, FIREBASE_APP_NAME);
  return getMessaging(app);
}

async function findServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  const registrations = await withPushTimeout('find service worker', () => navigator.serviceWorker.getRegistrations());
  return (
    registrations.find((registration) => {
      const worker = registration.active ?? registration.waiting ?? registration.installing;
      return !!worker && new URL(worker.scriptURL).pathname === SERVICE_WORKER_URL;
    }) ?? null
  );
}

async function mintBrowserToken(config: WebPushFirebaseConfig): Promise<string | null> {
  const messaging = await loadMessaging(config);
  if (!messaging) {
    return null;
  }
  const serviceWorkerRegistration = await withPushTimeout('register service worker', () => navigator.serviceWorker.register(SERVICE_WORKER_URL, { scope: '/' }));
  if (!serviceWorkerRegistration.active) {
    await withPushTimeout('service worker readiness', () => navigator.serviceWorker.ready);
  }
  // Each wait is bounded on its own: a late worker must not start getToken after this operation timed out.
  return (await withPushTimeout('mint browser token', () => getToken(messaging, { vapidKey: config.vapidKey, serviceWorkerRegistration }))) || null;
}

/** Kills the browser's token at FCM, so every channel still holding it stops delivering here. */
async function deleteBrowserToken(config: WebPushFirebaseConfig | null): Promise<void> {
  const registration = await findServiceWorker().catch(() => null);
  if (!registration) {
    return;
  }
  try {
    const messaging = config ? await loadMessaging(config) : null;
    if (messaging && config && Notification.permission === 'granted') {
      // deleteToken acts on the worker getToken last named; with a token stored this getToken is a local read.
      await withPushTimeout('read browser token', () => getToken(messaging, { vapidKey: config.vapidKey, serviceWorkerRegistration: registration }));
      await withPushTimeout('delete browser token', () => deleteToken(messaging));
      return;
    }
  } catch (error) {
    logger.warn({ message: 'Web push: the FCM token could not be deleted', context: { error } });
  }
  // Without Firebase, dropping the push subscription still leaves FCM nowhere to deliver.
  try {
    const subscription = await registration.pushManager.getSubscription();
    await subscription?.unsubscribe();
  } catch {
    // Nothing more can be done from here.
  }
}

// --- Desktop (Electron main process) ---

async function startDesktop(bridge: DesktopPushBridge, config: WebPushFirebaseConfig): Promise<string | null> {
  const result = await withPushTimeout('start desktop receiver', () => bridge.pushStart(config));
  if (!result?.token) {
    logger.warn({ message: 'Desktop push could not start', context: { error: result?.error } });
    return null;
  }
  return result.token;
}

async function deleteLocalToken(config: WebPushFirebaseConfig | null): Promise<void> {
  const desktop = getDesktopPushBridge();
  if (desktop) {
    // Forgetting the credentials leaves nothing on this device able to receive with the old token.
    await withPushTimeout('stop desktop receiver', () => desktop.pushStop(true)).catch(() => undefined);
    return;
  }
  if (browserCanPush()) {
    await deleteBrowserToken(config);
  }
}

// --- Registration ---

async function unregisterQuietly(deps: NotificationsDependencies, registration: StoredRegistration): Promise<void> {
  try {
    await withPushTimeout('unregister previous token', (signal) => unregisterPushToken(deps.getApiContext(), subjectOfStored(registration), 'web', { token: registration.token, prefix: registration.prefix }, { signal }));
  } catch (error) {
    logger.warn({ message: 'Web push: the previous registration could not be removed', context: { error } });
  }
}

function readSessionAccess(deps: NotificationsDependencies): { accessToken: string; apiUrl: string; headers: Record<string, string> } | null {
  try {
    const accessToken = deps.getAccessToken?.() ?? null;
    const apiUrl = deps.getBaseApiUrl();
    return accessToken && apiUrl ? { accessToken, apiUrl, headers: deps.getRequestHeaders?.() ?? {} } : null;
  } catch {
    return null;
  }
}

async function runSync(): Promise<void> {
  const deps = getOptionalNotificationsDependencies();
  const identity = currentIdentity(deps);
  const config = getWebPushConfig(deps);
  if (!deps || !identity || !config) {
    return;
  }
  const desktop = getDesktopPushBridge();
  if (!desktop && !browserCanPush()) {
    return;
  }

  const stored = readRegistration();
  if (stored && stored.key !== keyOf(identity)) {
    // Another subject or department on this device: take the device off the old one, then rotate the token so the old
    // channel holds a dead one even if that call failed.
    await unregisterQuietly(deps, stored);
    writeRegistration(null);
    await deleteLocalToken(config);
  }

  if (!desktop && Notification.permission !== 'granted') {
    notifyStatus();
    return;
  }

  const token = desktop ? await startDesktop(desktop, config) : await mintBrowserToken(config);
  if (!token) {
    notifyStatus();
    return;
  }

  // Signed out or moved on while the token was minted: the sign-out cleanup or the sync queued behind this one owns
  // the device now, and registering here would put the token on a session that has ended.
  const latest = currentIdentity(deps);
  if (!latest || keyOf(latest) !== keyOf(identity)) {
    return;
  }

  const current = readRegistration();
  if (current && current.key === keyOf(identity) && current.token === token && Date.now() - current.registeredAt < REREGISTER_AFTER_MS) {
    return;
  }
  if (current && current.token !== token) {
    await unregisterQuietly(deps, current);
  }

  // This session's credentials, read before anything can end it, for taking the registration back off if it does.
  const sessionAccess = readSessionAccess(deps);
  const registration: StoredRegistration = {
    key: keyOf(identity),
    kind: identity.kind,
    token,
    prefix: identity.prefix,
    userId: identity.userId,
    ...(identity.unitId ? { unitId: identity.unitId } : {}),
    registeredAt: Date.now(),
  };
  try {
    await withPushTimeout('register device', (signal) =>
      registerPushDevice(deps.getApiContext(), identity.subject, { token, platform: WEB_PUSH_PLATFORM, deviceUuid: deps.getDeviceUuid(), prefix: identity.prefix }, { signal })
    );
  } catch (error) {
    // A timed-out request may have reached Core: keep the token for the queued sign-out cleanup, but not as registered.
    writeRegistration({ ...registration, registeredAt: 0 });
    throw error;
  }

  const registeredIdentity = currentIdentity(deps);
  if (!registeredIdentity || keyOf(registeredIdentity) !== keyOf(identity)) {
    // The session ended (or moved to another subject) while Core accepted it: take it off as that session and kill the
    // token here. Without that session's token, keep the record unmarked: the sign-out cleanup or the sync queued
    // behind this one takes it off and rotates the token.
    if (sessionAccess) {
      await Promise.all([unregisterAtServer(registration, sessionAccess.accessToken, sessionAccess.apiUrl, sessionAccess.headers), deleteLocalToken(config)]);
      notifyStatus();
    } else {
      writeRegistration({ ...registration, registeredAt: 0 });
    }
    return;
  }
  writeRegistration(registration);
  notifyStatus();
}

let syncQueue: Promise<void> = Promise.resolve();
let askArmed = false;

/** Registration work (syncs and sign-out cleanups) runs one at a time, in the order it was asked for. */
function enqueue(work: () => Promise<void>): Promise<void> {
  const run = syncQueue.then(work, work);
  syncQueue = run.catch(() => undefined);
  return run;
}

/** Brings this device's registration in line with the signed-in subject. Calls run one at a time. */
export function syncWebPush(): Promise<void> {
  return enqueue(runSync);
}

/**
 * Asks for notification permission the way the phone app does after sign-in, once. Browsers only show the prompt from
 * a click, so it waits for the first one. A granted permission registers this browser straight away.
 */
export function askForPermissionOnce(): void {
  if (getDesktopPushBridge() || !getWebPushConfig() || !browserCanPush() || Notification.permission !== 'default' || askArmed) {
    return;
  }
  const lastAsked = readJson<number>(WEB_PUSH_ASKED_KEY);
  if (lastAsked && Date.now() - lastAsked < ASK_AGAIN_AFTER_MS) {
    return;
  }

  askArmed = true;
  const ask = (): void => {
    document.removeEventListener('click', ask, true);
    // Asked inside the click, while the browser still counts it as the person's.
    void Notification.requestPermission()
      .then((permission) => {
        // Denied is remembered by the browser; a dismissed prompt waits a week before asking again.
        writeJson(WEB_PUSH_ASKED_KEY, permission === 'default' ? Date.now() : null);
        notifyStatus();
        return permission === 'granted' ? syncWebPush() : undefined;
      })
      .catch((error: unknown) => logger.warn({ message: 'Web push: the permission request failed', context: { error } }))
      .finally(() => {
        askArmed = false;
      });
  };
  document.addEventListener('click', ask, true);
}

async function unregisterAtServer(registration: StoredRegistration, accessToken: string, apiUrl: string, headers: Record<string, string>): Promise<void> {
  // Straight to the server, not through the api client: its 401 handling would re-enter logout. Awaited (sign-out waits
  // on it), so no keepalive: some browsers refuse keepalive on a cross-origin call that needs a preflight.
  const subject = subjectOfStored(registration);
  try {
    await withPushTimeout('unregister at sign-out', (signal) =>
      fetch(`${apiUrl.replace(/\/+$/, '')}/Devices/UnRegisterWebPush`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          Token: registration.token,
          Prefix: registration.prefix,
          ...(subject.kind === 'unit' ? { UnitId: subject.unitId } : {}),
          ...(subject.kind === 'icUser' ? { Source: IC_PUSH_SOURCE } : {}),
        }),
        signal,
      })
    );
  } catch (error) {
    logger.warn({ message: 'Web push: the token could not be unregistered at sign-out', context: { error } });
  }
}

async function signOutCleanup(accessToken: string | null, config: WebPushFirebaseConfig | null, apiUrl: string, headers: Record<string, string>): Promise<void> {
  const stored = readRegistration();
  writeRegistration(null);
  // Killing the token runs beside the server call, not after it: sign-out only waits so long, and this device has to
  // stop showing the session's pushes even when the server is slow to answer.
  await Promise.all([deleteLocalToken(config), stored && accessToken && apiUrl ? unregisterAtServer(stored, accessToken, apiUrl, headers) : undefined]);
  notifyStatus();
}

/** Sign-out: read the session's config and server NOW (a server switch applies once sign-out returns), then clean up in order. */
function unregisterWebPushAtSignOut(accessToken: string | null): Promise<void> {
  const deps = getOptionalNotificationsDependencies();
  const config = getWebPushConfig(deps);
  const apiUrl = deps?.getBaseApiUrl() ?? '';
  const headers = deps?.getRequestHeaders?.() ?? {};
  // Queued behind any sync in flight, so the registration that sync is still writing is the one taken off. The next
  // sign-in's sync queues behind this in turn.
  return enqueue(() => signOutCleanup(accessToken, config, apiUrl, headers)).catch((error: unknown) => {
    logger.warn({ message: 'Web push sign-out cleanup failed', context: { error } });
  });
}

// --- Incoming pushes ---

const toNotificationData = (payload: WebPushPayload): PushNotificationData => ({
  eventCode: payload.eventCode,
  ...(payload.title ? { title: payload.title } : {}),
  ...(payload.body ? { body: payload.body } : {}),
  data: { ...payload },
});

function showInApp(payload: WebPushPayload | null | undefined): void {
  if (!payload?.eventCode) {
    return;
  }
  // The browser/desktop played nothing for a push to a focused page, so the in-app alert brings its own sound.
  void usePushNotificationModalStore.getState().showNotificationModal(toNotificationData(payload), { playSound: true });
}

/** A clicked notification goes where a tapped one does on the phone; anything that does not route shows the in-app alert. */
export async function openWebPush(payload: WebPushPayload | null | undefined): Promise<boolean> {
  if (!payload?.eventCode) {
    return false;
  }
  return openNotification(toNotificationData(payload));
}

/** A push arriving while the person is looking at the page gets the in-app alert, as on the phone. */
function onServiceWorkerPush(payload: WebPushPayload): void {
  if (typeof document !== 'undefined' && document.visibilityState === 'visible' && document.hasFocus()) {
    showInApp(payload);
  }
}

let detachListeners: (() => void) | null = null;

/** Wires clicks and foreground pushes to the app. Safe to call repeatedly. */
export function attachWebPushListeners(): void {
  if (detachListeners || typeof window === 'undefined') {
    return;
  }

  const desktop = getDesktopPushBridge();
  if (desktop) {
    const offReceived = desktop.onPushReceived(showInApp);
    const offClick = desktop.onPushNotificationClick((payload) => void openWebPush(payload));
    detachListeners = () => {
      offReceived();
      offClick();
    };
    // A click that started (or re-opened) the window arrived before this page could listen.
    void withPushTimeout('take pending click', () => desktop.pushTakePendingClick())
      .then((payload) => (payload ? openWebPush(payload) : undefined))
      .catch(() => undefined);
    return;
  }

  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return;
  }
  const onMessage = (event: MessageEvent): void => {
    const message = event.data as { type?: string; data?: WebPushPayload } | undefined;
    if (message?.type === 'NOTIFICATION_CLICK' && message.data) {
      void openWebPush(message.data);
    } else if (message?.type === 'PUSH_RECEIVED' && message.data) {
      onServiceWorkerPush(message.data);
    }
  };
  navigator.serviceWorker.addEventListener('message', onMessage);
  detachListeners = () => navigator.serviceWorker.removeEventListener('message', onMessage);

  // If the worker opened this window for a click, it hands the click over once told the page is ready.
  void findServiceWorker()
    .then((registration) => (navigator.serviceWorker.controller ?? registration?.active)?.postMessage({ type: 'CLIENT_READY' }))
    .catch(() => undefined);
}

async function clearWebBadge(): Promise<void> {
  try {
    const nav = typeof navigator === 'undefined' ? null : (navigator as Navigator & { clearAppBadge?: () => Promise<void> });
    await nav?.clearAppBadge?.();
  } catch {
    // Badging API unsupported or refused.
  }
}

/** Test hook. */
export function resetWebPushForTests(): void {
  detachListeners?.();
  detachListeners = null;
  syncQueue = Promise.resolve();
  askArmed = false;
  statusListeners.clear();
}

// --- The app's push API, as the native module offers it ---

export const pushNotificationService: PushNotificationService & { resetForTests(): void } = {
  initialize: async (): Promise<void> => attachWebPushListeners(),
  registerForPushNotifications: async (_options?: RegisterOptions): Promise<string | null> => {
    await syncWebPush();
    return readRegistration()?.token ?? null;
  },
  unregisterAtSignOut: (accessToken: string | null): Promise<void> => unregisterWebPushAtSignOut(accessToken),
  // The sign-out cleanup already took the token off the server and killed it here.
  clearLocalState: async (): Promise<void> => {
    usePushNotificationModalStore.getState().hideNotificationModal();
    await clearWebBadge();
  },
  resetRegistration: (): void => undefined,
  getPushToken: (): string | null => readRegistration()?.token ?? null,
  clearBadge: clearWebBadge,
  openNotification: (notification: PushNotificationData): Promise<boolean> => openNotification(notification),
  cleanup: (): void => {
    detachListeners?.();
    detachListeners = null;
  },
  resetForTests: resetWebPushForTests,
};

/** Keeps this browser/desktop registered while signed in. */
export const usePushNotifications = (trigger: PushRegistrationTrigger): UsePushNotificationsResult => {
  const [pushToken, setPushToken] = useState<string | null>(() => (typeof window === 'undefined' ? null : (readRegistration()?.token ?? null)));
  const key = trigger.signedIn && trigger.userId && trigger.departmentCode && trigger.webPushConfigured ? [trigger.serverUrl ?? '', trigger.userId, trigger.departmentCode, trigger.unitId ?? ''].join('|') : null;

  useEffect(() => {
    attachWebPushListeners();
    return subscribeWebPush(() => setPushToken(readRegistration()?.token ?? null));
  }, []);

  useEffect(() => {
    // Registering before auth settles would send a stale token (see the native hook).
    if (!key) {
      return;
    }
    syncWebPush().catch((error: unknown) => logger.error({ message: 'Web push registration failed', context: { error } }));
    askForPermissionOnce();
  }, [key]);

  return { pushToken };
};
