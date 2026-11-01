/**
 * Native push (iOS/Android), omni-plan §7.6. Baseline: Unit's service (notifee channels, iOS categories, check-in
 * action, 200-entry cold-start dedupe, unit-switch token cleanup, sign-out with the outgoing session's token) +
 * Responder's deep-link table, queued registration, re-registration on resume and cold-start handling before channel
 * setup + IC's registration persisted across restarts with a per-variant `Source`. Every routed id passes
 * `isSafeRouteId` (the parser refuses unsafe ids).
 *
 * Web and Electron resolve `push-notification.web.ts` instead (same exported surface).
 */
import notifee, { type AndroidChannel, AndroidImportance, AndroidVisibility, AuthorizationStatus, type Event as NotifeeEvent, EventType } from '@notifee/react-native';
import { IC_PUSH_SOURCE, type PushSubject, registerPushDevice, unregisterPushToken } from '@resgrid/api';
import { logger, useAppLifecycle } from '@resgrid/core';
import { translate } from '@resgrid/i18n';
import type { PushRegistrationResult } from '@resgrid/models';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

import { ANDROID_CHANNELS, type AndroidChannelSpec, buildIosCategories, CHANNEL_LIGHT_COLOR, CHANNEL_VIBRATION_PATTERN, type ChannelTranslate, CHECK_IN_ACTION_ID } from './channels';
import { getOptionalNotificationsDependencies, getPushSubjectKind, hasCheckInActions, type NotificationsDependencies, type PushSubjectKind, readActiveUnitId, readSession, readSignedIn } from './configure';
import { openNotification } from './deep-links';
import { extractPushNotificationData } from './event-codes';
import { type PushNotificationData, usePushNotificationModalStore } from './push-modal-store';
import type { PushNotificationService, PushRegistrationTrigger, RegisterOptions, UsePushNotificationsResult } from './push-types';
import { createMemoryNotificationsKv, isSameRegistration, isSameSubscriber, type NotificationsKv, RegistrationStore, type StoredNativePushRegistration } from './registration-storage';

/** Core push platform ids (`Devices/RegisterDevice` `Platform`). */
export const PUSH_PLATFORM_IOS = 1;
export const PUSH_PLATFORM_ANDROID = 2;

/** RegisterDevice answers 200 even when it fails; only these statuses mean the server took the registration. */
const REGISTERED_STATUSES = ['queued', 'success'];
/** Request identifiers remembered for the cold-start dedupe (one entry per tap). */
export const HANDLED_RESPONSE_LIMIT = 200;
/** A stalled sign-out call must not hold sign-out up. */
const SIGN_OUT_TIMEOUT_MS = 10_000;

interface PushSession {
  /** Set at sign-out: how that session reached the server, for a registration that lands after it. */
  signOut?: { accessToken: string | null; apiUrl: string; headers: Record<string, string> };
}

interface RegistrationIdentity {
  kind: Exclude<PushSubjectKind, 'none'>;
  subject: PushSubject;
  userId: string;
  departmentCode: string;
  unitId?: string;
  source?: string;
}

const identityKey = (identity: RegistrationIdentity): string => [identity.kind, identity.userId, identity.departmentCode, identity.unitId ?? ''].join('|');

/** The variant's subject for the signed-in session, or null when it has none (signed out, no unit, `none`). */
const currentIdentity = (deps: NotificationsDependencies): RegistrationIdentity | null => {
  const kind = getPushSubjectKind();
  if (kind === 'none' || !readSignedIn(deps)) return null;
  const session = readSession(deps);
  if (!session) return null;
  if (kind === 'unit') {
    const unitId = readActiveUnitId(deps);
    return unitId ? { kind, subject: { kind: 'unit', unitId }, userId: session.userId, departmentCode: session.departmentCode, unitId } : null;
  }
  if (kind === 'icUser') {
    return { kind, subject: { kind: 'icUser' }, userId: session.userId, departmentCode: session.departmentCode, source: IC_PUSH_SOURCE };
  }
  return { kind, subject: { kind: 'user' }, userId: session.userId, departmentCode: session.departmentCode };
};

