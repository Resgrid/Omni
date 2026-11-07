import type { DepartmentAudioResultStreamData } from '@resgrid/models';

export type AudioStream = DepartmentAudioResultStreamData;

export interface StreamPlaybackStatus {
  playing: boolean;
  buffering: boolean;
}

export interface StreamPlayerCallbacks {
  onStatus: (status: StreamPlaybackStatus) => void;
  /**
   * Playback failed after it started (dropped connection, network change, relay error). The handle stays usable:
   * `reload()` retries the stream in the same player, `stop()` gives up.
   */
  onError: (error: unknown) => void;
}

export interface StreamPlayerOptions {
  /** Keep playing in the background and publish OS media controls (variants that declare background audio). */
  background: boolean;
  /** A PTT channel is joined: keep the shared audio session record-capable. */
  keepRecording: boolean;
}

export interface StreamPlayerHandle {
  stop(): void;
  /**
   * Connects to the stream again, at its live edge, in the same player: the lock-screen / notification controls and
   * Android's media playback service stay up, so the app is not suspended or killed while it reconnects in the
   * background. Throws when the player cannot reload.
   */
  reload(): void;
}

/** Creates and starts a player for one stream; rejects when the stream cannot start. */
export type CreateStreamPlayer = (stream: AudioStream, callbacks: StreamPlayerCallbacks, options: StreamPlayerOptions) => Promise<StreamPlayerHandle>;
