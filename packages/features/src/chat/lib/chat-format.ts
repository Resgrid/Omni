import { parseUtcMs } from '@resgrid/core/utils/dates';
import { type ChatAttachmentResultData, type ChatChannelResultData, ChatChannelType, type ChatGifMetadata, type ChatMessageResultData, ChatParticipantType, type GifResultData } from '@resgrid/models';

export type ChatSection = 'direct' | 'channels' | 'incidents' | 'assistant';

const INCIDENT_TYPES = new Set<number>([ChatChannelType.Incident, ChatChannelType.IncidentLane, ChatChannelType.IncidentCommand, ChatChannelType.IncidentLeads, ChatChannelType.IncidentDispatch]);

/** Which list section a channel belongs to (Responder sections). 12 = IncidentCommanderLine, addressed like a DM. */
export const chatSectionOf = (channel: Pick<ChatChannelResultData, 'ChannelType'>): ChatSection => {
  if (channel.ChannelType === ChatChannelType.Chatbot) return 'assistant';
  if (channel.ChannelType === ChatChannelType.DirectMessage || channel.ChannelType === 12) return 'direct';
  if (INCIDENT_TYPES.has(channel.ChannelType)) return 'incidents';
  return 'channels';
};

/** The list's sections. The assistant is not one of them: it is pinned above them (`assistantChannelOf`). */
export type ChatListSection = Exclude<ChatSection, 'assistant'>;

export const CHAT_SECTION_ORDER: readonly ChatListSection[] = ['direct', 'channels', 'incidents'];

export const CHAT_SECTION_KEYS: Record<ChatListSection, string> = {
  direct: 'chat.section_direct_messages',
  channels: 'chat.section_channels',
  incidents: 'chat.section_incidents',
};

const lastActivity = (channel: ChatChannelResultData): number => parseUtcMs(channel.LastMessageOn) ?? parseUtcMs(channel.CreatedOn) ?? 0;

/**
 * The assistant's channel, when Core has created it (it does on the first visit to the assistant): the pinned assistant
 * entry takes its unread count and last activity from it.
 */
export const assistantChannelOf = (channels: readonly ChatChannelResultData[]): ChatChannelResultData | null => channels.find((channel) => !channel.IsArchived && chatSectionOf(channel) === 'assistant') ?? null;

/** Non-archived channels grouped into sections, most recent activity first; empty sections dropped; the assistant left out. */
export const groupChannels = (channels: readonly ChatChannelResultData[], query = ''): { section: ChatListSection; channels: ChatChannelResultData[] }[] => {
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

const readString = (value: unknown): string | undefined => (typeof value === 'string' && value.length > 0 ? value : undefined);
const readNumber = (value: unknown): number | undefined => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined);

/** True for an absolute https url — the only kind of remote image (GIF) chat renders. */
export const isHttpsUrl = (value: unknown): value is string => typeof value === 'string' && /^https:\/\/\S+$/i.test(value);
const readHttpsUrl = (value: unknown): string | undefined => (isHttpsUrl(value) ? value : undefined);

/**
 * MetadataJson of a GIF message. The wire contract (shared with the web client, validated by Core) is the nested camelCase
 * envelope `{ gif: { url, previewUrl, width, height } }`; older mobile builds wrote a flat PascalCase object, still read for
 * history. Only https urls are accepted — Core already limits them to known GIF CDNs; this is the render-side re-check.
 */
export const parseGifMetadata = (metadataJson?: string | null): ChatGifMetadata | null => {
  if (!metadataJson) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(metadataJson);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object') return null;
  const root = raw as Record<string, unknown>;
  const nested = root.gif ?? root.Gif;
  const source = nested && typeof nested === 'object' ? (nested as Record<string, unknown>) : root;
  const url = readHttpsUrl(source.url ?? source.Url ?? source.gifUrl ?? source.GifUrl);
  if (!url) return null;
  return {
    GifUrl: url,
    PreviewUrl: readHttpsUrl(source.previewUrl ?? source.PreviewUrl),
    Width: readNumber(source.width ?? source.Width),
    Height: readNumber(source.height ?? source.Height),
    Title: readString(source.title ?? source.Title),
  };
};

/** MetadataJson for sending a picked GIF (nested wire form only). */
export const buildGifMetadata = (gif: Pick<GifResultData, 'GifUrl' | 'PreviewUrl' | 'Width' | 'Height'>): string =>
  JSON.stringify({ gif: { url: gif.GifUrl, previewUrl: gif.PreviewUrl, width: gif.Width, height: gif.Height } });

/** The picture of an image message: its first image attachment (a missing content type counts as an image). */
export const imageAttachmentOf = (message: Pick<ChatMessageResultData, 'Attachments'>): ChatAttachmentResultData | undefined =>
  (message.Attachments ?? []).find((attachment) => !!attachment.ChatAttachmentId && (!attachment.ContentType || attachment.ContentType.toLowerCase().startsWith('image/')));
