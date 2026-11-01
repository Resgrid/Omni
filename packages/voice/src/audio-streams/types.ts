import type { DepartmentAudioResultStreamData } from '@resgrid/models';

export type AudioStream = DepartmentAudioResultStreamData;

export interface StreamPlaybackStatus {
  playing: boolean;
  buffering: boolean;
}

export interface StreamPlayerCallbacks {
  onStatus: (status: StreamPlaybackStatus) => void;
  /** Playback failed after it started (the handle is already released). */
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
}

/** Creates and starts a player for one stream; rejects when the stream cannot start. */
export type CreateStreamPlayer = (stream: AudioStream, callbacks: StreamPlayerCallbacks, options: StreamPlayerOptions) => Promise<StreamPlayerHandle>;
