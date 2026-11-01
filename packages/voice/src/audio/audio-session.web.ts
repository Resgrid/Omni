import type { AudioRouteTarget } from './audio-route';

/** Browsers and Electron own the audio session and output device; these are deliberate no-ops (Dispatch web). */
export function registerLiveKitGlobals(): void {
  // livekit-client uses the browser's WebRTC directly.
}

export async function startAudioSession(): Promise<void> {
  // Nothing to start on web.
}

export async function stopAudioSession(): Promise<void> {
  // Nothing to stop on web.
}

export async function applyAudioRouting(_target: AudioRouteTarget): Promise<void> {
  // Output selection is the browser's (or the OS default device in Electron).
}

export async function releaseRecordingSession(): Promise<void> {
  // The browser releases the microphone when LiveKit unpublishes the track.
}
