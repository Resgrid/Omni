import { useChatStore } from '@resgrid/data';
import { chatRoutes, startDirectConversation, useChatAvailability } from '@resgrid/features/chat';
import { useTranslation } from '@resgrid/i18n';
import { ChatChannelType } from '@resgrid/models';
import { useToast } from '@resgrid/ui';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo } from 'react';

export interface IncidentChatLinks {
  isAvailable: boolean;
  incidentChannelId: string | null;
  commandChannelId: string | null;
  leadsChannelId: string | null;
  dispatchChannelId: string | null;
  laneChannelId: (nodeId: string) => string | null;
  openChannel: (channelId: string | null) => void;
  messagePerson: (userId: string | null | undefined) => Promise<void>;
}

/**
 * Incident chat for a board (IC/Dispatch): the incident's channels (archived ones included, so a closed incident stays
 * readable) and 1:1 messages. The server only lists channels this member may open; a missing id means "not for you".
 * Off when the variant has no chat hub or the department has no `Chat.System`.
 */
export function useIncidentChat(callId: string | null | undefined): IncidentChatLinks {
  const { t } = useTranslation();
  const toast = useToast();
  const isAvailable = useChatAvailability() === 'enabled';
  const channels = useChatStore((state) => (callId ? state.incidentChannelsByCallId[callId] : undefined));

  useEffect(() => {
    if (isAvailable && callId) void useChatStore.getState().loadIncidentChannels(callId);
  }, [callId, isAvailable]);

  const byType = useCallback((type: ChatChannelType) => channels?.find((channel) => channel.ChannelType === type)?.ChatChannelId ?? null, [channels]);

  const laneChannelId = useCallback((nodeId: string) => channels?.find((channel) => channel.ChannelType === ChatChannelType.IncidentLane && channel.CommandStructureNodeId === nodeId)?.ChatChannelId ?? null, [channels]);

  const openChannel = useCallback(
    (channelId: string | null) => {
      if (!channelId) {
        toast.info(t('incident_command.chat_unavailable'));
        return;
      }
      router.push(chatRoutes.conversation(channelId) as never);
    },
    [t, toast]
  );

  const messagePerson = useCallback(
    async (userId: string | null | undefined) => {
      if (!userId) return;
      try {
        const channel = await startDirectConversation(userId);
        if (channel?.ChatChannelId) router.push(chatRoutes.conversation(channel.ChatChannelId) as never);
        else toast.error(t('incident_command.dm_unavailable'));
      } catch {
        toast.error(t('incident_command.dm_failed'));
      }
    },
    [t, toast]
  );

  return useMemo(
    () => ({
      isAvailable,
      incidentChannelId: byType(ChatChannelType.Incident),
      commandChannelId: byType(ChatChannelType.IncidentCommand),
      leadsChannelId: byType(ChatChannelType.IncidentLeads),
      dispatchChannelId: byType(ChatChannelType.IncidentDispatch),
      laneChannelId,
      openChannel,
      messagePerson,
    }),
    [byType, isAvailable, laneChannelId, messagePerson, openChannel]
  );
}
