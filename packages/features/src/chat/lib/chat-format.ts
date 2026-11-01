import { parseUtcMs } from '@resgrid/core/utils/dates';
import { type ChatChannelResultData, ChatChannelType, type ChatMessageResultData, ChatParticipantType } from '@resgrid/models';

export type ChatSection = 'direct' | 'channels' | 'incidents' | 'assistant';

const INCIDENT_TYPES = new Set<number>([ChatChannelType.Incident, ChatChannelType.IncidentLane, ChatChannelType.IncidentCommand, ChatChannelType.IncidentLeads, ChatChannelType.IncidentDispatch]);

/** Which list section a channel belongs to (Responder sections). 12 = IncidentCommanderLine, addressed like a DM. */
export const chatSectionOf = (channel: Pick<ChatChannelResultData, 'ChannelType'>): ChatSection => {
  if (channel.ChannelType === ChatChannelType.Chatbot) return 'assistant';
  if (channel.ChannelType === ChatChannelType.DirectMessage || channel.ChannelType === 12) return 'direct';
  if (INCIDENT_TYPES.has(channel.ChannelType)) return 'incidents';
  return 'channels';
};

export const CHAT_SECTION_ORDER: readonly ChatSection[] = ['direct', 'channels', 'incidents', 'assistant'];

export const CHAT_SECTION_KEYS: Record<ChatSection, string> = {
  direct: 'chat.section_direct_messages',
  channels: 'chat.section_channels',
  incidents: 'chat.section_incidents',
  assistant: 'chat.section_assistant',
};

const lastActivity = (channel: ChatChannelResultData): number => parseUtcMs(channel.LastMessageOn) ?? parseUtcMs(channel.CreatedOn) ?? 0;

/** Non-archived channels grouped into sections, most recent activity first; empty sections dropped. */
export const groupChannels = (channels: readonly ChatChannelResultData[], query = ''): { section: ChatSection; channels: ChatChannelResultData[] }[] => {
  const needle = query.trim().toLowerCase();
  const visible = channels.filter((channel) => !channel.IsArchived && (!needle || (channel.Name ?? '').toLowerCase().includes(needle) || (channel.Topic ?? '').toLowerCase().includes(needle)));
  return CHAT_SECTION_ORDER.map((section) => ({ section, channels: visible.filter((channel) => chatSectionOf(channel) === section).sort((a, b) => lastActivity(b) - lastActivity(a)) })).filter(
    (group) => group.channels.length > 0
  );
};

/** True for a message this device's identity sent (the user, or the unit when chatting as a unit). */
export const isOwnMessage = (message: Pick<ChatMessageResultData, 'SenderParticipantType' | 'SenderUserId' | 'SenderUnitId'>, userId: string | null, asUnitId: number | null | undefined): boolean => {
  if (asUnitId != null && message.SenderParticipantType === ChatParticipantType.Unit) return message.SenderUnitId === asUnitId;
  return message.SenderParticipantType !== ChatParticipantType.Unit && !!userId && message.SenderUserId === userId;
};

/** Oldest first; the conversation renders newest at the bottom. */
export const orderMessages = (messages: readonly ChatMessageResultData[]): ChatMessageResultData[] => [...messages].sort((a, b) => a.MessageSeq - b.MessageSeq);