/** The subject a stored registration was made for (to take it off again). */
const subjectOf = (registration: StoredNativePushRegistration): PushSubject => {
  if (registration.UnitId) return { kind: 'unit', unitId: registration.UnitId };
  if (registration.Source === IC_PUSH_SOURCE) return { kind: 'icUser' };
  return { kind: 'user' };
};

const isAccepted = (result: PushRegistrationResult | null | undefined): boolean => REGISTERED_STATUSES.includes((result?.Status ?? '').toLowerCase());

const errorContext = (error: unknown): { errorName: string; errorMessage: string } => ({
  errorName: error instanceof Error ? error.name : 'UnknownError',
  errorMessage: error instanceof Error ? error.message : String(error),
});

const interpolate = (text: string, params?: Record<string, string | number>): string => (params ? text.replace(/\{\{(\w+)\}\}/g, (match, name: string) => (name in params ? String(params[name]) : match)) : text);

const channelTranslate: ChannelTranslate = (key, defaultValue, params) => {
  try {
    const value = translate(key, { defaultValue, ...(params ?? {}) });
    return value && value !== key ? value : interpolate(defaultValue, params);
  } catch {
    return interpolate(defaultValue, params);
  }
};

const toNotifeeChannel = (spec: AndroidChannelSpec): AndroidChannel => {
  const name = channelTranslate(spec.nameKey, spec.defaultName, spec.nameParams);
  return {
    id: spec.id,
    name,
    description: name,
    importance: AndroidImportance.HIGH,
    vibration: spec.vibration,
    ...(spec.vibration ? { vibrationPattern: [...CHANNEL_VIBRATION_PATTERN] } : {}),
    sound: spec.sound,
    lights: true,
    lightColor: CHANNEL_LIGHT_COLOR,
    visibility: AndroidVisibility.PUBLIC,
  };
};

class NativePushNotificationService implements PushNotificationService {
  private pushToken: string | null = null;
  private store: RegistrationStore | null = null;
  private storeKv: NotificationsKv | null = null;
  private memoryKv = createMemoryNotificationsKv();
  /** What the server has registered (token, subscriber); persisted. Undefined until read from storage. */
  private registration: StoredNativePushRegistration | null | undefined = undefined;
  /** Server, subject and token of the last registration the server took. */
  private registeredKey: string | null = null;
  /** Replaced at sign-out, so a registration in flight can tell its session has ended. */
  private session: PushSession = {};
  private registrationQueue: Promise<unknown> = Promise.resolve();
  private initialized = false;
  private notificationListener: { remove: () => void } | null = null;
  private responseListener: { remove: () => void } | null = null;
  private notifeeForegroundUnsubscribe: (() => void) | null = null;
  /**
   * Request identifiers of taps already routed. On a cold start the same launch tap can arrive through both the
   * response listener and getLastNotificationResponseAsync; capped so it never grows without bound.
   */
  private handledResponseIds = new Set<string>();

  private getStore(): RegistrationStore {
    const kv = getOptionalNotificationsDependencies()?.storage ?? this.memoryKv;
    if (!this.store || this.storeKv !== kv) {
      this.store = new RegistrationStore(kv);
      this.storeKv = kv;
      this.registration = undefined;
    }
    return this.store;
  }

  private getRegistration(): StoredNativePushRegistration | null {
    const store = this.getStore();
    if (this.registration === undefined) {
      this.registration = store.getCurrent();
    }
    return this.registration;
  }

  private setRegistration(registration: StoredNativePushRegistration | null): void {
    this.getStore().setCurrent(registration);
    this.registration = registration;
  }

  // --- Lifecycle ---

