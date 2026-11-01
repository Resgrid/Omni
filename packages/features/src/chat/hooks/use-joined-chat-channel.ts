import { getHubName, signalRService, useRealtimeEvent } from '@resgrid/realtime';
import { useEffect } from 'react';

/** Chat hub method that adds this connection to a channel's group (Core `ChatHub.JoinChannel(channelId, asUnitId)`). */
export const JOIN_CHAT_CHANNEL_METHOD = 'JoinChannel';

/**
 * Joins a channel's chat hub group. Resolves false when the hub is not connected or the server refused (no access).
 * SignalR binds arguments positionally and rejects a call with fewer than the server signature, so `asUnitId` is
 * always sent (null for the user).
 */
export const joinChatChannel = async (channelId: string, asUnitId: number | null): Promise<boolean> => {
  try {
    await signalRService.invoke(getHubName('chat'), JOIN_CHAT_CHANNEL_METHOD, channelId, asUnitId);
    return true;
  } catch {
    return false;
  }
};

/**
 * Keeps this connection in a channel's chat hub group while the screen is mounted. Core fans `chatMessageReceived`
 * (assistant replies included) out to channel groups only, and `@resgrid/realtime` does not join them yet. Joins on
 * mount and again after every chat hub (re)join, since group membership dies with the connection; a join that fails
 * because the hub is still connecting is retried by that `chatHubJoined`.
 */
export const useJoinedChatChannel = (channelId: string | null, asUnitId: number | null, enabled = true): void => {
  const active = enabled && !!channelId;

  useEffect(() => {
    if (active && channelId) void joinChatChannel(channelId, asUnitId);
  }, [active, asUnitId, channelId]);

  useRealtimeEvent(
    'chatHubJoined',
    () => {
      if (channelId) void joinChatChannel(channelId, asUnitId);
    },
    active
  );
};
