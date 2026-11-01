import { logger } from '@resgrid/core';

import { getVoiceRuntime, type VoiceSoundName, type VoiceSoundSource } from '../runtime';

/**
 * PTT and room sounds on web/Electron (Dispatch audio.service.web). Plain HTMLAudioElements: on web the bundler turns
 * `require('…mp3')` into a URL (or `{ uri }`), which is all an <audio> element needs.
 */
const urlOf = (source: VoiceSoundSource | undefined): string | null => {
  if (typeof source === 'string') return source;
  if (source && typeof source === 'object' && typeof source.uri === 'string') return source.uri;
  return null;
};

const elements = new Map<VoiceSoundName, HTMLAudioElement>();

const elementFor = (name: VoiceSoundName): HTMLAudioElement | null => {
  const existing = elements.get(name);
  if (existing) return existing;
  if (typeof Audio === 'undefined') return null;
  const url = urlOf(getVoiceRuntime().sounds[name]);
  if (!url) return null;
  const element = new Audio(url);
  element.preload = 'auto';
  elements.set(name, element);
  return element;
};

export const voiceSounds = {
  initialize: (): void => {
    for (const name of ['startTransmitting', 'stopTransmitting', 'connectedDevice', 'connectedToAudioRoom', 'disconnectedFromAudioRoom'] as const) elementFor(name);
  },
  play: async (name: VoiceSoundName): Promise<void> => {
    const element = elementFor(name);
    if (!element) return;
    try {
      element.currentTime = 0;
      await element.play();
    } catch (error) {
      // Autoplay policy rejects playback before the first user gesture; a missing chime is harmless.
      logger.debug({ message: 'Voice sound blocked or failed on web', context: { name, error } });
    }
  },
  cleanup: (): void => {
    for (const element of elements.values()) element.pause();
    elements.clear();
  },
};

export type { VoiceSoundName, VoiceSoundSource };