  async initialize(): Promise<void> {
    if (Platform.OS === 'web' || this.initialized) {
      return;
    }
    this.initialized = true;

    // Foreground presentation: expo-notifications owns the UNUserNotificationCenter delegate.
    Notifications.setNotificationHandler({
      handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: true }),
    });

    // Listeners first, synchronously, so receipts and taps during startup are not missed.
    this.notificationListener = Notifications.addNotificationReceivedListener(this.handleNotificationReceived);
    this.responseListener = Notifications.addNotificationResponseReceivedListener(this.handleNotificationResponse);
    this.setupNotifeeEvents();

    // Cold start before channel setup: the launch tap must not wait for 60 channels to be created.
    await this.handleLaunchResponse();

    await this.setupAndroidChannels();
    await this.setupIosCategories();

    logger.info({ message: 'Push notification service initialized' });
  }

  cleanup(): void {
    this.notificationListener?.remove();
    this.notificationListener = null;
    this.responseListener?.remove();
    this.responseListener = null;
    this.notifeeForegroundUnsubscribe?.();
    this.notifeeForegroundUnsubscribe = null;
    this.initialized = false;
  }

  private async handleLaunchResponse(): Promise<void> {
    try {
      const response = await Notifications.getLastNotificationResponseAsync();
      if (response) {
        logger.info({ message: 'App opened from a notification (cold start)' });
        this.handleResponseOnce(response, 'launch');
      }
    } catch (error) {
      logger.error({ message: 'Error reading the launch notification response', context: errorContext(error) });
    }
  }

  // --- Channels and categories ---

  private async setupAndroidChannels(): Promise<void> {
    if (Platform.OS !== 'android') {
      return;
    }
    try {
      // A channel's sound is fixed once created. Channels a legacy build created with a classic (or the default) sound
      // are deleted and created again with the modern one — best effort: some Android versions restore a re-created
      // channel's previous user settings.
      const existing = await notifee.getChannels().catch(() => []);
      const existingSounds = new Map(existing.map((channel) => [channel.id, channel.sound]));
      const outdated = ANDROID_CHANNELS.filter((spec) => existingSounds.has(spec.id) && existingSounds.get(spec.id) !== spec.sound);
      await Promise.all(outdated.map((spec) => notifee.deleteChannel(spec.id).catch(() => undefined)));

      await notifee.createChannels(ANDROID_CHANNELS.map(toNotifeeChannel));
      logger.info({ message: 'Android notification channels set up', context: { channels: ANDROID_CHANNELS.length, recreated: outdated.length } });
    } catch (error) {
      logger.error({ message: 'Error setting up Android notification channels', context: errorContext(error) });
    }
  }

  private async setupIosCategories(): Promise<void> {
    if (Platform.OS !== 'ios') {
      return;
    }
    try {
      // Registers categories only; it never asks for permission.
      await notifee.setNotificationCategories(buildIosCategories({ checkInActions: hasCheckInActions(), translate: channelTranslate }));
      logger.info({ message: 'iOS notification categories set up' });
    } catch (error) {
      logger.error({ message: 'Error setting up iOS notification categories', context: errorContext(error) });
    }
  }

  // --- Incoming ---

  private handleNotificationReceived = (notification: Notifications.Notification): void => {
    const request = notification.request;
    const { eventCode, data } = extractPushNotificationData(request);
    logger.info({ message: 'Notification received', context: { eventCode } });
    if (!eventCode) {
      return;
    }
    // The OS already played the channel sound (shouldPlaySound), so the modal stays silent.
    void usePushNotificationModalStore.getState().showNotificationModal({
      eventCode,
      data,
      ...(request.content.title ? { title: request.content.title } : {}),
      ...(request.content.body ? { body: request.content.body } : {}),
    });
  };

  private handleNotificationResponse = (response: Notifications.NotificationResponse): void => {
    this.handleResponseOnce(response, 'listener');
  };

  /** One path for taps from the live listener and the cold-start replay; skips a request already routed. */
  private handleResponseOnce(response: Notifications.NotificationResponse, source: 'listener' | 'launch'): void {
    const request = response.notification.request;
    const identifier = request.identifier;
    if (identifier) {
      if (this.handledResponseIds.has(identifier)) {
        logger.debug({ message: 'Skipping an already handled notification response', context: { source } });
        return;
      }
      if (this.handledResponseIds.size >= HANDLED_RESPONSE_LIMIT) {
        const oldest = this.handledResponseIds.values().next().value;
        if (oldest !== undefined) this.handledResponseIds.delete(oldest);
      }
      this.handledResponseIds.add(identifier);
    }

    if (response.actionIdentifier === CHECK_IN_ACTION_ID) {
      void this.runCheckInAction();
      return;
    }

    const { eventCode, data } = extractPushNotificationData(request);
    logger.info({ message: 'Notification response received (tap)', context: { eventCode, source } });
    if (!eventCode) {
      return;
    }
    void openNotification({
      eventCode,
      data,
      ...(request.content.title ? { title: request.content.title } : {}),
      ...(request.content.body ? { body: request.content.body } : {}),
    });
  }

  /** Taps and actions on notifee-displayed notifications, incl. the check-in action. Never throws (headless task). */
  private handleNotifeeEvent = async ({ type, detail }: NotifeeEvent): Promise<void> => {
    try {
      if (type === EventType.ACTION_PRESS && detail.pressAction?.id === CHECK_IN_ACTION_ID) {
        await this.runCheckInAction();
        return;
      }
      if (type === EventType.PRESS && detail.notification) {
        const data = (detail.notification.data ?? {}) as Record<string, unknown>;
        const eventCode = data.eventCode;
        if (typeof eventCode === 'string' && eventCode) {
          await openNotification({
            eventCode,
            data,
            ...(detail.notification.title ? { title: detail.notification.title } : {}),
            ...(detail.notification.body ? { body: detail.notification.body } : {}),
          });
        }
      }
    } catch (error) {
      logger.error({ message: 'Notifee event handling failed', context: errorContext(error) });
    }
  };

  private setupNotifeeEvents(): void {
    this.notifeeForegroundUnsubscribe = notifee.onForegroundEvent((event) => {
      void this.handleNotifeeEvent(event);
    });
    notifee.onBackgroundEvent(this.handleNotifeeEvent);
  }

  private async runCheckInAction(): Promise<void> {
    const handler = getOptionalNotificationsDependencies()?.onCheckInAction;
    if (!hasCheckInActions() || !handler) {
      return;
    }
    try {
      logger.info({ message: 'Check-in action pressed from a notification' });
      await handler();
    } catch (error) {
      logger.error({ message: 'Check-in action failed', context: errorContext(error) });
    }
  }

  openNotification(notification: PushNotificationData): Promise<boolean> {
    return openNotification(notification);
  }

  // --- Registration ---

  registerForPushNotifications(options: RegisterOptions = {}): Promise<string | null> {
    const run = this.registrationQueue.then(() => this.register(options.requestPermission ?? true));
    this.registrationQueue = run.catch(() => undefined);
    return run;
  }

  resetRegistration(): void {
    this.registeredKey = null;
  }

  getPushToken(): string | null {
    return this.pushToken;
  }

  private async register(requestPermission: boolean): Promise<string | null> {
    const deps = getOptionalNotificationsDependencies();
    if (!deps || Platform.OS === 'web') {
      return null;
    }
    if (!Device.isDevice) {
      logger.warn({ message: 'Push notifications are not available on a simulator/emulator' });
      return null;
    }
    const identity = currentIdentity(deps);
    if (!identity) {
      return null;
    }
    const session = this.session;

    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      if (existingStatus !== 'granted' && requestPermission) {
        const { status } = await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowBadge: true, allowSound: true, allowCriticalAlerts: true } });
        finalStatus = status;
      }
      if (finalStatus !== 'granted') {
        if (requestPermission) {
          logger.warn({ message: 'Push notification permission not granted', context: { status: finalStatus } });
        }
        return null;
      }

      if (requestPermission) {
        // Authorizes notifee-managed channels and critical alerts on both platforms.
        const settings = await notifee.requestPermission({ alert: true, badge: true, sound: true, criticalAlert: true });
        if (settings.authorizationStatus === AuthorizationStatus.DENIED) {
          logger.warn({ message: 'Notifee notification permission denied' });
          return null;
        }
      }

      const devicePushToken = await Notifications.getDevicePushTokenAsync();
      const token = typeof devicePushToken.data === 'string' ? devicePushToken.data : '';
      if (!token) {
        return null;
      }
      this.pushToken = token;

      // Signed out while permission and the token were sorted out: the session that asked for this has ended.
      if (session !== this.session) {
        return null;
      }

      const apiUrl = deps.getBaseApiUrl();
      const key = [apiUrl, identityKey(identity), token].join('|');
      if (key === this.registeredKey) {
        return token;
      }

      // The identity was captured when this call ran; if the session moved on (another unit, department or user),
      // the call queued behind this one registers the right subscriber.
      const latest = currentIdentity(deps);
      if (!latest || identityKey(latest) !== identityKey(identity)) {
        return null;
      }

      const registration: StoredNativePushRegistration = {
        UserId: identity.userId,
        Token: token,
        Prefix: identity.departmentCode,
        ...(identity.unitId ? { UnitId: identity.unitId } : {}),
        ...(identity.source ? { Source: identity.source } : {}),
      };

      const result = await registerPushDevice(deps.getApiContext(), identity.subject, {
        token,
        platform: Platform.OS === 'ios' ? PUSH_PLATFORM_IOS : PUSH_PLATFORM_ANDROID,
        deviceUuid: deps.getDeviceUuid(),
        prefix: identity.departmentCode,
      });

      if (session !== this.session) {
        // Signed out while the request was in flight: sign-out could not take this off, as it had not landed. Take it
        // off now as the session that signed out, and never keep it.
        await this.unregisterAfterSignOut(session, registration);
        return null;
      }

      if (!isAccepted(result)) {
        logger.warn({ message: 'Push registration was not accepted by the server', context: { status: result?.Status, subject: identity.kind } });
        return null;
      }

      const previous = this.getRegistration();
      this.setRegistration(registration);
      this.registeredKey = key;

      // Switching unit or department: take the token off the subscriber the device left, after the new registration is
      // in (a failure never leaves the device on no subscriber). A removal that fails stays pending and is retried.
      const store = this.getStore();
      const stale = store.getStale().filter((entry) => !isSameSubscriber(entry, registration));
      if (previous && !isSameSubscriber(previous, registration) && previous.UserId === registration.UserId && !stale.some((entry) => isSameRegistration(entry, previous))) {
        stale.push(previous);
      }
      store.setStale(stale);
      await this.removeStaleRegistrations(session);

      logger.info({ message: 'Registered for push notifications', context: { subject: identity.kind, platform: Platform.OS } });
      return token;
    } catch (error) {
      logger.warn({ message: 'Error registering for push notifications', context: errorContext(error) });
      return null;
    }
  }

  /** Takes the token off the subscribers the device left; each stays pending until the server confirms. */
  private async removeStaleRegistrations(session: PushSession): Promise<void> {
    const deps = getOptionalNotificationsDependencies();
    if (!deps) return;
    const store = this.getStore();
    for (const stale of store.getStale()) {
      if (session !== this.session) {
        return;
      }
      try {
        const result = await unregisterPushToken(deps.getApiContext(), subjectOf(stale), 'native', { token: stale.Token, prefix: stale.Prefix });
        if ((result?.Status ?? '').toLowerCase() === 'success') {
          store.setStale(store.getStale().filter((entry) => !isSameRegistration(entry, stale)));
        } else {
          logger.warn({ message: 'Push: the server did not take the token off the previous subscriber', context: { status: result?.Status } });
        }
      } catch (error) {
        logger.warn({ message: 'Push: the token could not be taken off the previous subscriber', context: errorContext(error) });
      }
    }
  }

  // --- Sign-out ---

  unregisterAtSignOut(accessToken: string | null): Promise<void> {
    const deps = getOptionalNotificationsDependencies();
    // Everything read NOW, while the outgoing session and its server are still current: a server switch applies the
    // new URL once sign-out returns, and logout clears the session right after this hook.
    const signingOutUserId = deps ? (readSession(deps)?.userId ?? null) : null;
    const apiUrl = deps ? deps.getBaseApiUrl() : '';
    const headers = deps?.getRequestHeaders?.() ?? {};
    const store = this.getStore();
    const registrations = [this.getRegistration(), ...store.getStale()].filter((entry): entry is StoredNativePushRegistration => entry !== null);

    this.setRegistration(null);
    store.setStale([]);
    this.registeredKey = null;
    // A registration still in flight belongs to this session and takes itself off the same way once it lands.
    this.session.signOut = { accessToken, apiUrl, headers };
    this.session = {};

    if (!accessToken || !apiUrl) {
      return Promise.resolve();
    }
    // Only the session that made a registration takes it off (IC): another user's token is not this one's to remove.
    const own = registrations.filter((entry) => !signingOutUserId || entry.UserId === signingOutUserId);
    return Promise.all(own.map((entry) => this.unregisterAsSignedOutSession(entry, accessToken, apiUrl, headers))).then(() => undefined);
  }

  private async unregisterAfterSignOut(session: PushSession, registration: StoredNativePushRegistration): Promise<void> {
    const signOut = session.signOut;
    if (!signOut?.accessToken || !signOut.apiUrl) {
      logger.warn({ message: 'Push: a registration that landed after sign-out could not be taken off' });
      return;
    }
    await this.unregisterAsSignedOutSession(registration, signOut.accessToken, signOut.apiUrl, signOut.headers);
  }

  /** Straight to the server, not through the api client: its 401 handling would re-enter logout. Quiet by design. */
  private async unregisterAsSignedOutSession(registration: StoredNativePushRegistration, accessToken: string, apiUrl: string, headers: Record<string, string>): Promise<void> {
    const controller = typeof AbortController === 'undefined' ? null : new AbortController();
    const timer = controller ? setTimeout(() => controller.abort(), SIGN_OUT_TIMEOUT_MS) : null;
    try {
      const response = await fetch(`${apiUrl.replace(/\/+$/, '')}/Devices/UnRegisterNativePush`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          Token: registration.Token,
          Prefix: registration.Prefix,
          ...(registration.UnitId ? { UnitId: registration.UnitId } : {}),
          ...(registration.Source ? { Source: registration.Source } : {}),
        }),
        ...(controller ? { signal: controller.signal } : {}),
      });
      if (!response.ok) {
        logger.warn({ message: 'Push: the server refused to unregister the device token at sign-out', context: { status: response.status } });
      }
    } catch (error) {
      logger.warn({ message: 'Push: the device token could not be unregistered at sign-out', context: errorContext(error) });
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async clearLocalState(): Promise<void> {
    this.pushToken = null;
    this.setRegistration(null);
    this.getStore().setStale([]);
    this.registeredKey = null;
    this.handledResponseIds.clear();
    usePushNotificationModalStore.getState().hideNotificationModal();
    await Notifications.setBadgeCountAsync(0).catch(() => undefined);
    await Notifications.dismissAllNotificationsAsync().catch(() => undefined);
    if (Platform.OS === 'android') {
      await notifee.cancelAllNotifications().catch(() => undefined);
    }
  }

  async clearBadge(): Promise<void> {
    if (Platform.OS === 'web') return;
    await Notifications.setBadgeCountAsync(0).catch(() => undefined);
  }

  /** Test hook. */
  resetForTests(): void {
    this.cleanup();
    this.pushToken = null;
    this.store = null;
    this.storeKv = null;
    this.memoryKv = createMemoryNotificationsKv();
    this.registration = undefined;
    this.registeredKey = null;
    this.session = {};
    this.registrationQueue = Promise.resolve();
    this.handledResponseIds.clear();
  }
}

