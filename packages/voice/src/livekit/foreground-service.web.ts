import type { VoiceForegroundService } from '../runtime';

/** Translated texts of the ongoing-call notification and its channel. */
export interface VoiceSessionText {
  channelName: string;
  title: string;
  body: string;
}

export interface NotifeeForegroundServiceOptions {
  channelId: string;
  text: () => VoiceSessionText;
  smallIcon?: string;
}

/** Browsers keep a tab's audio alive on their own: no foreground service on web/Electron. */
export function createNotifeeForegroundService(_options: NotifeeForegroundServiceOptions): VoiceForegroundService {
  return { start: async () => undefined, stop: async () => undefined };
}
