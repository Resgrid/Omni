import { logger } from '@resgrid/core';

import { redactStreamUrl } from './stream-source';
import type { CreateStreamPlayer } from './types';

/** Web/Electron scanner-stream playback with an HTMLAudioElement (Dispatch audio-stream-store.web). Browsers keep tab audio playing in the background. */
export const createStreamPlayer: CreateStreamPlayer = async (stream, callbacks) => {
  const url = stream.Url.trim();
  const audio = new Audio(url);
  audio.crossOrigin = 'anonymous';
  const abort = new AbortController();
  const signal = abort.signal;
  let stopped = false;

  const failed = (): void => {
    logger.warn({ message: 'Audio stream playback failed', context: { streamName: stream.Name, streamUrl: redactStreamUrl(url) } });
    callbacks.onError(new Error('Audio stream playback failed'));
  };

  audio.addEventListener('playing', () => callbacks.onStatus({ playing: true, buffering: false }), { signal });
  audio.addEventListener('waiting', () => callbacks.onStatus({ playing: !audio.paused, buffering: true }), { signal });
  audio.addEventListener('pause', () => callbacks.onStatus({ playing: false, buffering: false }), { signal });
  // A live stream that "ends" lost its connection.
  audio.addEventListener('ended', failed, { signal });
  audio.addEventListener('error', failed, { signal });

  function stop(): void {
    if (stopped) return;
    stopped = true;
    abort.abort();
    audio.pause();
    audio.src = '';
    audio.load();
  }

  function reload(): void {
    if (stopped) return;
    // A fresh request: the browser drops what it buffered and joins the stream at its live edge.
    audio.src = url;
    audio.load();
    audio.play().catch(failed);
  }

  try {
    await audio.play();
  } catch (error) {
    stop();
    throw error;
  }

  return { stop, reload };
};
