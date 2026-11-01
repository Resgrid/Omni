import type {
  AddMembersInput,
  AddReactionInput,
  AskIncidentAssistantInput,
  ChatAckResultData,
  ChatActionResult,
  ChatAttachmentUploadedResult,
  ChatbotChannelResponse,
  ChatbotChatMessageRequest,
  ChatbotSendResponse,
  ChatbotSessionResponse,
  ChatChannelResultData,
  ChatMemberResultData,
  ChatMessageResultData,
  ChatV4Response,
  CreateAdHocChannelInput,
  CreateDirectMessageInput,
  EditMessageInput,
  FlagMessageInput,
  GetChatPresenceResult,
  GifResultData,
  IncidentAssistantAnswerResponse,
  IncidentAssistantSuggestionsResponse,
  MarkReadInput,
  SendChatMessageInput,
  SetNotificationPreferenceInput,
  UpdateChannelInput,
} from '@resgrid/models';

import { type ApiContext, defineEndpoints, request, type RequestOptions } from '../../core';

/** Core v4 endpoints for chat (Chat, Chatbot, ChatModeration). The contract test checks every entry against Swagger. */
export const chatEndpoints = defineEndpoints('chat', {
  ackChatMessage: { method: 'POST', path: '/Chat/Ack', query: ['messageId'] },
  addChatMembers: { method: 'POST', path: '/Chat/AddMembers', query: ['channelId'], body: 'json' },
  addChatReaction: { method: 'POST', path: '/Chat/AddReaction', query: ['messageId'], body: 'json' },
  archiveChatChannel: { method: 'DELETE', path: '/Chat/ArchiveChannel', query: ['channelId'] },
  askIncidentAssistant: { method: 'POST', path: '/Chatbot/AskIncident', body: 'json' },
  createAdHocChatChannel: { method: 'POST', path: '/Chat/CreateAdHocChannel', body: 'json' },
  createDirectMessageChannel: { method: 'POST', path: '/Chat/CreateDirectMessage', body: 'json' },
  deleteChatMessage: { method: 'DELETE', path: '/Chat/DeleteMessage', query: ['messageId'] },
  editChatMessage: { method: 'PUT', path: '/Chat/EditMessage', query: ['messageId'], body: 'json' },
  flagChatMessage: { method: 'POST', path: '/Chat/FlagMessage', query: ['messageId'], body: 'json' },
  getChatAttachment: { method: 'GET', path: '/Chat/GetAttachment', query: ['attachmentId'], responseType: 'arraybuffer' },
  getChatAttachmentThumbnail: { method: 'GET', path: '/Chat/GetAttachmentThumbnail', query: ['attachmentId'], responseType: 'arraybuffer' },
  getChatbotChannel: { method: 'GET', path: '/Chatbot/GetChatChannel' },
  getChatChannel: { method: 'GET', path: '/Chat/GetChannel', query: ['channelId'] },
  getChatChannels: { method: 'GET', path: '/Chat/GetChannels', query: ['activeUnitId', 'includeArchived', 'callId'] },
  getChatMembers: { method: 'GET', path: '/Chat/GetMembers', query: ['channelId'] },
  getChatMessages: { method: 'GET', path: '/Chat/GetMessages', query: ['channelId', 'beforeSeq', 'limit'] },
  getChatMessagesAfter: { method: 'GET', path: '/Chat/GetMessagesAfter', query: ['channelId', 'afterSeq', 'limit'] },
  getChatPins: { method: 'GET', path: '/Chat/GetPins', query: ['channelId'] },
  getChatPresence: { method: 'GET', path: '/Chat/GetPresence', query: ['userIds'] },
  getChatThread: { method: 'GET', path: '/Chat/GetThread', query: ['messageId', 'beforeSeq', 'limit'] },
  getIncidentAssistantSuggestions: { method: 'GET', path: '/Chatbot/IncidentSuggestions', query: ['callId'] },
  getMyPendingChatAcks: { method: 'GET', path: '/Chat/GetMyPendingAcks' },
  markChatRead: { method: 'PUT', path: '/Chat/MarkRead', query: ['channelId'], body: 'json' },
  moderatorDeleteChatMessage: { method: 'DELETE', path: '/ChatModeration/DeleteMessage', query: ['messageId', 'reason'] },
  newChatbotSession: { method: 'POST', path: '/Chatbot/NewChatSession' },
  pinChatMessage: { method: 'POST', path: '/Chat/PinMessage', query: ['messageId'] },
  removeChatMember: { method: 'DELETE', path: '/Chat/RemoveMember', query: ['channelId', 'userId'] },
  removeChatReaction: { method: 'DELETE', path: '/Chat/RemoveReaction', query: ['messageId', 'emoji'] },
  searchChatGifs: { method: 'GET', path: '/Chat/SearchGifs', query: ['q', 'limit', 'offset'] },
  searchChatMessages: { method: 'GET', path: '/Chat/Search', query: ['q', 'channelId', 'from', 'to', 'page', 'pageSize'] },
  sendChatbotMessage: { method: 'POST', path: '/Chatbot/SendChatMessage', body: 'json' },
  sendChatMessage: { method: 'POST', path: '/Chat/SendMessage', query: ['channelId'], body: 'json' },
  setChatNotificationPreference: { method: 'PUT', path: '/Chat/SetNotificationPreference', query: ['channelId'], body: 'json' },
  unpinChatMessage: { method: 'DELETE', path: '/Chat/UnpinMessage', query: ['messageId'] },
  updateChatChannel: { method: 'PUT', path: '/Chat/UpdateChannel', query: ['channelId'], body: 'json' },
  uploadChatAttachment: { method: 'POST', path: '/Chat/UploadAttachment', query: ['channelId', 'messageId'], body: 'multipart' },
});

