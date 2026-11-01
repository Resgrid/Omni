import { useCallback, useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { type AudioStreamError, useAudioStreamStore } from '../audio-streams/audio-stream-store';
import type { AudioStream } from '../audio-streams/types';

export interface UseAudioStreamsOptions {
  /** Fetch the department's streams on mount. Default true. */
  autoFetch?: boolean;
}

export interface UseAudioStreamsResult {
  streams: AudioStream[];
  currentStream: AudioStream | null;
  isLoadingStreams: boolean;
  isLoading: boolean;
  isPlaying: boolean;
  isBuffering: boolean;
  error: AudioStreamError | null;
  play: (stream: AudioStream) => Promise<boolean>;
  stop: () => Promise<void>;
  /** Play `stream`, or stop it when it is the one playing. */
  toggle: (stream: AudioStream) => Promise<void>;
  refresh: () => Promise<void>;
}

/** Department audio (scanner) streams for the stream picker / player bar. */
export function useAudioStreams(options: UseAudioStreamsOptions = {}): UseAudioStreamsResult {
  const { autoFetch = true } = options;
  const state = useAudioStreamStore(
    useShallow((s) => ({
      streams: s.availableStreams,
      currentStream: s.currentStream,
      isLoadingStreams: s.isLoadingStreams,
      isLoading: s.isLoading,
      isPlaying: s.isPlaying,
      isBuffering: s.isBuffering,
      error: s.error,
      fetchAvailableStreams: s.fetchAvailableStreams,
      playStream: s.playStream,
      stopStream: s.stopStream,
    }))
  );
  const { fetchAvailableStreams, playStream, stopStream, currentStream } = state;

  useEffect(() => {
    if (autoFetch) void fetchAvailableStreams();
  }, [autoFetch, fetchAvailableStreams]);

  const toggle = useCallback(
    async (stream: AudioStream) => {
      if (currentStream?.Id === stream.Id) await stopStream();
      else await playStream(stream);
    },
    [currentStream, playStream, stopStream]
  );
  const refresh = useCallback(() => fetchAvailableStreams({ forceRefresh: true }), [fetchAvailableStreams]);

  return {
    streams: state.streams,
    currentStream,
    isLoadingStreams: state.isLoadingStreams,
    isLoading: state.isLoading,
    isPlaying: state.isPlaying,
    isBuffering: state.isBuffering,
    error: state.error,
    play: playStream,
    stop: stopStream,
    toggle,
    refresh,
  };
}
