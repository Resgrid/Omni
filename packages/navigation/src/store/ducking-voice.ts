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
  let ducking$: Promise<boolean> | null = null;

  const release = (): void => {
    if (!ducked) return;
    ducked = false;
    void ducking.end().catch(() => false);
  };

  return {
    speak: (text) => {
      utterance += 1;
      const id = utterance;
      engine.stop();
      void (async () => {
        if (!ducked) {
          ducking$ = ducking$ ?? ducking.begin().catch(() => false);
          const lowered = await ducking$;
          ducking$ = null;
          ducked = ducked || lowered;
        }
        // A newer prompt (or a stop) took over while the audio was being lowered.
        if (id !== utterance) return;
        engine.speak(text, () => {
          if (id === utterance) release();
        });
      })();
    },
    stop: () => {
      utterance += 1;
      engine.stop();
      release();
    },
  };
}