const E = chatEndpoints;

/** Acknowledges an urgent message for the current user. `POST /Chat/Ack` — legacy: DIRU. */
export const ackChatMessage = (ctx: ApiContext, params: { messageId: string }, options?: RequestOptions): Promise<ChatActionResult> => request<ChatActionResult>(ctx, E.ackChatMessage, { params }, options);

/** Adds members to a DM, ad-hoc or custom locked channel. The requester must be an active member of the channel or a channel moderator. `POST /Chat/AddMembers` — legacy: DIRU. */
export const addChatMembers = (ctx: ApiContext, params: { channelId: string }, body: AddMembersInput, options?: RequestOptions): Promise<ChatV4Response<ChatMemberResultData[]>> =>
  request<ChatV4Response<ChatMemberResultData[]>>(ctx, E.addChatMembers, { params, body }, options);

/** Adds an emoji reaction to a message. `POST /Chat/AddReaction` — legacy: DIRU. */
export const addChatReaction = (ctx: ApiContext, params: { messageId: string }, body: AddReactionInput, options?: RequestOptions): Promise<ChatActionResult> =>
  request<ChatActionResult>(ctx, E.addChatReaction, { params, body }, options);

/** Archives a channel. Requires channel moderator rights. `DELETE /Chat/ArchiveChannel` — legacy: DIRU. */
export const archiveChatChannel = (ctx: ApiContext, params: { channelId: string }, options?: RequestOptions): Promise<ChatActionResult> => request<ChatActionResult>(ctx, E.archiveChatChannel, { params }, options);

/** Asks the incident assistant a question about a command board and returns the answer synchronously. Unlike SendChatMessage (queued, reply fans out over SignalR), a commander working a board needs the answer in the same round-trip, so the chatbot pipeline runs inline. The same authorization, per-department gating and rate limiting apply — this is the pipeline, not a bypass of it. `POST /Chatbot/AskIncident` — legacy: I. */
export const askIncidentAssistant = (ctx: ApiContext, body: AskIncidentAssistantInput, options?: RequestOptions): Promise<IncidentAssistantAnswerResponse> =>
  request<IncidentAssistantAnswerResponse>(ctx, E.askIncidentAssistant, { body }, options);

/** Creates an ad-hoc group channel with an explicit member list. `POST /Chat/CreateAdHocChannel` — legacy: DIRU. */
export const createAdHocChatChannel = (ctx: ApiContext, body: CreateAdHocChannelInput, options?: RequestOptions): Promise<ChatV4Response<ChatChannelResultData>> =>
  request<ChatV4Response<ChatChannelResultData>>(ctx, E.createAdHocChatChannel, { body }, options);

/** Finds or creates the 1:1 direct message channel between the current user and a user or unit. `POST /Chat/CreateDirectMessage` — legacy: DIRU. */
export const createDirectMessageChannel = (ctx: ApiContext, body: CreateDirectMessageInput, options?: RequestOptions): Promise<ChatV4Response<ChatChannelResultData>> =>
  request<ChatV4Response<ChatChannelResultData>>(ctx, E.createDirectMessageChannel, { body }, options);

