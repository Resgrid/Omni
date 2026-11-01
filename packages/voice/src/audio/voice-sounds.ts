import { logger } from '@resgrid/core';
import { type AudioPlayer, createAudioPlayer } from 'expo-audio';
import { NativeModules, Platform } from 'react-native';

import { getVoiceRuntime, type VoiceSoundName, type VoiceSoundSource } from '../runtime';

/**
 * PTT and room sounds (Unit/Responder audio.service). Android plays them through InCallAudioModule's SoundPool, which
 * uses the in-call stream and is not ducked by the WebRTC call; iOS uses expo-audio players created from the assets the
 * app passes to `configureVoice({ sounds })`.
 */
interface InCallAudioModuleLike {
  initializeAudio?: () => void;
  loadSound?: (name: string, resourceName: string) => void;
  playSound?: (name: string) => void;
  cleanup?: () => void;
}

/** Android raw resource names bundled by withInCallAudioModule (must match the plugin). */
export const ANDROID_SOUND_RESOURCES: Record<VoiceSoundName, string> = {
  startTransmitting: 'space_notification1',
  stopTransmitting: 'space_notification2',
  connectedDevice: 'positive_interface_beep',
  connectedToAudioRoom: 'software_interface_start',
  disconnectedFromAudioRoom: 'software_interface_back',
};

const SOUND_NAMES = Object.keys(ANDROID_SOUND_RESOURCES) as VoiceSoundName[];

const inCallAudio = (): InCallAudioModuleLike | null => (NativeModules as { InCallAudioModule?: InCallAudioModuleLike }).InCallAudioModule ?? null;

class NativeVoiceSounds {
  private players = new Map<VoiceSoundName, AudioPlayer>();
  private nativeLoaded = false;
  private initialized = false;

  initialize(): void {
    if (this.initialized) return;
    this.initialized = true;
    if (Platform.OS === 'android') {
      const module = inCallAudio();
      if (module?.loadSound) {
        try {
          module.initializeAudio?.();
          for (const name of SOUND_NAMES) module.loadSound(name, ANDROID_SOUND_RESOURCES[name]);
          this.nativeLoaded = true;
          return;
        } catch (error) {
          logger.warn({ message: 'InCallAudioModule sound preload failed', context: { error } });
        }
      }
    }
    const { sounds } = getVoiceRuntime();
    for (const name of SOUND_NAMES) {
      const source = sounds[name];
      if (source === undefined) continue;
      try {
        const player = createAudioPlayer(source as Parameters<typeof createAudioPlayer>[0], { keepAudioSessionActive: true });
        player.loop = false;
        player.volume = 1;
        this.players.set(name, player);
      } catch (error) {
        logger.warn({ message: 'Failed to load voice sound', context: { name, error } });
      }
    }
  }

  async play(name: VoiceSoundName): Promise<void> {
    this.initialize();
    if (this.nativeLoaded) {
      try {
        inCallAudio()?.playSound?.(name);
      } catch (error) {
        logger.warn({ message: 'InCallAudioModule playSound failed', context: { name, error } });
      }
      return;
    }
    const player = this.players.get(name);
    if (!player) return;
    try {
      if (player.isLoaded) await player.seekTo(0);
      player.play();
    } catch (error) {
      logger.warn({ message: 'Failed to play voice sound', context: { name, error } });
    }
  }

  cleanup(): void {
    for (const player of this.players.values()) {
      try {
        player.remove();
      } catch {
        // Already released.
      }
    }
    this.players.clear();
    if (this.nativeLoaded) inCallAudio()?.cleanup?.();
    this.nativeLoaded = false;
    this.initialized = false;
  }
}

const sounds = new NativeVoiceSounds();

export const voiceSounds = {
  initialize: (): void => sounds.initialize(),
  play: (name: VoiceSoundName): Promise<void> => sounds.play(name),
  cleanup: (): void => sounds.cleanup(),
};

export type { VoiceSoundName, VoiceSoundSource };
