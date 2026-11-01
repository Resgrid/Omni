import { useRealtimeStore } from '@resgrid/realtime';
import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';

/**
 * Marks the conversation the user is looking at (`SetActiveChannel`) while its screen has focus and clears it on blur:
 * Core suppresses chat push only for a recipient with that channel active. The realtime store replays it after every
 * chat hub reconnect.
 */
export const useActiveChatChannel = (channelId: string | null, asUnitId: number | null, enabled = true): void => {
  useFocusEffect(
    useCallback(() => {
      if (!enabled || !channelId) return undefined;
      void useRealtimeStore.getState().setActiveChatChannel(channelId, asUnitId);
      return () => {
        const active = useRealtimeStore.getState().activeChatChannel;
        // Only clear our own marker: a newer conversation may already have claimed it.
        if (!active || active.channelId === channelId) void useRealtimeStore.getState().setActiveChatChannel(null);
      };
    }, [asUnitId, channelId, enabled])
  );
};
