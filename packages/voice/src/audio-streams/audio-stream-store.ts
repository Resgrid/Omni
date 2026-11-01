import { getDepartmentAudioStreams } from '@resgrid/api';
import { logger } from '@resgrid/core';
import { create } from 'zustand';

import { getVoiceCapabilities } from '../capabilities';
import { useLiveKitStore } from '../livekit/livekit-store';
import { getVoiceRuntime } from '../runtime';
import { errorMessage } from '../util/async';
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
  isBottomSheetVisible: boolean;
  error: AudioStreamError | null;

  fetchAvailableStreams: (options?: { forceRefresh?: boolean }) => Promise<void>;
  playStream: (stream: AudioStream) => Promise<boolean>;
  stopStream: () => Promise<void>;
  setIsBottomSheetVisible: (visible: boolean) => void;
  cleanup: () => Promise<void>;
  reset: () => Promise<void>;
}

const IDLE = { currentStream: null, isPlaying: false, isLoading: false, isBuffering: false };

let player: StreamPlayerHandle | null = null;
/** Only the latest play request may commit its player (Unit fix: an older setup resolving late is released). */
let latestPlayRequestId = 0;

/**
 * Department audio (scanner) streams (Unit audio-stream-store + Dispatch web store): the list from
 * `GET /Voice/GetDepartmentAudioStreams`, one stream at a time, expo-audio on native (background playback and OS media
 * controls where the variant declares background audio) and an <audio> element on web/Electron.
 */
export const useAudioStreamStore = create<AudioStreamState>((set, get) => ({
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
    set({ isLoading: true, isBuffering: true, error: null, currentStream: stream });
    try {
      const handle = await createStreamPlayer(
        stream,
        {
          onStatus: ({ playing, buffering }) => {
            if (requestId !== latestPlayRequestId) return;
            set({ isPlaying: playing, isBuffering: buffering, isLoading: false });
          },
          onError: (error) => {
            if (requestId !== latestPlayRequestId) return;
            player = null;
            set({ ...IDLE, error: { code: 'playback_failed', message: errorMessage(error) } });
          },
        },
        { background: getVoiceCapabilities().backgroundAudio, keepRecording: useLiveKitStore.getState().isConnected }
      );
      if (requestId !== latestPlayRequestId) {
        handle.stop();
        return false;
      }
      player = handle;
      set({ isPlaying: true, isLoading: false });
      logger.info({ message: 'Audio stream started', context: { streamName: stream.Name } });
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
}));
