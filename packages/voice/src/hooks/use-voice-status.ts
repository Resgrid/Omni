import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { useBluetoothAudioStore } from '../bluetooth/bluetooth-audio-store';
import { getVoiceCapabilities, type VoiceCapabilities } from '../capabilities';
import { useLiveKitStore } from '../livekit/livekit-store';
import type { VoiceError } from '../livekit/types';

export type VoiceConnectionStatus = 'unavailable' | 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'transmitting';

export interface VoiceStatus {
  status: VoiceConnectionStatus;
  capabilities: VoiceCapabilities;
  channelName: string | null;
  /** Someone (local or remote) is speaking. */
  isSomeoneTalking: boolean;
  isLocalTalking: boolean;
  activeSpeakerIdentities: string[];
  bluetoothDeviceName: string | null;
  error: VoiceError | null;
}

export const deriveVoiceStatus = (input: { pttCapable: boolean; isVoiceEnabled: boolean; isConnecting: boolean; isConnected: boolean; isReconnecting: boolean; isMicrophoneEnabled: boolean }): VoiceConnectionStatus => {
  if (!input.pttCapable) return 'unavailable';
  if (input.isConnecting) return 'connecting';
  if (input.isConnected && input.isReconnecting) return 'reconnecting';
  if (input.isConnected && input.isMicrophoneEnabled) return 'transmitting';
  if (input.isConnected) return 'connected';
  return input.isVoiceEnabled ? 'idle' : 'unavailable';
};

/** One status for headers, badges and the PTT bar. */
export function useVoiceStatus(): VoiceStatus {
  const live = useLiveKitStore(
    useShallow((s) => ({
      isVoiceEnabled: s.isVoiceEnabled,
      isConnecting: s.isConnecting,
      isConnected: s.isConnected,
      isReconnecting: s.isReconnecting,
      isMicrophoneEnabled: s.isMicrophoneEnabled,
      isTalking: s.isTalking,
      activeSpeakerIdentities: s.activeSpeakerIdentities,
      channelName: s.currentRoomInfo?.Name ?? null,
      error: s.lastError,
    }))
  );
  const bluetoothDeviceName = useBluetoothAudioStore((s) => s.connectedDevice?.name ?? null);
  const capabilities = useMemo(() => getVoiceCapabilities(), []);

  return {
    status: deriveVoiceStatus({ ...live, pttCapable: capabilities.ptt }),
    capabilities,
    channelName: live.channelName,
    isSomeoneTalking: live.activeSpeakerIdentities.length > 0,
    isLocalTalking: live.isTalking,
    activeSpeakerIdentities: live.activeSpeakerIdentities,
    bluetoothDeviceName,
    error: live.error,
  };
}
