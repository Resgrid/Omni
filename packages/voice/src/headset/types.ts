/** Media/headset button PTT (AirPods, Bluetooth earbuds, wired headsets) via AVRCP/MediaSession, not BLE characteristics. */
export type HeadsetButtonType = 'play_pause' | 'play' | 'pause' | 'next' | 'previous' | 'stop' | 'hook' | 'unknown';

/** Who keeps media-button monitoring running: the LiveKit session (headset PTT) or a connected BLE handset (Android fallback). */
export type HeadsetMonitorOwner = 'livekit' | 'bluetooth';

/** Android MediaButtonModule `onMediaButtonEvent` payload. */
export interface MediaButtonKeyEvent {
  keyCode?: number;
  action?: string;
  timestamp?: number;
}

export interface HeadsetButtonService {
  readonly isSupported: boolean;
  startMonitoring(owner?: HeadsetMonitorOwner): void;
  stopMonitoring(owner?: HeadsetMonitorOwner): void;
  isMonitoringActive(): boolean;
  /** Feed an Android key event (also used by tests and the debug screen). */
  handleKeyEvent(event: MediaButtonKeyEvent): void;
  /** Feed a decoded button (iOS remote commands, tests). */
  handleButton(type: HeadsetButtonType, phase?: 'down' | 'up'): void;
  destroy(): void;
}

/** Android KeyEvent codes. */
export const KEYCODE_HEADSETHOOK = 79;
export const KEYCODE_MEDIA_PLAY_PAUSE = 85;
export const KEYCODE_MEDIA_STOP = 86;
export const KEYCODE_MEDIA_NEXT = 87;
export const KEYCODE_MEDIA_PREVIOUS = 88;
export const KEYCODE_MEDIA_PLAY = 126;
export const KEYCODE_MEDIA_PAUSE = 127;

export const mapKeyCode = (keyCode: number | undefined): HeadsetButtonType => {
  switch (keyCode) {
    case KEYCODE_MEDIA_PLAY_PAUSE:
      return 'play_pause';
    case KEYCODE_MEDIA_PLAY:
      return 'play';
    case KEYCODE_MEDIA_PAUSE:
      return 'pause';
    case KEYCODE_MEDIA_NEXT:
      return 'next';
    case KEYCODE_MEDIA_PREVIOUS:
      return 'previous';
    case KEYCODE_MEDIA_STOP:
      return 'stop';
    case KEYCODE_HEADSETHOOK:
      return 'hook';
    default:
      return 'unknown';
  }
};

/** The keys that can drive PTT: headset hook, play/pause, play, pause. */
export const isPttCapableButton = (type: HeadsetButtonType): boolean => type === 'play_pause' || type === 'hook' || type === 'play' || type === 'pause';