/** Deletes a message the current user sent (tombstone delete). `DELETE /Chat/DeleteMessage` — legacy: DIRU. */
export const deleteChatMessage = (ctx: ApiContext, params: { messageId: string }, options?: RequestOptions): Promise<ChatActionResult> => request<ChatActionResult>(ctx, E.deleteChatMessage, { params }, options);

/** Edits a message's body. Only the original sender can edit; the prior body is preserved for audit. `PUT /Chat/EditMessage` — legacy: DIRU. */
export const editChatMessage = (ctx: ApiContext, params: { messageId: string }, body: EditMessageInput, options?: RequestOptions): Promise<ChatV4Response<ChatMessageResultData>> =>
  request<ChatV4Response<ChatMessageResultData>>(ctx, E.editChatMessage, { params, body }, options);

/** Flags a message for moderator review. `POST /Chat/FlagMessage` — legacy: DIRU. */
export const flagChatMessage = (ctx: ApiContext, params: { messageId: string }, body: FlagMessageInput, options?: RequestOptions): Promise<ChatActionResult> =>
  request<ChatActionResult>(ctx, E.flagChatMessage, { params, body }, options);

/** Downloads a chat attachment's file data. `GET /Chat/GetAttachment` — legacy: DIRU. */
export const getChatAttachment = (ctx: ApiContext, params: { attachmentId: string }, options?: RequestOptions): Promise<ArrayBuffer> => request<ArrayBuffer>(ctx, E.getChatAttachment, { params }, options);

/** Downloads a chat attachment's thumbnail (falls back to the full file when no thumbnail exists). `GET /Chat/GetAttachmentThumbnail` — legacy: DIRU. */
export const getChatAttachmentThumbnail = (ctx: ApiContext, params: { attachmentId: string }, options?: RequestOptions): Promise<ArrayBuffer> =>
  request<ArrayBuffer>(ctx, E.getChatAttachmentThumbnail, { params }, options);

/** Gets (creating if needed) the caller's chatbot conversation channel. `GET /Chatbot/GetChatChannel` — legacy: DIRU. */
export const getChatbotChannel = (ctx: ApiContext, options?: RequestOptions): Promise<ChatbotChannelResponse> => request<ChatbotChannelResponse>(ctx, E.getChatbotChannel, {}, options);

/** Gets a single chat channel by its Id. `GET /Chat/GetChannel` — legacy: DIRU. */
export const getChatChannel = (ctx: ApiContext, params: { channelId: string }, options?: RequestOptions): Promise<ChatV4Response<ChatChannelResultData>> =>
  request<ChatV4Response<ChatChannelResultData>>(ctx, E.getChatChannel, { params }, options);

/** Returns all the chat channels the current user can access, with per-channel unread counts. `GET /Chat/GetChannels` — legacy: DIRU. */
export const getChatChannels = (
  ctx: ApiContext,
  params: { activeUnitId?: number | string; includeArchived?: boolean; callId?: number | string } = {},
  options?: RequestOptions
): Promise<ChatV4Response<ChatChannelResultData[]>> => request<ChatV4Response<ChatChannelResultData[]>>(ctx, E.getChatChannels, { params }, options);

/** Returns the members of a chat channel. `GET /Chat/GetMembers` — legacy: DIRU. */
export const getChatMembers = (ctx: ApiContext, params: { channelId: string }, options?: RequestOptions): Promise<ChatV4Response<ChatMemberResultData[]>> =>
  request<ChatV4Response<ChatMemberResultData[]>>(ctx, E.getChatMembers, { params }, options);

/** Returns a keyset page of messages for a channel, newest first, enriched with reactions and attachment metadata. `GET /Chat/GetMessages` — legacy: DIRU. */
export const getChatMessages = (ctx: ApiContext, params: { channelId: string; beforeSeq?: number | string; limit?: number | string }, options?: RequestOptions): Promise<ChatV4Response<ChatMessageResultData[]>> =>
  request<ChatV4Response<ChatMessageResultData[]>>(ctx, E.getChatMessages, { params }, options);