export const pushNotificationService: PushNotificationService & { resetForTests(): void } = new NativePushNotificationService();

const registerInBackground = (requestPermission: boolean): void => {
  pushNotificationService.registerForPushNotifications({ requestPermission }).catch((error: unknown) => {
    logger.error({ message: 'Push registration failed', context: errorContext(error) });
  });
};

/**
 * Keeps this device registered while signed in: registers when the session's identity changes (prompting for
 * permission), and checks again WITHOUT prompting whenever the app returns to the foreground — that retries a failed
 * registration and picks up a permission granted in system settings or a rotated token.
 */
export const usePushNotifications = (trigger: PushRegistrationTrigger): UsePushNotificationsResult => {
  const { isActive } = useAppLifecycle();
  const wasActiveRef = useRef(isActive);
  const key = trigger.signedIn && trigger.userId && trigger.departmentCode ? [trigger.serverUrl ?? '', trigger.userId, trigger.departmentCode, trigger.unitId ?? ''].join('|') : null;

  useEffect(() => {
    if (Platform.OS === 'web' || !key) return;
    registerInBackground(true);
  }, [key]);

  useEffect(() => {
    const cameToForeground = isActive && !wasActiveRef.current;
    wasActiveRef.current = isActive;
    if (Platform.OS !== 'web' && cameToForeground && key) {
      registerInBackground(false);
    }
  }, [isActive, key]);

  return { pushToken: pushNotificationService.getPushToken() };
};
