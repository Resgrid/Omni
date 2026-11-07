import { logger } from '@resgrid/core';
import { Platform } from 'react-native';

import type { VoiceForegroundService } from '../runtime';

/** Translated texts of the ongoing-call notification and its channel. */
export interface VoiceSessionText {
  /** Channel name in the system notification settings. */
  channelName: string;
  title: string;
  body: string;
}

export interface NotifeeForegroundServiceOptions {
  /** Channel for the ongoing-call notification; created silent and low-importance if it does not exist. */
  channelId: string;
  /** Read at every start, so the notification follows the current language. */
  text: () => VoiceSessionText;
  smallIcon?: string;
}

/** The notifee notification this service posts (the subset of notifee's `Notification` it sets). */
interface VoiceSessionNotification {
  id: string;
  title: string;
  body: string;
  android: {
    channelId: string;
    asForegroundService: boolean;
    foregroundServiceTypes: number[];
    ongoing: boolean;
    onlyAlertOnce: boolean;
    smallIcon: string;
    pressAction: { id: string; launchActivity: string };
  };
}

interface NotifeeLike {
  createChannel: (channel: { id: string; name: string; importance?: number; sound?: string; vibration?: boolean }) => Promise<string>;
  displayNotification: (notification: VoiceSessionNotification) => Promise<string>;
  registerForegroundService: (runner: () => Promise<void>) => void;
  stopForegroundService: () => Promise<void>;
}

/** FOREGROUND_SERVICE_TYPE_MICROPHONE (Android 14+). */
const FOREGROUND_SERVICE_TYPE_MICROPHONE = 128;

/** notifee AndroidImportance.LOW: shown in the shade, no sound, no heads-up. */
const IMPORTANCE_LOW = 2;

/** One notification for the whole voice session: starting again updates it instead of posting a second one. */
export const VOICE_FOREGROUND_NOTIFICATION_ID = 'resgrid-voice-session';

let serviceRegistered = false;

/**
 * The Android foreground service that keeps a PTT call alive in the background (Unit livekit-store). Microphone type
 * only: it keeps capture legal while backgrounded — a headset or BLE handset press can unmute with the screen off — and
 * keeps the process alive so the room's audio keeps playing; `connectedDevice` is not declared because Play rejects
 * types whose use cannot be demonstrated. notifee runs the service only while a runner is registered, so the first start
 * registers one that lasts until `stopForegroundService()`. No-op on iOS (CallKit keeps audio alive).
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
      const api = notifee();

      if (!api) return;

      if (!serviceRegistered) {
        // The service lives as long as this promise is pending; stopForegroundService() ends it.
        api.registerForegroundService(() => new Promise<void>(() => undefined));
        serviceRegistered = true;
      }

      const text = options.text();
      await api.createChannel({ id: options.channelId, name: text.channelName, importance: IMPORTANCE_LOW, vibration: false });
      await api.displayNotification({
        id: VOICE_FOREGROUND_NOTIFICATION_ID,
        title: text.title,
        body: text.body,
        android: {
          channelId: options.channelId,
          asForegroundService: true,
          foregroundServiceTypes: [FOREGROUND_SERVICE_TYPE_MICROPHONE],
          ongoing: true,
          onlyAlertOnce: true,
          smallIcon: options.smallIcon ?? 'ic_launcher',
          pressAction: { id: 'default', launchActivity: 'default' },
        },
      });
    },
    stop: async () => {
      await notifee()?.stopForegroundService();
    },
  };
}

/** Test helper. Not for app code. */
export function resetVoiceForegroundServiceForTests(): void {
  serviceRegistered = false;
}
