import { logger } from '@resgrid/core';
import { setAudioModeAsync } from 'expo-audio';
import { NativeModules, Platform } from 'react-native';

import type { AudioRouteTarget } from './audio-route';

/**
 * Native audio session and routing (iOS/Android). `@livekit/react-native` is required lazily: BigBoard has no LiveKit
 * native module, and importing it there would throw at startup.
 */
interface LiveKitAudioSession {
  startAudioSession: () => Promise<void>;
  stopAudioSession: () => Promise<void>;
}

interface InCallAudioModuleLike {
  setAudioRoute?: (route: 'bluetooth' | 'speaker' | 'earpiece') => Promise<void>;
}

const liveKitAudioSession = (): LiveKitAudioSession | null => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const livekit = require('@livekit/react-native') as { AudioSession?: LiveKitAudioSession };
    return livekit.AudioSession ?? null;
  } catch {
    return null;
  }
};

/** Registers LiveKit's WebRTC globals for livekit-client (native only; call once before the first room is created). */
export function registerLiveKitGlobals(): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const livekit = require('@livekit/react-native') as { registerGlobals?: () => void };
    livekit.registerGlobals?.();
  } catch (error) {
    logger.warn({ message: 'LiveKit globals could not be registered', context: { error } });
  }
}

/** Start the native audio session before connecting: production cold starts need it for WebRTC (Unit). */
export async function startAudioSession(): Promise<void> {
  await liveKitAudioSession()?.startAudioSession();
}

export async function stopAudioSession(): Promise<void> {
  await liveKitAudioSession()?.stopAudioSession();
}

/**
 * Route call audio (Unit `applyAudioRouting`). Android: InCallAudioModule picks the route (communication device API),
 * then expo-audio sets a call-compatible mode. iOS: only the earpiece target drops `defaultToSpeaker`, so PTT chimes
 * and room audio never get stuck on the receiver while a Bluetooth headset or the speaker is expected.
 */
export async function applyAudioRouting(target: AudioRouteTarget): Promise<void> {
  const route: 'bluetooth' | 'speaker' | 'earpiece' = target === 'default' ? 'earpiece' : target;
  try {
    if (Platform.OS === 'android') {
      const module = (NativeModules as { InCallAudioModule?: InCallAudioModuleLike }).InCallAudioModule;
      if (module?.setAudioRoute) {
        try {
          await module.setAudioRoute(route);
        } catch (error) {
          logger.warn({ message: 'InCallAudioModule route failed; falling back to audio mode', context: { route, error } });
        }
      }
      await setAudioModeAsync({ allowsRecording: true, shouldPlayInBackground: true, playsInSilentMode: true, interruptionMode: 'mixWithOthers', shouldRouteThroughEarpiece: route !== 'speaker' });
      return;
    }
    await setAudioModeAsync({ allowsRecording: true, shouldPlayInBackground: true, playsInSilentMode: true, interruptionMode: 'mixWithOthers', shouldRouteThroughEarpiece: route === 'earpiece' });
  } catch (error) {
    logger.error({ message: 'Failed to apply audio routing', context: { route, error } });
  }
}

/** Drop back to a playback-only session after a call so iOS stops holding the microphone (Responder). */
export async function releaseRecordingSession(): Promise<void> {
  try {
    await setAudioModeAsync({ allowsRecording: false, shouldPlayInBackground: true, playsInSilentMode: true, interruptionMode: 'mixWithOthers', shouldRouteThroughEarpiece: false });
  } catch (error) {
    logger.warn({ message: 'Failed to release recording audio session', context: { error } });
  }
}
