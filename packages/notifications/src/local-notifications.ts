/**
 * Schedules notifications on the device itself (iOS/Android): the unit's own status timer has to reach the crew while
 * the app is in the background or the screen is off, with or without a network. Scheduled through expo-notifications,
 * so taps and foreground receipts arrive through the same listeners as pushes; push-notification.ts tells them apart by
 * their data (local-notification-data.ts), keeps them quiet in the foreground and routes their taps.
 *
 * The caller hands over the whole set it wants for a kind, every time its inputs change. A sync cancels what is no
 * longer wanted, schedules what is new or changed (an unchanged one is left alone), and removes delivered ones from an
 * episode that has ended, so a notice about a status the unit already left never stays on screen. Syncs run one at a
 * time. Web and Electron resolve `local-notifications.web.ts`, which schedules nothing.
 *
 * Android 12+ delivers a scheduled notification on time only with exact alarms (`SCHEDULE_EXACT_ALARM`, declared by apps
 * that schedule these; Android 14 denies it to new installs until the user allows it). Without them the OS may deliver
 * it minutes late. Each notification records how it was scheduled, so once exact alarms are allowed the next sync
 * schedules it again on time.
 */
import { logger, useAppLifecycle } from '@resgrid/core';
import * as Notifications from 'expo-notifications';
import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';

import {
  LOCAL_NOTIFICATION_KIND_IDS,
  LOCAL_NOTIFICATION_KINDS,
  type LocalNotification,
  type LocalNotificationData,
  localNotificationId,
  type LocalNotificationKind,
  type LocalNotificationSet,
  localNotificationSignature,
  readLocalNotificationData,
} from './local-notification-data';

let queue: Promise<unknown> = Promise.resolve();

const enqueue = (task: () => Promise<void>): Promise<void> => {
  const run = queue.then(task);

  queue = run.catch(() => undefined);

  return run;
};

const errorName = (cause: unknown): string => (cause instanceof Error ? cause.name : 'UnknownError');

/** Whether scheduled notifications arrive on time here: `notNeeded` off Android, where nothing has to be allowed. */
export type ExactAlarmAccess = 'granted' | 'denied' | 'notNeeded';

/** Reads whether this device may schedule exact alarms (Android 12+); always granted before Android 12. */
export async function getExactAlarmAccess(): Promise<ExactAlarmAccess> {
  if (Platform.OS !== 'android') return 'notNeeded';

  try {
    return (await Notifications.getExactAlarmPermissionsAsync()).granted ? 'granted' : 'denied';
  } catch (cause) {
    logger.warn({ message: 'Exact alarm access could not be read', context: { errorName: errorName(cause) } });

    return 'notNeeded';
  }
}

/** Opens the system screen where the user allows exact alarms; resolves with the access once they are back. */
export async function requestExactAlarmAccess(): Promise<ExactAlarmAccess> {
  if (Platform.OS !== 'android') return 'notNeeded';

  try {
    await Notifications.requestExactAlarmPermissionsAsync();
  } catch (cause) {
    logger.warn({ message: 'Exact alarm settings could not be opened', context: { errorName: errorName(cause) } });
  }

  return getExactAlarmAccess();
}

export interface ExactAlarmAccessView {
  /** Null until read. */
  access: ExactAlarmAccess | null;
  /** Opens the system screen to allow exact alarms. */
  request: () => Promise<void>;
}

/** Exact-alarm access while `enabled`, read again on every return to the foreground (it can change in system settings). */
export function useExactAlarmAccess(enabled: boolean = true): ExactAlarmAccessView {
  const { isActive } = useAppLifecycle();
  const [access, setAccess] = useState<ExactAlarmAccess | null>(null);

  useEffect(() => {
    if (!enabled || !isActive) return undefined;
    let current = true;

    void getExactAlarmAccess().then((next) => (current ? setAccess(next) : undefined));

    return () => {
      current = false;
    };
  }, [enabled, isActive]);

  const request = useCallback(async () => setAccess(await requestExactAlarmAccess()), []);

  return { access, request };
}

const belongsTo = (kind: LocalNotificationKind, identifier: string): boolean => identifier.startsWith(`${kind}:`);

/** A delivered notification that no longer describes the current episode (another unit, or a status that ended). */
const isStale = (data: LocalNotificationData | null, set: LocalNotificationSet | null): boolean => !set || !data || data.scope !== set.scope || data.episode !== set.episode;

async function syncNow(kind: LocalNotificationKind, set: LocalNotificationSet | null, now: number): Promise<void> {
  const spec = LOCAL_NOTIFICATION_KINDS[kind];
  // How the OS will deliver what is scheduled now: part of each signature, so allowing exact alarms reschedules them.
  const delivery = (await getExactAlarmAccess()) === 'denied' ? 'inexact' : 'exact';
  const signatureOf = (notification: LocalNotification): string => `${localNotificationSignature(notification)}|${delivery}`;
  const scope = set?.scope ?? '';
  const wanted = new Map((set?.notifications ?? []).filter((notification) => notification.at > now).map((notification) => [localNotificationId(kind, scope, notification.key), notification]));
  const scheduled = (await Notifications.getAllScheduledNotificationsAsync()).filter((request) => belongsTo(kind, request.identifier));
  let cancelled = 0;

  for (const request of scheduled) {
    const next = wanted.get(request.identifier);
    const data = readLocalNotificationData(request.content.data);

    if (next && set && data && data.episode === set.episode && data.signature === signatureOf(next)) {
      wanted.delete(request.identifier);
      continue;
    }

    await Notifications.cancelScheduledNotificationAsync(request.identifier);
    cancelled += 1;
  }

  for (const [identifier, notification] of wanted) {
    const data: LocalNotificationData = { localKind: kind, scope, episode: set?.episode ?? '', signature: signatureOf(notification) };

    await Notifications.scheduleNotificationAsync({
      identifier,
      content: {
        title: notification.title,
        body: notification.body,
        data,
        sound: `${spec.sound}.wav`,
        categoryIdentifier: spec.categoryId,
        interruptionLevel: spec.interruptionLevel,
        priority: Notifications.AndroidNotificationPriority.HIGH,
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: notification.at, channelId: spec.channelId },
    });
  }

  const presented = (await Notifications.getPresentedNotificationsAsync()).filter((notification) => belongsTo(kind, notification.request.identifier));

  for (const notification of presented) {
    if (isStale(readLocalNotificationData(notification.request.content.data), set)) await Notifications.dismissNotificationAsync(notification.request.identifier);
  }

  logger.debug({ message: 'Local notifications synced', context: { kind, scheduled: wanted.size, cancelled, delivery } });
}

/**
 * Makes the device's notifications of `kind` match `set`: null cancels them all and removes delivered ones. Never
 * rejects (a failure is logged and the next sync tries again).
 */
export function syncLocalNotifications(kind: LocalNotificationKind, set: LocalNotificationSet | null): Promise<void> {
  return enqueue(() => syncNow(kind, set, Date.now())).catch((cause: unknown) => logger.warn({ message: 'Local notifications could not be synced', context: { kind, errorName: errorName(cause) } }));
}

/** Cancels every local notification of every kind and removes delivered ones (sign-out). */
export function cancelAllLocalNotifications(): Promise<void> {
  return Promise.all(LOCAL_NOTIFICATION_KIND_IDS.map((kind) => syncLocalNotifications(kind, null))).then(() => undefined);
}
