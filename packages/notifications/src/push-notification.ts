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
import { IC_PUSH_SOURCE, isPushRegistrationAccepted, pushSourceFor, type PushSubject, registerPushDevice, unregisterPushToken } from '@resgrid/api';
import { logger, useAppLifecycle } from '@resgrid/core';
import { translate } from '@resgrid/i18n';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

import { isAlertSuppressed } from './alert-suppression';
import { androidChannelsFor, type AndroidChannelSpec, buildIosCategories, CHANNEL_LIGHT_COLOR, CHANNEL_VIBRATION_PATTERN, type ChannelTranslate, CHECK_IN_ACTION_ID } from './channels';
import {
  getOptionalNotificationsDependencies,
  getPushSource,
  getPushSubjectKind,
  hasCheckInActions,
  hasDeskSounds,
  hasStatusTimerNotifications,
  type NotificationsDependencies,
  type PushSubjectKind,
  readActiveUnitId,
  readSession,
  readSignedIn,
} from './configure';
import { openNotification } from './deep-links';
import { extractPushNotificationData } from './event-codes';
import { openLocalNotification, readLocalNotificationData } from './local-notification-data';
import { cancelAllLocalNotifications } from './local-notifications';
import { type PushNotificationData, usePushNotificationModalStore } from './push-modal-store';
import { clearRegisteredPushToken, notifyPushTokenRegistered } from './push-token-listeners';
import type { PushNotificationService, PushRegistrationTrigger, RegisterOptions, UsePushNotificationsResult } from './push-types';
import {
  createMemoryNotificationsKv,
  isRemovalConfirmed,
  isSameRegistration,
  isSameSubscriber,
  type NotificationsKv,
  PENDING_SIGN_OUT_MAX_AGE_MS,
  type PendingPushSignOut,
  RegistrationStore,
  type SignOutUnregisterOutcome,
  type StoredNativePushRegistration,
} from './registration-storage';

/** Core push platform ids (`Devices/RegisterDevice` `Platform`). */
export const PUSH_PLATFORM_IOS = 1;
export const PUSH_PLATFORM_ANDROID = 2;

/** Request identifiers remembered for the cold-start dedupe (one entry per tap). */
export const HANDLED_RESPONSE_LIMIT = 200;
/** A stalled sign-out call must not hold sign-out up. */
const SIGN_OUT_TIMEOUT_MS = 10_000;
/** Keeps pending sign-out ids unique within one run of the app (the time alone can repeat). */
let pendingSignOutSequence = 0;

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
  const subject: PushSubject = kind === 'icUser' ? { kind: 'icUser' } : { kind: 'user', source: getPushSource() };

  return { kind, subject, userId: session.userId, departmentCode: session.departmentCode, source: pushSourceFor(subject) };
};

/** The subject a stored registration was made for (to take it off again). */
const subjectOf = (registration: StoredNativePushRegistration): PushSubject => {
  if (registration.UnitId) return { kind: 'unit', unitId: registration.UnitId };
  if (registration.Source === IC_PUSH_SOURCE) return { kind: 'icUser' };

  // A user app's own Source (Dispatch's), taken off with the Source it was registered with.
  return registration.Source ? { kind: 'user', source: registration.Source } : { kind: 'user' };
};

/** How a notification arriving in the foreground is shown: pushes as usual. */
const FOREGROUND_PRESENTATION: Notifications.NotificationBehavior = { shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: true };

/** The app's own local notifications (the status timer) stay quiet in the foreground: the app shows them on screen. */
const LOCAL_FOREGROUND_PRESENTATION: Notifications.NotificationBehavior = { shouldShowBanner: false, shouldShowList: false, shouldPlaySound: false, shouldSetBadge: false };

/** A push while alerts are held back (a dispatcher on break, `alert-suppression.ts`): into the list, no banner, no sound. */
const QUIET_FOREGROUND_PRESENTATION: Notifications.NotificationBehavior = { shouldShowBanner: false, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: true };

