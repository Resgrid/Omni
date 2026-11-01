import type { Room } from 'livekit-client';

/** Native WebRTC plays subscribed remote audio by itself; nothing to attach. Returns the detach function. */
export function attachRemoteAudio(_room: Room): () => void {
  return () => undefined;
}
