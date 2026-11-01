import { logger } from '@resgrid/core';

import { redactStreamUrl } from './stream-source';
import type { CreateStreamPlayer } from './types';

/** Web/Electron scanner-stream playback with an HTMLAudioElement (Dispatch audio-stream-store.web). Browsers keep tab audio playing in the background. */
export const createStreamPlayer: CreateStreamPlayer = async (stream, callbacks) => {
  const audio = new Audio(stream.Url.trim());
  audio.crossOrigin = 'anonymous';
  const abort = new AbortController();
  const signal = abort.signal;
  let stopped = false;

  audio.addEventListener('playing', () => callbacks.onStatus({ playing: true, buffering: false }), { signal });
  audio.addEventListener('waiting', () => callbacks.onStatus({ playing: !audio.paused, buffering: true }), { signal });
  audio.addEventListener('pause', () => callbacks.onStatus({ playing: false, buffering: false }), { signal });
  audio.addEventListener('ended', () => callbacks.onStatus({ playing: false, buffering: false }), { signal });
  audio.addEventListener(
    'error',
    () => {
      logger.error({ message: 'Audio stream playback failed', context: { streamName: stream.Name, streamUrl: redactStreamUrl(stream.Url) } });
      stop();
      callbacks.onError(new Error('Audio stream playback failed'));
    },
    { signal }
  );

  function stop(): void {
    if (stopped) return;
    stopped = true;
    abort.abort();
    audio.pause();
    audio.src = '';
    audio.load();
  }

  try {
    await audio.play();
  } catch (error) {
    stop();
    throw error;
  }
  return { stop };
};
