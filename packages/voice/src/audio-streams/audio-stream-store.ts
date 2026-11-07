import { getDepartmentAudioStreams } from '@resgrid/api';
import { logger } from '@resgrid/core';
import { create } from 'zustand';

import { setStreamAudioActive } from '../audio/audio-session';
import { getVoiceCapabilities } from '../capabilities';
import { getHeadsetButtonService } from '../headset/headset-button-service';
import { useLiveKitStore } from '../livekit/livekit-store';
import { getVoiceRuntime } from '../runtime';
import { errorMessage } from '../util/async';
import { isVoiceOnline, type NetworkEvent, reconnectDelayMs, subscribeNetworkEvents } from '../util/network';
import { createStreamPlayer } from './stream-player';
import type { AudioStream, StreamPlayerHandle } from './types';

export type AudioStreamErrorCode = 'not_configured' | 'fetch_failed' | 'missing_url' | 'playback_failed';

export interface AudioStreamError {
  code: AudioStreamErrorCode;
  message?: string;
}

export interface AudioStreamState {
  availableStreams: AudioStream[];
  isLoadingStreams: boolean;
  currentStream: AudioStream | null;
  isPlaying: boolean;
  isLoading: boolean;
  isBuffering: boolean;
  /** The stream dropped (connection lost, network change, stall) and is being reconnected. */
  isReconnecting: boolean;
  isBottomSheetVisible: boolean;
  error: AudioStreamError | null;

  fetchAvailableStreams: (options?: { forceRefresh?: boolean }) => Promise<void>;
  playStream: (stream: AudioStream) => Promise<boolean>;
  stopStream: () => Promise<void>;
  setIsBottomSheetVisible: (visible: boolean) => void;
  cleanup: () => Promise<void>;
  reset: () => Promise<void>;
}

/** Waits between reconnect attempts: quick at first (a Wi-Fi ↔ cellular handover drops for a second), then easing off. */
export const STREAM_RECONNECT_DELAYS_MS: readonly number[] = [1_000, 2_000, 4_000, 8_000, 15_000, 30_000];

/** Attempts before giving up (about ten minutes); attempts are not spent while the device is offline. */
export const STREAM_MAX_RECONNECT_ATTEMPTS = 25;

/** Buffering this long without playing is a dead connection (iOS often stalls instead of failing). */
export const STREAM_STALL_TIMEOUT_MS = 20_000;

/** A live stream resumed from the OS controls after this long reconnects, so it plays now rather than from a stale buffer. */
export const STREAM_LIVE_RESUME_RELOAD_MS = 10_000;

const IDLE = { currentStream: null, isPlaying: false, isLoading: false, isBuffering: false, isReconnecting: false };

let player: StreamPlayerHandle | null = null;

/** Only the latest play request may commit its player (Unit fix: an older setup resolving late is released). */
let latestPlayRequestId = 0;

/** Reconnect bookkeeping for the committed player. */
let reconnectAttempt = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let stallTimer: ReturnType<typeof setTimeout> | null = null;

/** Waiting for the network before the next attempt (offline: attempts are not spent). */
let awaitingNetwork = false;

/** The player has played since it (re)connected: a later not-playing, not-buffering status is a pause. */
let hasPlayed = false;

/** When the OS controls paused the stream (null while playing). */
let pausedAt: number | null = null;
let unsubscribeNetwork: (() => void) | null = null;

const clearReconnectTimer = (): void => {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = null;
};

const clearStallTimer = (): void => {
  if (stallTimer) clearTimeout(stallTimer);
  stallTimer = null;
};

const resetPlaybackTracking = (): void => {
  clearReconnectTimer();
  clearStallTimer();
  reconnectAttempt = 0;
  awaitingNetwork = false;
  hasPlayed = false;
  pausedAt = null;
  unsubscribeNetwork?.();
  unsubscribeNetwork = null;
  setStreamAudioActive(false);
};

/**
 * Department audio (scanner) streams (Unit audio-stream-store + Dispatch web store): the list from
 * `GET /Voice/GetDepartmentAudioStreams`, one stream at a time, expo-audio on native (background playback and OS media
 * controls where the variant declares background audio) and an <audio> element on web/Electron.
 *
 * A stream keeps playing until the member stops it (None in the sheet) or pauses it from the OS controls. When the
 * connection drops — an error, a stall, the device going offline or moving between Wi-Fi and cellular — the same player
 * reconnects at the stream's live edge with backoff, at once when the network comes back, so the OS controls and the
 * background session stay up meanwhile.
 */