/** Delta sync for reconnect: returns every message after the supplied sequence, ascending, enriched with reactions and attachment metadata. `GET /Chat/GetMessagesAfter` — legacy: DIRU. */
export const getChatMessagesAfter = (ctx: ApiContext, params: { channelId: string; afterSeq?: number | string; limit?: number | string }, options?: RequestOptions): Promise<ChatV4Response<ChatMessageResultData[]>> =>
  request<ChatV4Response<ChatMessageResultData[]>>(ctx, E.getChatMessagesAfter, { params }, options);

/** Returns the pinned messages for a channel. `GET /Chat/GetPins` — legacy: DIRU. */
export const getChatPins = (ctx: ApiContext, params: { channelId: string }, options?: RequestOptions): Promise<ChatV4Response<ChatMessageResultData[]>> =>
  request<ChatV4Response<ChatMessageResultData[]>>(ctx, E.getChatPins, { params }, options);

/** Returns which of the requested users are currently online in chat. `GET /Chat/GetPresence` — legacy: DIRU. */
export const getChatPresence = (ctx: ApiContext, params: { userIds?: string } = {}, options?: RequestOptions): Promise<GetChatPresenceResult> =>
  request<GetChatPresenceResult>(ctx, E.getChatPresence, { params }, options);

/** Returns a keyset page of replies for a message thread, newest first. `GET /Chat/GetThread` — legacy: DIRU. */
export const getChatThread = (ctx: ApiContext, params: { messageId: string; beforeSeq?: number | string; limit?: number | string }, options?: RequestOptions): Promise<ChatV4Response<ChatMessageResultData[]>> =>
  request<ChatV4Response<ChatMessageResultData[]>>(ctx, E.getChatThread, { params }, options);

/** Questions worth putting in front of the commander for this incident, chosen from the ICS playbook inferred from the call's type/name/nature. The IC app ships the same playbooks so it can build these offline; this endpoint keeps a server-side department in sync with them. `GET /Chatbot/IncidentSuggestions` — legacy: I. */
export const getIncidentAssistantSuggestions = (ctx: ApiContext, params: { callId: number | string }, options?: RequestOptions): Promise<IncidentAssistantSuggestionsResponse> =>
  request<IncidentAssistantSuggestionsResponse>(ctx, E.getIncidentAssistantSuggestions, { params }, options);

/** Returns the current user's pending urgent-message acknowledgments across the department. `GET /Chat/GetMyPendingAcks` — legacy: DIRU. */
export const getMyPendingChatAcks = (ctx: ApiContext, options?: RequestOptions): Promise<ChatV4Response<ChatAckResultData[]>> => request<ChatV4Response<ChatAckResultData[]>>(ctx, E.getMyPendingChatAcks, {}, options);

/** Advances the current user's read pointer for a channel (monotonic). `PUT /Chat/MarkRead` — legacy: DIRU. */
export const markChatRead = (ctx: ApiContext, params: { channelId: string }, body: MarkReadInput, options?: RequestOptions): Promise<ChatActionResult> =>
  request<ChatActionResult>(ctx, E.markChatRead, { params, body }, options);

/** Deletes a message as a moderator (tombstone delete with audit). Requires channel moderator rights. `DELETE /ChatModeration/DeleteMessage` — legacy: DIRU. */
export const moderatorDeleteChatMessage = (ctx: ApiContext, params: { messageId: string; reason?: string }, options?: RequestOptions): Promise<ChatActionResult> =>
  request<ChatActionResult>(ctx, E.moderatorDeleteChatMessage, { params }, options);

/** Resets the chatbot conversational session (context/pending intents). Message history remains. `POST /Chatbot/NewChatSession` — legacy: DIRU. */
export const newChatbotSession = (ctx: ApiContext, options?: RequestOptions): Promise<ChatbotSessionResponse> => request<ChatbotSessionResponse>(ctx, E.newChatbotSession, {}, options);

/** Pins a message in its channel. Requires channel moderator rights. `POST /Chat/PinMessage` — legacy: DIRU. */
export const pinChatMessage = (ctx: ApiContext, params: { messageId: string }, options?: RequestOptions): Promise<ChatActionResult> => request<ChatActionResult>(ctx, E.pinChatMessage, { params }, options);

/** Removes a member from a channel. Users can always remove themselves (leave); removing another member requires channel moderator rights. `DELETE /Chat/RemoveMember` — legacy: DIRU. */
export const removeChatMember = (ctx: ApiContext, params: { channelId: string; userId?: string }, options?: RequestOptions): Promise<ChatActionResult> =>
  request<ChatActionResult>(ctx, E.removeChatMember, { params }, options);