const foregroundPresentation = (request: Notifications.NotificationRequest): Notifications.NotificationBehavior => {
  if (readLocalNotificationData(request.content.data)) return LOCAL_FOREGROUND_PRESENTATION;

  return isAlertSuppressed({ channel: 'presentation', eventCode: extractPushNotificationData(request).eventCode ?? null }) ? QUIET_FOREGROUND_PRESENTATION : FOREGROUND_PRESENTATION;
};

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
  /** Pending sign-outs being taken off now, by record id. */
  private settling = new Map<string, Promise<void>>();
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
      handleNotification: async (notification) => foregroundPresentation(notification.request),
    });

    // Listeners first, synchronously, so receipts and taps during startup are not missed.
    this.notificationListener = Notifications.addNotificationReceivedListener(this.handleNotificationReceived);
    this.responseListener = Notifications.addNotificationResponseReceivedListener(this.handleNotificationResponse);
    this.setupNotifeeEvents();

    // A sign-out the previous run could not finish (killed, offline) takes its token off now; never holds up startup.
    void this.takeOffPendingSignOuts().catch(() => undefined);

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
      // channel's previous user settings. The Dispatch sound set keeps the shared file names, so a channel plays the
      // Dispatch file under its existing sound (notifee stores `android.resource://<package>/raw/<name>`) and needs no
      // re-creation; the desk channels exist only where the sound set has the desk sounds.
      const channels = androidChannelsFor({ deskSounds: hasDeskSounds(), statusTimer: hasStatusTimerNotifications() });
      const existing = await notifee.getChannels().catch(() => []);
      const existingSounds = new Map(existing.map((channel) => [channel.id, channel.sound]));
      const outdated = channels.filter((spec) => existingSounds.has(spec.id) && existingSounds.get(spec.id) !== spec.sound);
      await Promise.all(outdated.map((spec) => notifee.deleteChannel(spec.id).catch(() => undefined)));

      await notifee.createChannels(channels.map(toNotifeeChannel));
      logger.info({ message: 'Android notification channels set up', context: { channels: channels.length, recreated: outdated.length } });
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
      await notifee.setNotificationCategories(buildIosCategories({ checkInActions: hasCheckInActions(), statusTimer: hasStatusTimerNotifications(), translate: channelTranslate }));
      logger.info({ message: 'iOS notification categories set up' });
    } catch (error) {
      logger.error({ message: 'Error setting up iOS notification categories', context: errorContext(error) });
    }
  }

  // --- Incoming ---

  private handleNotificationReceived = (notification: Notifications.Notification): void => {
    const request = notification.request;

    // The app's own notification (the status timer) is already on screen in the app; no push modal for it.
    if (readLocalNotificationData(request.content.data)) {
      return;
    }

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

    // The app's own notification (the status timer): a tap or its action opens its screen (cold start included).
    const local = readLocalNotificationData(request.content.data);

    if (local) {
      void openLocalNotification(local);

      return;
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
    // The previous session's registrations go first: a token this one registers must not still deliver theirs, and a
    // device token replaced for them is replaced before this registration reads it.
    await this.takeOffPendingSignOuts();

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

      let token = await this.readDeviceToken();

      // A previous session's registration of this token is still on the server (its removal failed and is retried):
      // registered for this session too, the token would deliver both sessions' pushes here, and the retried removal
      // would later take it off this session as well. A new device token first; when the device hands the same one back
      // (iOS may), this registration waits for the removal, which runs again before every registration and at launch.
      if (token && this.isPendingSignOutToken(token)) {
        await this.rotateDeviceToken();
        token = await this.readDeviceToken();

        if (token && this.isPendingSignOutToken(token)) {
          logger.warn({ message: 'Push: registration waits until the previous session has taken this device token off' });

          return null;
        }
      }

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
        // Already registered: the followers hear it again (as on the web), so one whose own registration failed (the
        // Dispatch desk subscriber) tries again on this check instead of waiting for a new token or a restart.
        notifyPushTokenRegistered({ token, platform: Platform.OS === 'ios' ? PUSH_PLATFORM_IOS : PUSH_PLATFORM_ANDROID });
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

      if (!isPushRegistrationAccepted(result)) {
        logger.warn({ message: 'Push registration was not accepted by the server', context: { status: result?.Status, subject: identity.kind } });
        return null;
      }

      const previous = this.getRegistration();
      this.setRegistration(registration);
      this.registeredKey = key;
      // Subscribers that follow this registration (the Dispatch desk's own subscriber) take the same token.
      notifyPushTokenRegistered({ token, platform: Platform.OS === 'ios' ? PUSH_PLATFORM_IOS : PUSH_PLATFORM_ANDROID });

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

    // Only the session that made a registration takes it off (IC): another user's token is not this one's to remove.
    const own = registrations.filter((entry) => !signingOutUserId || entry.UserId === signingOutUserId);

    return this.takeOffAsEndedSession(accessToken, apiUrl, headers, own);
  }

  private async unregisterAfterSignOut(session: PushSession, registration: StoredNativePushRegistration): Promise<void> {
    const signOut = session.signOut;

    await this.takeOffAsEndedSession(signOut?.accessToken ?? null, signOut?.apiUrl ?? '', signOut?.headers ?? {}, [registration]);
  }

  /**
   * Takes an ended session's registrations off the server as that session. Core keeps a token on every user that
   * registered it and removes it only for the user whose access token asks, so this is the one way the next person on
   * the device stops getting the previous one's pushes. The record is written before any request, survives a killed
   * app and every wipe, and is tried again at launch and before the next registration until the server answers.
   */
  private async takeOffAsEndedSession(accessToken: string | null, apiUrl: string, headers: Record<string, string>, registrations: StoredNativePushRegistration[]): Promise<void> {
    if (registrations.length === 0) {
      return;
    }

    pendingSignOutSequence += 1;
    const record: PendingPushSignOut = { id: `${Date.now()}-${pendingSignOutSequence}`, accessToken, apiUrl, signedOutAt: Date.now(), registrations };
    this.getStore().addPendingSignOut(record);
    await this.settleRecord(record, headers);
  }

  /** Tries every registration of a pending sign-out once; one already being tried is waited for, not sent twice. */
  private settleRecord(record: PendingPushSignOut, headers: Record<string, string>): Promise<void> {
    const running = this.settling.get(record.id);

    if (running) {
      return running;
    }

    const run = (async () => {
      const usable = !!record.accessToken && !!record.apiUrl && Date.now() - record.signedOutAt < PENDING_SIGN_OUT_MAX_AGE_MS;
      const refused: StoredNativePushRegistration[] = [];

      await Promise.all(
        record.registrations.map(async (registration) => {
          const outcome = usable && record.accessToken ? await this.unregisterAsSignedOutSession(registration, record.accessToken, record.apiUrl, headers) : 'refused';

          if (outcome === 'refused') {
            refused.push(registration);
          } else {
            this.getStore().settlePendingSignOut(record.id, registration, outcome);
          }
        })
      );

      // A refused registration stays recorded until the device token is replaced: an app killed before that, or a
      // replacement that fails, tries again at the next launch or registration.
      if (refused.length > 0 && (await this.rotateDeviceToken())) {
        refused.forEach((registration) => this.getStore().settlePendingSignOut(record.id, registration, 'refused'));
      }
    })().finally(() => this.settling.delete(record.id));

    this.settling.set(record.id, run);

    return run;
  }

  /** Every sign-out the server has not confirmed yet (a killed app, no network, a server error), one pass at a time. */
  private takeOffPendingSignOuts(): Promise<void> {
    const headers = getOptionalNotificationsDependencies()?.getRequestHeaders?.() ?? {};

    return Promise.all(
      this.getStore()
        .getPendingSignOuts()
        .map((record) => this.settleRecord(record, headers))
    ).then(() => undefined);
  }

  /**
   * The ended session can no longer take its registration off (its token is refused or past its lifetime). A new device
   * token leaves the old registration pointing at a dead one: Android deletes the FCM token; iOS stops delivery until
   * the next registration (APNs may hand the same token back, so the server call above is what counts there).
   */
  private async rotateDeviceToken(): Promise<boolean> {
    logger.warn({ message: 'Push: a signed-out registration could not be taken off; replacing the device token' });
    this.pushToken = null;
    this.registeredKey = null;

    try {
      await Notifications.unregisterForNotificationsAsync();

      return true;
    } catch (error) {
      logger.warn({ message: 'Push: the device token could not be replaced', context: errorContext(error) });

      return false;
    }
  }

  /** Whether a sign-out the server has not confirmed still has `token` registered for its ended session. */
  private isPendingSignOutToken(token: string): boolean {
    return this.getStore()
      .getPendingSignOuts()
      .some((record) => record.registrations.some((registration) => registration.Token === token));
  }

  private async readDeviceToken(): Promise<string> {
    const devicePushToken = await Notifications.getDevicePushTokenAsync();

    return typeof devicePushToken.data === 'string' ? devicePushToken.data : '';
  }

  /** Straight to the server, not through the api client: its 401 handling would re-enter logout. Quiet by design. */
  private async unregisterAsSignedOutSession(registration: StoredNativePushRegistration, accessToken: string, apiUrl: string, headers: Record<string, string>): Promise<SignOutUnregisterOutcome> {
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
      if (response.ok) {
        if (await isRemovalConfirmed(response)) {
          return 'removed';
        }

        // Core could not take it off (it answers 200 with `Failure`): tried again, as after a server error.
        logger.warn({ message: 'Push: the server did not take the device token off at sign-out' });

        return 'retry';
      }

      logger.warn({ message: 'Push: the server refused to unregister the device token at sign-out', context: { status: response.status } });

      // A server error is tried again. Any other refusal (the ended session's token no longer accepted, above all) is
      // final: the registration stays on the server, and only a new device token stops it delivering here.
      return response.status >= 500 ? 'retry' : 'refused';
    } catch (error) {
      logger.warn({ message: 'Push: the device token could not be unregistered at sign-out', context: errorContext(error) });

      return 'retry';
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async clearLocalState(): Promise<void> {
    this.pushToken = null;
    clearRegisteredPushToken();
    this.setRegistration(null);
    this.getStore().setStale([]);
    this.registeredKey = null;
    this.handledResponseIds.clear();
    usePushNotificationModalStore.getState().hideNotificationModal();
    await Notifications.setBadgeCountAsync(0).catch(() => undefined);
    await Notifications.dismissAllNotificationsAsync().catch(() => undefined);
    // Nothing the app scheduled for the signed-out session may still fire.
    await cancelAllLocalNotifications();
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
    this.settling = new Map();
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
