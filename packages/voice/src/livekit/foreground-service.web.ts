import type { VoiceForegroundService } from '../runtime';

export interface NotifeeForegroundServiceOptions {
  channelId: string;
  title: string;
  body: string;
  smallIcon?: string;
}

/** Browsers keep a tab's audio alive on their own: no foreground service on web/Electron. */
export function createNotifeeForegroundService(_options: NotifeeForegroundServiceOptions): VoiceForegroundService {
  return { start: async () => undefined, stop: async () => undefined };
}