/** Removes the current user's emoji reaction from a message. `DELETE /Chat/RemoveReaction` — legacy: DIRU. */
export const removeChatReaction = (ctx: ApiContext, params: { messageId: string; emoji?: string }, options?: RequestOptions): Promise<ChatActionResult> =>
  request<ChatActionResult>(ctx, E.removeChatReaction, { params }, options);

/** Searches the configured GIF provider. An empty query returns trending GIFs; when no provider is configured an empty successful result is returned. `GET /Chat/SearchGifs` — legacy: DIRU. */
export const searchChatGifs = (ctx: ApiContext, params: { q?: string; limit?: number | string; offset?: number | string } = {}, options?: RequestOptions): Promise<ChatV4Response<GifResultData[]>> =>
  request<ChatV4Response<GifResultData[]>>(ctx, E.searchChatGifs, { params }, options);

/** Searches message bodies across every channel the user can access (or one channel when supplied). `GET /Chat/Search` — legacy: DIRU. */
export const searchChatMessages = (
  ctx: ApiContext,
  params: { q?: string; channelId?: string; from?: string; to?: string; page?: number | string; pageSize?: number | string } = {},
  options?: RequestOptions
): Promise<ChatV4Response<ChatMessageResultData[]>> => request<ChatV4Response<ChatMessageResultData[]>>(ctx, E.searchChatMessages, { params }, options);

/** Sends a message to the chatbot. The message is persisted to the caller's chatbot channel and processed asynchronously by the chatbot pipeline; the reply arrives in the same channel over SignalR (chatMessageReceived). Idempotent via clientMessageId. `POST /Chatbot/SendChatMessage` — legacy: DIRU. */
export const sendChatbotMessage = (ctx: ApiContext, body: ChatbotChatMessageRequest, options?: RequestOptions): Promise<ChatbotSendResponse> => request<ChatbotSendResponse>(ctx, E.sendChatbotMessage, { body }, options);

/** Sends a message to a channel. Supports unit and incident-commander identities, threads, urgent priority and mentions. Resending with the same ClientMessageId returns the original. `POST /Chat/SendMessage` — legacy: DIRU. */
export const sendChatMessage = (ctx: ApiContext, params: { channelId: string }, body: SendChatMessageInput, options?: RequestOptions): Promise<ChatV4Response<ChatMessageResultData>> =>
  request<ChatV4Response<ChatMessageResultData>>(ctx, E.sendChatMessage, { params, body }, options);

/** Sets the current user's notification preference for a channel. `PUT /Chat/SetNotificationPreference` — legacy: DIRU. */
export const setChatNotificationPreference = (ctx: ApiContext, params: { channelId: string }, body: SetNotificationPreferenceInput, options?: RequestOptions): Promise<ChatActionResult> =>
  request<ChatActionResult>(ctx, E.setChatNotificationPreference, { params, body }, options);

/** Unpins a message in its channel. Requires channel moderator rights. `DELETE /Chat/UnpinMessage` — legacy: DIRU. */
export const unpinChatMessage = (ctx: ApiContext, params: { messageId: string }, options?: RequestOptions): Promise<ChatActionResult> => request<ChatActionResult>(ctx, E.unpinChatMessage, { params }, options);

/** Updates a channel's name and topic. Requires channel moderator rights. `PUT /Chat/UpdateChannel` — legacy: DIRU. */
export const updateChatChannel = (ctx: ApiContext, params: { channelId: string }, body: UpdateChannelInput, options?: RequestOptions): Promise<ChatV4Response<ChatChannelResultData>> =>
  request<ChatV4Response<ChatChannelResultData>>(ctx, E.updateChatChannel, { params, body }, options);

/** Uploads an attachment for a message the current user already sent, using multipart/form-data. Allowed types: png, jpeg, gif, webp and pdf up to the configured size limit. `POST /Chat/UploadAttachment` — legacy: DIRU. */
export const uploadChatAttachment = (ctx: ApiContext, params: { channelId: string; messageId?: string }, body: FormData, options?: RequestOptions): Promise<ChatAttachmentUploadedResult> =>
  request<ChatAttachmentUploadedResult>(ctx, E.uploadChatAttachment, { params, body }, options);
