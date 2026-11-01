import { useCallback, useEffect, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { getVoiceCapabilities } from '../capabilities';
import { selectSelectedRoom, useLiveKitStore, type VoiceChannel } from '../livekit/livekit-store';
import type { VoiceError, VoiceResult } from '../livekit/types';

export interface UseVoiceChannelsOptions {
  /** Fetch department voice settings on mount when they have not been loaded yet. Default true. */
  autoFetch?: boolean;
}

export interface UseVoiceChannelsResult {
  channels: VoiceChannel[];
  selectedChannel: VoiceChannel | null;
  defaultChannel: VoiceChannel | null;
  /** The department has voice and this app variant offers PTT. */
  isVoiceEnabled: boolean;
  isLoading: boolean;
  error: VoiceError | null;
  refresh: () => Promise<VoiceResult>;
  selectChannel: (channel: VoiceChannel | null) => void;
}

/** Department PTT channels from `GET /Voice/GetDepartmentVoiceSettings` and the selected one. */
export function useVoiceChannels(options: UseVoiceChannelsOptions = {}): UseVoiceChannelsResult {
  const { autoFetch = true } = options;
  const { channels, selectedRoomId, isVoiceEnabled, isLoading, settingsLoaded, error, fetchVoiceSettings, selectRoom } = useLiveKitStore(
    useShallow((s) => ({
      channels: s.availableRooms,
      selectedRoomId: s.selectedRoomId,
      isVoiceEnabled: s.isVoiceEnabled,
      isLoading: s.isLoadingSettings,
      settingsLoaded: s.settingsLoaded,
      error: s.settingsError,
      fetchVoiceSettings: s.fetchVoiceSettings,
      selectRoom: s.selectRoom,
    }))
  );
  const pttCapable = getVoiceCapabilities().ptt;

  useEffect(() => {
    if (autoFetch && pttCapable && !settingsLoaded && !isLoading) void fetchVoiceSettings();
    // Only on mount / when the capability or loaded flag changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFetch, pttCapable, settingsLoaded]);

  const selectedChannel = useMemo(() => selectSelectedRoom({ availableRooms: channels, selectedRoomId }), [channels, selectedRoomId]);
  const defaultChannel = useMemo(() => channels.find((channel) => channel.IsDefault) ?? channels[0] ?? null, [channels]);
  const refresh = useCallback(() => fetchVoiceSettings({ forceRefresh: true }), [fetchVoiceSettings]);

  return { channels, selectedChannel, defaultChannel, isVoiceEnabled: pttCapable && isVoiceEnabled, isLoading, error, refresh, selectChannel: selectRoom };
}
