import { logger } from '@resgrid/core';
import { type AudioStatus, createAudioPlayer, setAudioModeAsync } from 'expo-audio';

import { useLiveKitStore } from '../livekit/livekit-store';

export interface AudioClipHandle {
  /** Stops and releases the clip (safe to call more than once). */
  stop: () => void;
}

/**
 * Plays a recorded clip once (Dispatch call audio modal), in the foreground. The audio mode is app-wide: while a PTT
 * channel is joined it stays record-capable, or transmitting breaks. `onFinished` runs when the clip plays to its end.
 */
export async function playAudioClip(url: string, onFinished: () => void): Promise<AudioClipHandle> {
  await setAudioModeAsync({ allowsRecording: useLiveKitStore.getState().isConnected, playsInSilentMode: true, shouldPlayInBackground: false, interruptionMode: 'duckOthers' });
  const player = createAudioPlayer({ uri: url.trim() });
  let released = false;

  const stop = (): void => {
    if (released) return;
    released = true;

    try {
      player.remove();
    } catch (error) {
      logger.warn({ message: 'Releasing an audio clip failed', context: { error } });
    }
  };

  player.addListener('playbackStatusUpdate', (status: AudioStatus) => {
    if (!status.didJustFinish || released) return;
    stop();
    onFinished();
  });
  player.volume = 1;
  player.play();

  return { stop };
}
