import { logger } from '@resgrid/core';
import { type RemoteTrack, type RemoteTrackPublication, type Room, RoomEvent, Track } from 'livekit-client';

/**
 * Browsers only play remote LiveKit audio once the track is attached to an <audio> element in the DOM (Dispatch
 * livekit-store). Returns the detach function: it removes every element this room attached, and must run before the
 * room's listeners are stripped, or the elements would stay in the document forever.
 */
export function attachRemoteAudio(room: Room): () => void {
  const elements = new Map<string, HTMLMediaElement>();

  const onSubscribed = (track: RemoteTrack, publication: RemoteTrackPublication): void => {
    if (track.kind !== Track.Kind.Audio || typeof document === 'undefined') return;
    try {
      const sid = track.sid || publication.trackSid;
      const element = track.attach();
      element.id = `livekit-audio-${sid}`;
      document.body.appendChild(element);
      elements.set(sid, element);
    } catch (error) {
      logger.error({ message: 'Failed to attach remote audio track', context: { error } });
    }
  };

  const onUnsubscribed = (track: RemoteTrack, publication: RemoteTrackPublication): void => {
    if (track.kind !== Track.Kind.Audio) return;
    try {
      track.detach().forEach((element) => element.remove());
      elements.delete(track.sid || publication.trackSid);
    } catch (error) {
      logger.warn({ message: 'Failed to detach remote audio track', context: { error } });
    }
  };

  room.on(RoomEvent.TrackSubscribed, onSubscribed);
  room.on(RoomEvent.TrackUnsubscribed, onUnsubscribed);

  return () => {
    room.off(RoomEvent.TrackSubscribed, onSubscribed);
    room.off(RoomEvent.TrackUnsubscribed, onUnsubscribed);
    elements.forEach((element) => {
      try {
        element.pause();
        element.remove();
      } catch {
        // Already gone.
      }
    });
    elements.clear();
  };
}
