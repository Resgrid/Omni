import type { NavigationVoice } from './services';

/** What the voice needs from the speech engine (expo-speech; SpeechSynthesis on web). */
export interface SpeechEngine {
  /** Speaks one prompt; `onFinished` runs when it ends, is stopped or fails. */
  speak(text: string, onFinished: () => void): void;
  stop(): void;
}

/** Lowering other apps' audio for the length of a prompt (the app's `ResgridDevice` module). */
export interface AudioDucking {
  /** True when other audio was lowered (false: nothing changed, e.g. a call owns the audio). */
  begin(): Promise<boolean>;
  end(): Promise<boolean>;
}

/**
 * Turn-by-turn prompts that lower other audio while they play (MapLibre plan §9.2: music or a podcast dips under "turn
 * left"; a radio or phone call is never touched — the native side refuses then). A new prompt replaces the one playing
 * and keeps the audio lowered; the audio comes back when the last prompt ends or guidance stops.
 */
export function createDuckingVoice(engine: SpeechEngine, ducking: AudioDucking): NavigationVoice {
  let utterance = 0;
  let ducked = false;
  let stopped = false;
  let ducking$: Promise<void> | null = null;

  const release = (): void => {
    if (!ducked) return;
    ducked = false;
    void ducking.end().catch(() => false);
  };

  // One request for every prompt waiting on it. A stop while it was pending gives the audio straight back: no prompt
  // that ran before the stop will play, and none after it has asked yet.
  const lower = (): Promise<void> => {
    ducking$ =
      ducking$ ??
      ducking
        .begin()
        .catch(() => false)
        .then((lowered) => {
          ducking$ = null;
          ducked = ducked || lowered;
          if (stopped) release();
        });
    return ducking$;
  };

  return {
    speak: (text) => {
      utterance += 1;
      stopped = false;
      const id = utterance;
      engine.stop();
      void (async () => {
        if (!ducked) await lower();
        // A newer prompt (or a stop) took over while the audio was being lowered.
        if (id !== utterance) return;
        engine.speak(text, () => {
          if (id === utterance) release();
        });
      })();
    },
    stop: () => {
      utterance += 1;
      stopped = true;
      engine.stop();
      release();
    },
  };
}