export const useAudioStreamStore = create<AudioStreamState>((set, get) => {
  const isCommitted = (handle: StreamPlayerHandle): boolean => player === handle;

  const giveUp = (handle: StreamPlayerHandle, reason: string): void => {
    logger.error({ message: 'Audio stream could not reconnect; stopping it', context: { streamName: get().currentStream?.Name, attempts: reconnectAttempt } });
    player = null;
    latestPlayRequestId++;
    resetPlaybackTracking();

    try {
      handle.stop();
    } catch (stopError) {
      logger.warn({ message: 'Failed to stop audio stream', context: { error: stopError } });
    }

    set({ ...IDLE, error: { code: 'playback_failed', message: reason } });
  };

  const reconnectNow = (handle: StreamPlayerHandle): void => {
    clearReconnectTimer();
    awaitingNetwork = false;

    if (!isCommitted(handle)) return;

    hasPlayed = false;
    pausedAt = null;

    try {
      handle.reload();
      // A reload that never gets going is a failed attempt too.
      armStallTimer(handle);
    } catch (error) {
      scheduleReconnect(handle, errorMessage(error));
    }
  };

  const scheduleReconnect = (handle: StreamPlayerHandle, reason: string): void => {
    if (!isCommitted(handle)) return;

    // Several signals can report one failure (an error event and a stall): one attempt is already on its way.
    if (reconnectTimer || awaitingNetwork) return;

    clearStallTimer();

    if (reconnectAttempt >= STREAM_MAX_RECONNECT_ATTEMPTS) {
      giveUp(handle, reason);

      return;
    }

    set({ isReconnecting: true, isPlaying: false, isBuffering: true, isLoading: false });

    if (!isVoiceOnline()) {
      awaitingNetwork = true;
      logger.info({ message: 'Audio stream dropped while offline; reconnecting when the network is back', context: { streamName: get().currentStream?.Name } });

      return;
    }

    const delay = reconnectDelayMs(reconnectAttempt, STREAM_RECONNECT_DELAYS_MS);
    reconnectAttempt++;
    logger.warn({ message: 'Audio stream dropped; reconnecting', context: { streamName: get().currentStream?.Name, attempt: reconnectAttempt, delay, reason } });
    reconnectTimer = setTimeout(() => reconnectNow(handle), delay);
  };

  function armStallTimer(handle: StreamPlayerHandle): void {
    if (stallTimer) return;
    stallTimer = setTimeout(() => {
      stallTimer = null;
      scheduleReconnect(handle, 'Audio stream stalled');
    }, STREAM_STALL_TIMEOUT_MS);
  }

  const handleNetworkEvent = (event: NetworkEvent): void => {
    const handle = player;

    if (!handle) return;

    // Back online, or on another network: a pending attempt goes now, and a stream still buffering on the old network's
    // socket reconnects instead of waiting out the stall timeout.
    if (reconnectTimer || awaitingNetwork || (event === 'network_change' && !pausedAt)) {
      if (event === 'network_change') logger.info({ message: 'Network changed; reconnecting the audio stream', context: { streamName: get().currentStream?.Name } });
      reconnectNow(handle);
    }
  };

  const handleStatus = (handle: StreamPlayerHandle, playing: boolean, buffering: boolean): void => {
    // A player that reports playing while it buffers (the web 'waiting' event mid-stream) has not recovered: it is a
    // stall like any other, so the timer stays armed and a reconnect in progress counts until audio actually runs.
    if (playing && !buffering) {
      clearStallTimer();

      if (get().isReconnecting) logger.info({ message: 'Audio stream reconnected', context: { streamName: get().currentStream?.Name, attempts: reconnectAttempt } });

      const resumedAfterLongPause = pausedAt !== null && Date.now() - pausedAt >= STREAM_LIVE_RESUME_RELOAD_MS;
      reconnectAttempt = 0;
      hasPlayed = true;
      pausedAt = null;
      set({ isPlaying: true, isBuffering: buffering, isLoading: false, isReconnecting: false, error: null });

      if (resumedAfterLongPause) {
        // The OS play button resumed a buffer that is minutes old (or a dead socket): join the stream as it is now.
        logger.info({ message: 'Audio stream resumed after a pause; reconnecting at the live edge', context: { streamName: get().currentStream?.Name } });
        reconnectNow(handle);
      }

      return;
    }

    if (buffering) {
      armStallTimer(handle);
      // A running stream refilling its buffer still counts as playing; a reconnecting one does not until audio runs.
      set({ isPlaying: playing && !get().isReconnecting, isBuffering: true, isLoading: false });

      return;
    }

    // Neither playing nor buffering after it played: paused from the lock screen / notification (or an interruption).
    clearStallTimer();

    if (hasPlayed && pausedAt === null && !get().isReconnecting) pausedAt = Date.now();

    set({ isPlaying: false, isBuffering: false, isLoading: false });
  };

  return {
    availableStreams: [],
    isLoadingStreams: false,
    ...IDLE,
    isBottomSheetVisible: false,
    error: null,

    fetchAvailableStreams: async (options = {}) => {
      const ctx = getVoiceRuntime().getApiContext();

      if (!ctx) {
        set({ error: { code: 'not_configured' } });

        return;
      }

      set({ isLoadingStreams: true });

      try {
        const response = await getDepartmentAudioStreams(ctx, { forceRefresh: options.forceRefresh });
        set({ availableStreams: Array.isArray(response?.Data) ? response.Data : [], error: null });
      } catch (error) {
        logger.error({ message: 'Failed to fetch department audio streams', context: { error } });
        set({ availableStreams: [], error: { code: 'fetch_failed', message: errorMessage(error) } });
      } finally {
        set({ isLoadingStreams: false });
      }
    },

    playStream: async (stream) => {
      if (!stream?.Url?.trim()) {
        logger.warn({ message: 'Audio stream has no URL', context: { streamName: stream?.Name } });
        set({ error: { code: 'missing_url' } });

        return false;
      }

      if (player) await get().stopStream();

      const requestId = ++latestPlayRequestId;
      set({ isLoading: true, isBuffering: true, isReconnecting: false, error: null, currentStream: stream });
      // Assigned once the player commits; the callbacks only act for the committed handle.
      let committed: StreamPlayerHandle | null = null;

      try {
        const handle = await createStreamPlayer(
          stream,
          {
            onStatus: ({ playing, buffering }) => {
              if (requestId !== latestPlayRequestId || !committed) return;
              handleStatus(committed, playing, buffering);
            },
            onError: (error) => {
              if (requestId !== latestPlayRequestId || !committed) return;
              scheduleReconnect(committed, errorMessage(error));
            },
          },
          { background: getVoiceCapabilities().backgroundAudio, keepRecording: useLiveKitStore.getState().isConnected }
        );

        if (requestId !== latestPlayRequestId) {
          handle.stop();

          return false;
        }

        resetPlaybackTracking();
        committed = handle;
        player = handle;
        setStreamAudioActive(true);
        unsubscribeNetwork = subscribeNetworkEvents(handleNetworkEvent);
        armStallTimer(handle);
        set({ isPlaying: true, isLoading: false });
        logger.info({ message: 'Audio stream started', context: { streamName: stream.Name } });
        // Android: the stream's media session must not take the headset buttons from push-to-talk.
        getHeadsetButtonService().reassertMediaSession();

        return true;
      } catch (error) {
        logger.error({ message: 'Failed to start audio stream', context: { streamName: stream.Name, error } });

        if (requestId === latestPlayRequestId) set({ ...IDLE, error: { code: 'playback_failed', message: errorMessage(error) } });

        return false;
      }
    },

    stopStream: async () => {
      const current = player;
      player = null;
      latestPlayRequestId++;
      resetPlaybackTracking();

      try {
        current?.stop();
      } catch (error) {
        logger.warn({ message: 'Failed to stop audio stream', context: { error } });
      } finally {
        set(IDLE);
      }
    },

    setIsBottomSheetVisible: (isBottomSheetVisible) => set({ isBottomSheetVisible }),

    cleanup: () => get().stopStream(),

    reset: async () => {
      await get().stopStream();
      set({ availableStreams: [], isLoadingStreams: false, isBottomSheetVisible: false, error: null });
    },
  };
});
