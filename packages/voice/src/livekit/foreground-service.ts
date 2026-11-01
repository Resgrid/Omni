import { logger } from '@resgrid/core';
import { Platform } from 'react-native';

import type { VoiceForegroundService } from '../runtime';

export interface NotifeeForegroundServiceOptions {
  /** Existing notification channel (owned by @resgrid/notifications). */
  channelId: string;
  /** Translated notification text. */
  title: string;
  body: string;
  smallIcon?: string;
}

interface NotifeeLike {
  displayNotification: (notification: unknown) => Promise<string>;
  stopForegroundService: () => Promise<void>;
}

/** FOREGROUND_SERVICE_TYPE_MICROPHONE (Android 14+). */
const FOREGROUND_SERVICE_TYPE_MICROPHONE = 128;

/**
 * The Android foreground service that keeps a PTT call alive in the background (Unit livekit-store). Microphone type
 * only: it keeps capture legal while backgrounded; remote playback needs no type, and `connectedDevice` is not declared
 * because Play rejects types whose use cannot be demonstrated. The task handler itself is registered once at startup by
 * the notifications package (`notifee.registerForegroundService`). No-op on iOS (CallKit keeps audio alive).
 */
export function createNotifeeForegroundService(options: NotifeeForegroundServiceOptions): VoiceForegroundService {
  const notifee = (): NotifeeLike | null => {
    if (Platform.OS !== 'android') return null;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require('@notifee/react-native') as { default?: NotifeeLike };
      return mod.default ?? null;
    } catch (error) {
      logger.warn({ message: 'notifee unavailable; voice foreground service disabled', context: { error } });
      return null;
    }
  };
  return {
    start: async () => {
      await notifee()?.displayNotification({
        title: options.title,
        body: options.body,
        android: { channelId: options.channelId, asForegroundService: true, foregroundServiceTypes: [FOREGROUND_SERVICE_TYPE_MICROPHONE], smallIcon: options.smallIcon ?? 'ic_launcher' },
      });
    },
    stop: async () => {
      await notifee()?.stopForegroundService();
    },
  };
}
