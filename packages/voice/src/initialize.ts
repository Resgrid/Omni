import { logger } from '@resgrid/core';
import type { ResetRegistry } from '@resgrid/offline';
import { Platform } from 'react-native';

import { registerLiveKitGlobals } from './audio/audio-session';
import { voiceSounds } from './audio/voice-sounds';
import { useAudioStreamStore } from './audio-streams/audio-stream-store';
import { useBluetoothAudioStore } from './bluetooth/bluetooth-audio-store';
import { getBluetoothAudioService } from './bluetooth/bluetooth-service';
import { getCallKeepService } from './callkeep/callkeep-service';
import type { CallKeepSetupConfig } from './callkeep/types';
import { getVoiceCapabilities } from './capabilities';
import { useLiveKitStore } from './livekit/livekit-store';
import { VOICE_PRESERVED_KEYS } from './runtime';

export interface InitializeVoiceOptions {
  /** CallKeep setup (R/U/I); ignored where the variant has no CallKeep. Text must already be translated. */
  callKeep?: CallKeepSetupConfig;
  /** Start Bluetooth PTT (permissions, preferred-device reconnect). Default true; Unit/Responder start it after sign-in. */
  bluetooth?: boolean;
}

let globalsRegistered = false;

/**
 * Startup for the voice stack, after `configureVoice()`. Native: registers LiveKit's WebRTC globals once (before any
 * room exists), preloads PTT sounds, sets up CallKeep and starts Bluetooth PTT. Every step is capability-gated and a
 * failure is logged, never thrown (voice must not block app startup).
 */
export async function initializeVoice(options: InitializeVoiceOptions = {}): Promise<void> {
  const capabilities = getVoiceCapabilities();
  if (!capabilities.ptt) return;
  if (!globalsRegistered && Platform.OS !== 'web') {
    registerLiveKitGlobals();
    globalsRegistered = true;
  }
  try {
    voiceSounds.initialize();
  } catch (error) {
    logger.warn({ message: 'Voice sounds failed to load', context: { error } });
  }
  if (capabilities.callKeep && options.callKeep) {
    try {
      await getCallKeepService().setup(options.callKeep);
    } catch (error) {
      logger.error({ message: 'CallKeep setup failed; background voice may stop when the app is backgrounded', context: { error } });
    }
  }
  if (options.bluetooth !== false) {
    await getBluetoothAudioService()
      ?.initialize()
      .catch((error: unknown) => logger.error({ message: 'Bluetooth PTT failed to start', context: { error } }));
  }
}

/**
 * Hooks voice into the offline wipe: the LiveKit room and scanner stream are torn down first (teardowns), department
 * voice settings and stream lists are reset, and the preferred Bluetooth device survives as a device preference.
 */
export function registerVoiceResets(registry: Pick<ResetRegistry, 'registerTeardown' | 'registerStoreReset' | 'registerPreservedKeys'>): () => void {
  const unregister = [
    registry.registerTeardown('voice-livekit', () => useLiveKitStore.getState().reset()),
    registry.registerTeardown('voice-audio-streams', () => useAudioStreamStore.getState().reset()),
    registry.registerStoreReset('voice-bluetooth-devices', () => {
      // Keep the preferred device and audio selection (device preferences); drop the scan list.
      useBluetoothAudioStore.getState().clearDevices();
      useBluetoothAudioStore.getState().clearConnectionError();
    }),
  ];
  registry.registerPreservedKeys(VOICE_PRESERVED_KEYS);
  return () => unregister.forEach((fn) => fn());
}
