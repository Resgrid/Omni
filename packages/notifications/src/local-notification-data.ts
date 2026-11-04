/**
 * Notifications the app schedules on the device itself (local-notifications.ts), as opposed to pushes Core sends: what
 * they carry and where a tap on one goes. Today there is one kind, the unit's own status timer, which has to reach the
 * crew while the app is in the background or the screen is off. No native import, so the push service on every
 * platform and the tests share it.
 */
import { isSafeRouteId, logger } from '@resgrid/core';
import type { NotificationContent } from 'expo-notifications';
import { z } from 'zod';

import { STATUS_TIMER_CATEGORY_ID, STATUS_TIMER_CHANNEL } from './channels';
import { navigateToNotificationTarget } from './deep-links';
import type { NotificationTarget } from './event-codes';
import type { NotificationSound } from './sounds';

export type LocalNotificationKind = 'statusTimer';

export const LOCAL_NOTIFICATION_KIND_IDS = ['statusTimer'] as const satisfies readonly LocalNotificationKind[];

export interface LocalNotificationKindSpec {
  /** Android channel (sound, importance, vibration). */
  channelId: string;
  /** iOS category (actions). */
  categoryId: string;
  /** iOS plays the bundled `{sound}.wav`; Android plays the channel's sound. */
  sound: NotificationSound;
  /** iOS: time-sensitive breaks through Focus (store builds carry the entitlement). */
  interruptionLevel: 'active' | 'timeSensitive';
  /** What a tap opens, from the set's scope. */
  target: (scope: string) => NotificationTarget;
}

export const LOCAL_NOTIFICATION_KINDS: Readonly<Record<LocalNotificationKind, LocalNotificationKindSpec>> = {
  // Scoped to the unit: a tap opens its status console.
  statusTimer: {
    channelId: STATUS_TIMER_CHANNEL.id,
    categoryId: STATUS_TIMER_CATEGORY_ID,
    sound: STATUS_TIMER_CHANNEL.sound,
    interruptionLevel: 'timeSensitive',
    target: (unitId) => ({ kind: 'unitStatusTimer', id: unitId }),
  },
};

export interface LocalNotification {
  /** Unique within its set (the timer level, say). */
  key: string;
  /** When it shows (epoch ms); a time already past is not scheduled. */
  at: number;
  title: string;
  body: string;
}

export interface LocalNotificationSet {
  /** What the set is about (the unit id). */
  scope: string;
  /** The episode it belongs to (the status record): delivered notifications from any other episode are removed. */
  episode: string;
  notifications: readonly LocalNotification[];
}

/** `content.data` of a local notification: the OS keeps it across restarts and hands it back on a tap. */
const LocalNotificationDataSchema = z.object({
  localKind: z.enum(LOCAL_NOTIFICATION_KIND_IDS),
  scope: z.string().min(1),
  episode: z.string(),
  /** Time and text it was scheduled with, so a sync leaves an unchanged one alone. */
  signature: z.string(),
});

export type LocalNotificationData = z.infer<typeof LocalNotificationDataSchema>;

export const localNotificationId = (kind: LocalNotificationKind, scope: string, key: string): string => `${kind}:${scope}:${key}`;

export const localNotificationSignature = (notification: LocalNotification): string => [notification.at, notification.title, notification.body].join('|');

/** The local notification a notification's `content.data` describes; null for a push (or anything unreadable). */
export function readLocalNotificationData(data: NotificationContent['data'] | null | undefined): LocalNotificationData | null {
  const parsed = LocalNotificationDataSchema.safeParse(data);

  return parsed.success ? parsed.data : null;
}

/** Opens what a tapped local notification points at (the status console); false when this app has no screen for it. */
export async function openLocalNotification(data: LocalNotificationData): Promise<boolean> {
  if (!isSafeRouteId(data.scope)) return false;
  logger.info({ message: 'Local notification opened', context: { kind: data.localKind } });

  return navigateToNotificationTarget(LOCAL_NOTIFICATION_KINDS[data.localKind].target(data.scope));
}
