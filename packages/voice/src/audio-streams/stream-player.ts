import { logger } from '@resgrid/core';
import { type AudioPlayer, type AudioStatus, createAudioPlayer, setAudioModeAsync } from 'expo-audio';

import { redactStreamUrl, resolveStreamSource } from './stream-source';
import type { AudioStream, CreateStreamPlayer, StreamPlayerHandle } from './types';

/**
 * Native scanner-stream playback with expo-audio (Unit audio-stream-store). With background audio the player is
 * published to the OS media session (Android media notification = expo-audio's mediaPlayback foreground service, iOS
 * Now Playing): Play rejects background playback without a visible control and Android kills it after ~3 minutes.
 */
const activateMediaControls = (player: AudioPlayer, stream: AudioStream): void => {
  try {
    player.setActiveForLockScreen(true, { title: stream.Name ?? '' }, { isLiveStream: true, showSeekForward: false, showSeekBackward: false });
  } catch (error) {
    logger.warn({ message: 'Failed to publish stream to the OS media session', context: { error } });
  }
};

const releaseMediaControls = (player: AudioPlayer): void => {
  try {
    player.clearLockScreenControls();
  } catch (error) {
    logger.warn({ message: 'Failed to clear stream media controls', context: { error } });
  }
};

export const createStreamPlayer: CreateStreamPlayer = async (stream, callbacks, options) => {
  const source = resolveStreamSource(stream.Url.trim());
  // The audio mode is app-wide: while a PTT channel is joined it must stay record-capable or transmitting breaks.
  await setAudioModeAsync({ allowsRecording: options.keepRecording, shouldPlayInBackground: options.background, playsInSilentMode: true, interruptionMode: 'duckOthers', shouldRouteThroughEarpiece: false });

  const player = createAudioPlayer(source, { updateInterval: 1000, keepAudioSessionActive: true, preferredForwardBufferDuration: 5 });
  player.loop = false;
  player.volume = 1;
  player.muted = false;
  if (options.background) activateMediaControls(player, stream);

  let released = false;
  const release = (): void => {
    if (released) return;
    released = true;
    if (options.background) releaseMediaControls(player);
    try {
      player.remove();
    } catch {
      // Already released.
    }
  };

  player.addListener('playbackStatusUpdate', (status: AudioStatus) => {
    if (released) return;
    if (status.error) {
      logger.error({ message: 'Audio stream playback failed', context: { streamName: stream.Name, streamUrl: redactStreamUrl(source.uri), hasCredentials: source.headers !== undefined } });
      release();
      callbacks.onError(new Error(String(status.error)));
      return;
    }
    callbacks.onStatus({ playing: status.playing, buffering: status.isBuffering });
  });

  try {
    player.play();
  } catch (error) {
    release();
    throw error;
  }

  const handle: StreamPlayerHandle = {
    stop: () => {
      if (released) return;
      try {
        player.pause();
      } finally {
        release();
      }
    },
  };
  return handle;
};
