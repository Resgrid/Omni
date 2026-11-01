import { useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { selectSelectedRoom, useLiveKitStore, type VoiceChannel } from '../livekit/livekit-store';
import { type VoiceError, voiceFail, type VoiceResult } from '../livekit/types';
import type { PttInputSource } from '../ptt/microphone-controller';

export interface UsePttResult {
  isConnected: boolean;
  isConnecting: boolean;
  isReconnecting: boolean;
  /** The local microphone is open. */
  isTransmitting: boolean;
  canTransmit: boolean;
  currentChannel: VoiceChannel | null;
  error: VoiceError | null;
  /** Join `channel`, or the selected/default channel. Switching from another channel is handled by the store. */
  connect: (channel?: VoiceChannel) => Promise<VoiceResult>;
  disconnect: () => Promise<void>;
  /** Press-and-hold: call on press in… */
  startTransmitting: () => Promise<void>;
  /** …and on press out (also on cancel/blur). */
  stopTransmitting: () => Promise<void>;
  /** Tap-to-toggle (Dispatch console button). */
  toggleTransmitting: () => Promise<void>;
  reconnect: () => Promise<VoiceResult>;
  clearError: () => void;
}

/** Push-to-talk controls for UI (Dispatch use-ptt, reduced to a view over the LiveKit store). */
export function usePtt(source: PttInputSource = 'ui'): UsePttResult {
  const state = useLiveKitStore(
    useShallow((s) => ({
      isConnected: s.isConnected,
      isConnecting: s.isConnecting,
      isReconnecting: s.isReconnecting,
      isTransmitting: s.isMicrophoneEnabled,
      currentRoomInfo: s.currentRoomInfo,
      availableRooms: s.availableRooms,
      selectedRoomId: s.selectedRoomId,
      error: s.lastError,
      connectToRoom: s.connectToRoom,
      disconnectFromRoom: s.disconnectFromRoom,
      setMicrophoneEnabled: s.setMicrophoneEnabled,
      toggleMicrophone: s.toggleMicrophone,
      reconnect: s.reconnect,
      clearError: s.clearError,
    }))
  );
  const { availableRooms, selectedRoomId, connectToRoom, setMicrophoneEnabled, toggleMicrophone } = state;

  const connect = useCallback(
    async (channel?: VoiceChannel): Promise<VoiceResult> => {
      const target = channel ?? selectSelectedRoom({ availableRooms, selectedRoomId });
      if (!target) return voiceFail({ code: 'no_channel' });
      return connectToRoom(target);
    },
    [availableRooms, selectedRoomId, connectToRoom]
  );
  const startTransmitting = useCallback(() => setMicrophoneEnabled(true, source), [setMicrophoneEnabled, source]);
  const stopTransmitting = useCallback(() => setMicrophoneEnabled(false, source), [setMicrophoneEnabled, source]);
  const toggleTransmitting = useCallback(() => toggleMicrophone(source), [toggleMicrophone, source]);

  return {
    isConnected: state.isConnected,
    isConnecting: state.isConnecting,
    isReconnecting: state.isReconnecting,
    isTransmitting: state.isTransmitting,
    canTransmit: state.isConnected && !state.isReconnecting,
    currentChannel: state.currentRoomInfo,
    error: state.error,
    connect,
    disconnect: state.disconnectFromRoom,
    startTransmitting,
    stopTransmitting,
    toggleTransmitting,
    reconnect: state.reconnect,
    clearError: state.clearError,
  };
}
