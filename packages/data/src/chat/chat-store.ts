import {
  ackChatMessage,
  addChatReaction,
  deleteChatMessage,
  editChatMessage,
  getChatbotChannel,
  getChatChannels,
  getChatMembers,
  getChatMessages,
  getChatMessagesAfter,
  getMyPendingChatAcks,
  markChatRead,
  newChatbotSession as postNewChatbotSession,
  parseUtcMs,
  removeChatReaction,
  sendChatbotMessage as postChatbotMessage,
  sendChatMessage,
} from '@resgrid/api';
import type { ChatAckResultData, ChatChannelResultData, ChatMemberResultData, ChatMentionInput, ChatMessageResultData, ChatOutboxItem, SendChatMessageInput } from '@resgrid/models';
import { ChatMessagePriority, ChatMessageType, ChatParticipantType } from '@resgrid/models';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { assertV4Success, unwrapItem, unwrapList } from '../core/envelope';
import { type DataError, toDataError } from '../core/errors';
import { defineDataHandler, submitWrite, type WriteResult } from '../core/outbox';
import { dataPersistOptions, registerPersistedStore } from '../core/persist';
import { registerDataStoreReset } from '../core/reset';
import { dataNow, generateDataId, getDataApiContext, getDataLogger, getDataOutbox, getDataSessionScope, hasDataOutbox } from '../core/runtime';
import { createSliceRunner, emptySliceMeta, type FetchOptions, type SliceMeta, type SliceRunner } from '../core/slices';

export const CHAT_MESSAGE_SEND_EVENT = 'chat.message.send';

/** Messages at or above this sequence are optimistic (unconfirmed) sends (IC). */
export const PENDING_SEQ_BASE = 9_000_000_000_000;
export const CHAT_PAGE_SIZE = 50;

/** Core never sends `chatbotTyping` false: the "thinking" row clears on the assistant's reply or after this long. */
export const CHATBOT_TYPING_TIMEOUT_MS = 30_000;
/** While a reply is awaited, pull newer messages this often in case the hub missed it (channel not joined, hub down). */
export const CHATBOT_REPLY_POLL_MS = 8_000;

export type IncidentChannelsStatus = 'loading' | 'loaded' | 'failed';

/** Outcome of an assistant send: `error` explains a failure (the message stays in the list as failed, ready to retry). */
export interface ChatbotSendResult {
  ok: boolean;
  error?: DataError;
}

export interface ChatSendArgs {
  channelId: string;
  body: string;
  messageType?: number;
  priority?: number;
  asUnitId?: number;
  asIncidentCommander?: boolean;
  threadRootMessageId?: string;
  alsoSendToChannel?: boolean;
  metadataJson?: string;
  mentions?: ChatMentionInput[];
}

export interface ChatSendPayload {
  channelId: string;
  input: Omit<SendChatMessageInput, 'ClientMessageId'>;
  senderDisplayName?: string;
}

type ChatSlice = 'channels' | 'incidentChannels' | 'messages' | 'members' | 'acks' | 'chatbot';

interface ChatData extends SliceMeta<ChatSlice> {
  channels: ChatChannelResultData[];
  /** Dispatch call filter: channels anchored to one incident (including archived ones, kept readable). */
  incidentChannelsByCallId: Record<string, ChatChannelResultData[]>;
  incidentChannelsStatusByCallId: Record<string, IncidentChannelsStatus>;
  messagesByChannel: Record<string, ChatMessageResultData[]>;
  hasMoreByChannel: Record<string, boolean>;
  membersByChannel: Record<string, ChatMemberResultData[]>;
  pendingAcks: ChatAckResultData[];
  /** Legacy `chat-outbox-storage` items not yet moved into the durable outbox (normally empty). */
  outbox: ChatOutboxItem[];
  actionError: DataError | null;
  /** The caller's assistant channel (`Chatbot/GetChatChannel`); null until the assistant screen loads it. */
  chatbotChannelId: string | null;
  /** The assistant is working on a reply: a question in flight or `chatbotTyping` from the hub. */
  chatbotTyping: boolean;
}

export interface ChatState extends ChatData {
  /** One signature for every app: unit chat passes `activeUnitId`, the incident view passes `callId`. */
  fetchChannels: (params?: { activeUnitId?: number; includeArchived?: boolean }, options?: FetchOptions) => Promise<void>;
  loadIncidentChannels: (callId: string, options?: FetchOptions) => Promise<void>;
  loadInitialMessages: (channelId: string, options?: FetchOptions) => Promise<void>;
  loadOlderMessages: (channelId: string) => Promise<void>;
  loadNewerMessages: (channelId: string) => Promise<void>;
  fetchMembers: (channelId: string) => Promise<void>;
  fetchPendingAcks: () => Promise<void>;
  /** Offline-capable compose: optimistic message now, delivered through the outbox (ClientMessageId = outbox id). */
  sendMessage: (args: ChatSendArgs) => Promise<WriteResult>;
  editMessage: (messageId: string, channelId: string, body: string) => Promise<boolean>;
  deleteMessage: (messageId: string, channelId: string) => Promise<boolean>;
  addReaction: (messageId: string, emoji: string) => Promise<boolean>;
  removeReaction: (messageId: string, emoji: string) => Promise<boolean>;
  acknowledgeMessage: (messageId: string) => Promise<boolean>;
  markChannelRead: (channelId: string, asUnitId?: number) => Promise<void>;
  // Realtime (chatHub) handlers: payloads are parsed by @resgrid/realtime and passed in.
  handleMessageReceived: (message: ChatMessageResultData) => void;
  handleMessageEdited: (message: ChatMessageResultData) => void;
  handleMessageDeleted: (channelId: string, messageId: string) => void;
  handleChannelUpdated: () => Promise<void>;
  // Assistant (chatbot). Online only: a question is useless once stale, so a failed send stays visible for a retry
  // (same ClientMessageId, so Core never stores it twice) instead of waiting in the outbox.
  /** Gets (creating if needed) the assistant channel, then loads its latest messages. Resolves to the channel id. */
  initChatbot: () => Promise<string | null>;
  /** Optimistic question now, `Chatbot/SendChatMessage` with a client id; the reply arrives over the chat hub. */
  sendChatbotMessage: (text: string) => Promise<ChatbotSendResult>;
  /** Resends a failed question under its original ClientMessageId. */
  retryChatbotMessage: (clientMessageId: string) => Promise<ChatbotSendResult>;
  /** Clears the assistant's conversational context (history stays); Core posts a confirmation into the channel. */
  newChatbotSession: () => Promise<boolean>;
  /**
   * A `chatbotMessageReceived` or `chatMessageReceived` hub payload (object or JSON string). Applied only when it
   * belongs to the assistant channel (returns true); the assistant's own reply clears `chatbotTyping`.
   */
  handleChatbotMessageReceived: (payload: unknown) => boolean;
  /** A `chatbotTyping` hub payload (`{ ChatChannelId, IsTyping }`, object or JSON string). */
  handleChatbotTyping: (payload: unknown) => void;
  /** Moves legacy `chat-outbox-storage` items into the durable outbox, keeping their ClientMessageId as idempotency key. */
  importLegacyOutbox: () => Promise<number>;
  // Used by the outbox handler.
  upsertMessage: (message: ChatMessageResultData) => void;
  setLocalStatus: (channelId: string, clientMessageId: string, status: 'pending' | 'failed' | null) => void;
}

const initialData = (): ChatData => ({
  ...emptySliceMeta<ChatSlice>(),
  channels: [],
  incidentChannelsByCallId: {},
  incidentChannelsStatusByCallId: {},
  messagesByChannel: {},
  hasMoreByChannel: {},
  membersByChannel: {},
  pendingAcks: [],
  outbox: [],
  actionError: null,
  chatbotChannelId: null,
  chatbotTyping: false,
});

const compareMessages = (a: ChatMessageResultData, b: ChatMessageResultData): number => (a.MessageSeq !== b.MessageSeq ? a.MessageSeq - b.MessageSeq : (parseUtcMs(a.SentOn) ?? 0) - (parseUtcMs(b.SentOn) ?? 0));

/** Realtime payloads omit empty collections; an existing value always wins over a missing one (IC). */
const withCollections = (incoming: ChatMessageResultData, existing?: ChatMessageResultData): ChatMessageResultData => ({
  ...incoming,
  Reactions: incoming.Reactions ?? existing?.Reactions ?? [],
  Attachments: incoming.Attachments ?? existing?.Attachments ?? [],
});

/** Upsert by ChatMessageId or ClientMessageId (so optimistic sends reconcile with the server copy). */
export const upsertChatMessage = (list: ChatMessageResultData[], incoming: ChatMessageResultData): ChatMessageResultData[] => {
  const next = list.slice();
  const index = next.findIndex((m) => m.ChatMessageId === incoming.ChatMessageId || (!!incoming.ClientMessageId && !!m.ClientMessageId && m.ClientMessageId === incoming.ClientMessageId));
  if (index >= 0) next[index] = withCollections({ ...next[index], ...incoming }, next[index]);
  else next.push(withCollections(incoming));
  return next.sort(compareMessages);
};

const mergeMessages = (existing: ChatMessageResultData[], incoming: ChatMessageResultData[]): ChatMessageResultData[] => incoming.reduce(upsertChatMessage, existing);

const optimisticMessage = (clientMessageId: string, payload: ChatSendPayload, createdAt: number): ChatMessageResultData => {
  const session = getDataSessionScope();
  return {
    ChatMessageId: clientMessageId,
    ChatChannelId: payload.channelId,
    MessageSeq: PENDING_SEQ_BASE + createdAt,
    SenderParticipantType: payload.input.AsUnitId ? 1 : 0,
    SenderUserId: session?.userId ?? null,
    SenderUnitId: payload.input.AsUnitId ?? null,
    SenderDisplayName: payload.senderDisplayName ?? session?.displayName ?? null,
    Body: payload.input.Body,
    MessageType: payload.input.MessageType,
    Priority: payload.input.Priority,
    ThreadRootMessageId: payload.input.ThreadRootMessageId ?? null,
    ThreadReplyCount: 0,
    AlsoSendToChannel: payload.input.AlsoSendToChannel ?? false,
    MetadataJson: payload.input.MetadataJson ?? null,
    ClientMessageId: clientMessageId,
    SentOn: new Date(createdAt).toISOString(),
    Reactions: [],
    Attachments: [],
    _localStatus: 'pending',
  };
};

/** A chat hub payload as an object: Core sends most chat events as a JSON string, some as already-parsed objects. */
export const parseChatEventPayload = (payload: unknown): Record<string, unknown> | null => {
  let value = payload;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value) as unknown;
    } catch {
      return null;
    }
  }
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
};

/** Written by the assistant (Core `SendBotMessageAsync`: bot participant, bot message type). */
export const isChatbotReply = (message: Pick<ChatMessageResultData, 'SenderParticipantType' | 'MessageType'>): boolean =>
  message.SenderParticipantType === ChatParticipantType.Bot || message.MessageType === ChatMessageType.Bot;

const highestConfirmedSeq = (list: readonly ChatMessageResultData[] | undefined): number => (list ?? []).reduce((max, m) => (m.MessageSeq < PENDING_SEQ_BASE && m.MessageSeq > max ? m.MessageSeq : max), 0);

const optimisticChatbotMessage = (clientMessageId: string, channelId: string, body: string, createdAt: number): ChatMessageResultData => {
  const session = getDataSessionScope();
  return {
    ChatMessageId: clientMessageId,
    ChatChannelId: channelId,
    MessageSeq: PENDING_SEQ_BASE + createdAt,
    SenderParticipantType: ChatParticipantType.User,
    SenderUserId: session?.userId ?? null,
    SenderUnitId: null,
    SenderDisplayName: session?.displayName ?? null,
    Body: body,
    MessageType: ChatMessageType.Text,
    Priority: ChatMessagePriority.Normal,
    ThreadRootMessageId: null,
    ThreadReplyCount: 0,
    AlsoSendToChannel: false,
    MetadataJson: null,
    ClientMessageId: clientMessageId,
    SentOn: new Date(createdAt).toISOString(),
    Reactions: [],
    Attachments: [],
    _localStatus: 'pending',
  };
};

// Awaiting the assistant's reply: module scope like the legacy store, cleared on reset (timers must not outlive a session).
let chatbotTypingTimer: ReturnType<typeof setTimeout> | null = null;
let chatbotPollTimer: ReturnType<typeof setInterval> | null = null;
let chatbotAwaiting = false;
/** Highest confirmed sequence before the newest question; an assistant message above it is the reply. */
let chatbotReplyBaseline = 0;

const clearChatbotTimers = (): void => {
  if (chatbotTypingTimer) clearTimeout(chatbotTypingTimer);
  if (chatbotPollTimer) clearInterval(chatbotPollTimer);
  chatbotTypingTimer = null;
  chatbotPollTimer = null;
};

const resetChatbotRuntime = (): void => {
  clearChatbotTimers();
  chatbotAwaiting = false;
  chatbotReplyBaseline = 0;
};

let runner: SliceRunner<ChatSlice, ChatState>;

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => {
      runner = createSliceRunner<ChatSlice, ChatState>('chat', set);
      const act = async (fn: () => Promise<unknown>): Promise<boolean> => {
        set({ actionError: null });
        try {
          await fn();
          return true;
        } catch (error) {
          set({ actionError: toDataError(error) });
          return false;
        }
      };

      const hasChatbotReply = (channelId: string): boolean => (get().messagesByChannel[channelId] ?? []).some((m) => m.MessageSeq > chatbotReplyBaseline && m.MessageSeq < PENDING_SEQ_BASE && isChatbotReply(m));

      const stopAwaitingReply = (): void => {
        resetChatbotRuntime();
        if (get().chatbotTyping) set({ chatbotTyping: false });
      };

      /** Pulls messages newer than the newest confirmed one (the realtime fallback) and settles the wait on a reply. */
      const refreshChatbot = async (channelId: string): Promise<void> => {
        await get().loadNewerMessages(channelId);
        if (chatbotAwaiting && hasChatbotReply(channelId)) stopAwaitingReply();
      };

      const startAwaitingReply = (channelId: string): void => {
        if (!chatbotAwaiting) chatbotReplyBaseline = highestConfirmedSeq(get().messagesByChannel[channelId]);
        chatbotAwaiting = true;
        clearChatbotTimers();
        if (!get().chatbotTyping) set({ chatbotTyping: true });
        chatbotPollTimer = setInterval(() => void refreshChatbot(channelId), CHATBOT_REPLY_POLL_MS);
        chatbotTypingTimer = setTimeout(() => {
          stopAwaitingReply();
          void get().loadNewerMessages(channelId);
        }, CHATBOT_TYPING_TIMEOUT_MS);
      };

      const deliverChatbotMessage = async (channelId: string, clientMessageId: string, body: string): Promise<ChatbotSendResult> => {
        startAwaitingReply(channelId);
        try {
          const result = assertV4Success(await postChatbotMessage(getDataApiContext(), { Text: body, ClientMessageId: clientMessageId }));
          const sent = result.Data;
          const current = (get().messagesByChannel[channelId] ?? []).find((m) => m.ClientMessageId === clientMessageId);
          if (sent && sent.MessageSeq > chatbotReplyBaseline && sent.MessageSeq < PENDING_SEQ_BASE) chatbotReplyBaseline = sent.MessageSeq;
          if (current) get().upsertMessage({ ...current, ...(sent ? { ChatMessageId: sent.ChatMessageId, MessageSeq: sent.MessageSeq, SentOn: sent.SentOn } : {}), _localStatus: 'sent' });
          return { ok: true };
        } catch (error) {
          const dataError = toDataError(error);
          stopAwaitingReply();
          get().setLocalStatus(channelId, clientMessageId, 'failed');
          // Never the question text: it can carry anything the user typed.
          getDataLogger().warn({ message: 'Assistant message not sent', context: { code: dataError.code, status: dataError.status } });
          return { ok: false, error: dataError };
        }
      };

      return {
        ...initialData(),

        fetchChannels: async (params, options) => {
          await runner.run(
            'channels',
            async () => unwrapList(await getChatChannels(getDataApiContext(), { activeUnitId: params?.activeUnitId, includeArchived: params?.includeArchived })),
            (channels) => ({ channels }),
            {
              trailing: options?.bypassCache === true,
            }
          );
        },

        loadIncidentChannels: async (callId) => {
          set((state) => ({ incidentChannelsStatusByCallId: { ...state.incidentChannelsStatusByCallId, [callId]: 'loading' } }));
          const result = await runner.run(
            'incidentChannels',
            async () => {
              const numericCallId = parseInt(callId, 10);
              const list = unwrapList(await getChatChannels(getDataApiContext(), { includeArchived: true, callId: numericCallId }));
              // callId narrows the list server-side; the local filter stays as a safety net (Dispatch).
              return list.filter((channel) => channel.CallId === numericCallId);
            },
            (list, state) => ({ incidentChannelsByCallId: { ...state.incidentChannelsByCallId, [callId]: list }, incidentChannelsStatusByCallId: { ...state.incidentChannelsStatusByCallId, [callId]: 'loaded' } }),
            { flightKey: `incident:${callId}` }
          );
          if (!result.ok && !result.stale) set((state) => ({ incidentChannelsStatusByCallId: { ...state.incidentChannelsStatusByCallId, [callId]: 'failed' } }));
        },

        loadInitialMessages: async (channelId) => {
          await runner.run(
            'messages',
            async () => unwrapList(await getChatMessages(getDataApiContext(), { channelId, limit: CHAT_PAGE_SIZE })),
            (list, state) => ({
              // Keep this device's unconfirmed sends on top of the server page.
              messagesByChannel: {
                ...state.messagesByChannel,
                [channelId]: mergeMessages(
                  (state.messagesByChannel[channelId] ?? []).filter((m) => m._localStatus === 'pending' || m._localStatus === 'failed'),
                  list
                ),
              },
              hasMoreByChannel: { ...state.hasMoreByChannel, [channelId]: list.length >= CHAT_PAGE_SIZE },
            }),
            { flightKey: `messages:${channelId}` }
          );
        },

        loadOlderMessages: async (channelId) => {
          const confirmed = (get().messagesByChannel[channelId] ?? []).filter((m) => m.MessageSeq < PENDING_SEQ_BASE);
          const beforeSeq = confirmed[0]?.MessageSeq;
          if (beforeSeq === undefined || get().hasMoreByChannel[channelId] === false) return;
          await runner.run(
            'messages',
            async () => unwrapList(await getChatMessages(getDataApiContext(), { channelId, beforeSeq, limit: CHAT_PAGE_SIZE })),
            (list, state) => ({
              messagesByChannel: { ...state.messagesByChannel, [channelId]: mergeMessages(state.messagesByChannel[channelId] ?? [], list) },
              hasMoreByChannel: { ...state.hasMoreByChannel, [channelId]: list.length >= CHAT_PAGE_SIZE },
            }),
            { flightKey: `older:${channelId}`, silent: true }
          );
        },

        loadNewerMessages: async (channelId) => {
          const confirmed = (get().messagesByChannel[channelId] ?? []).filter((m) => m.MessageSeq < PENDING_SEQ_BASE);
          const afterSeq = confirmed[confirmed.length - 1]?.MessageSeq;
          if (afterSeq === undefined) return get().loadInitialMessages(channelId);
          await runner.run(
            'messages',
            async () => unwrapList(await getChatMessagesAfter(getDataApiContext(), { channelId, afterSeq, limit: CHAT_PAGE_SIZE })),
            (list, state) => ({ messagesByChannel: { ...state.messagesByChannel, [channelId]: mergeMessages(state.messagesByChannel[channelId] ?? [], list) } }),
            { flightKey: `newer:${channelId}`, silent: true, trailing: true }
          );
        },

        fetchMembers: async (channelId) => {
          await runner.run(
            'members',
            async () => unwrapList(await getChatMembers(getDataApiContext(), { channelId })),
            (list, state) => ({ membersByChannel: { ...state.membersByChannel, [channelId]: list } }),
            {
              flightKey: `members:${channelId}`,
            }
          );
        },

        fetchPendingAcks: async () => {
          await runner.run(
            'acks',
            async () => unwrapList(await getMyPendingChatAcks(getDataApiContext())),
            (pendingAcks) => ({ pendingAcks })
          );
        },

        sendMessage: async (args) =>
          submitWrite<ChatSendPayload>({
            type: CHAT_MESSAGE_SEND_EVENT,
            payload: {
              channelId: args.channelId,
              input: {
                Body: args.body,
                MessageType: args.messageType ?? 0,
                Priority: args.priority ?? 0,
                ...(args.asUnitId !== undefined ? { AsUnitId: args.asUnitId } : {}),
                ...(args.asIncidentCommander !== undefined ? { AsIncidentCommander: args.asIncidentCommander } : {}),
                ...(args.threadRootMessageId ? { ThreadRootMessageId: args.threadRootMessageId } : {}),
                ...(args.alsoSendToChannel !== undefined ? { AlsoSendToChannel: args.alsoSendToChannel } : {}),
                ...(args.metadataJson ? { MetadataJson: args.metadataJson } : {}),
                ...(args.mentions ? { Mentions: args.mentions } : {}),
              },
            },
          }),

        editMessage: (messageId, channelId, body) =>
          act(async () => {
            const result = await editChatMessage(getDataApiContext(), { messageId }, { Body: body });
            const message = assertV4Success(result).Data;
            const existing = (get().messagesByChannel[channelId] ?? []).find((m) => m.ChatMessageId === messageId);
            if (message) get().upsertMessage(message);
            else if (existing) get().upsertMessage({ ...existing, Body: body });
          }),

        deleteMessage: (messageId, channelId) =>
          act(async () => {
            assertV4Success(await deleteChatMessage(getDataApiContext(), { messageId }));
            get().handleMessageDeleted(channelId, messageId);
          }),

        addReaction: (messageId, emoji) => act(async () => assertV4Success(await addChatReaction(getDataApiContext(), { messageId }, { Emoji: emoji }))),
        removeReaction: (messageId, emoji) => act(async () => assertV4Success(await removeChatReaction(getDataApiContext(), { messageId, emoji }))),

        acknowledgeMessage: (messageId) =>
          act(async () => {
            assertV4Success(await ackChatMessage(getDataApiContext(), { messageId }));
            set((state) => ({ pendingAcks: state.pendingAcks.filter((ack) => ack.ChatMessageId !== messageId) }));
          }),

        markChannelRead: async (channelId, asUnitId) => {
          const confirmed = (get().messagesByChannel[channelId] ?? []).filter((m) => m.MessageSeq < PENDING_SEQ_BASE);
          const seq = confirmed[confirmed.length - 1]?.MessageSeq;
          if (seq === undefined) return;
          try {
            await markChatRead(getDataApiContext(), { channelId }, { Seq: seq, ...(asUnitId !== undefined ? { AsUnitId: asUnitId } : {}) });
          } catch {
            // Read receipts are best-effort.
          }
        },

        handleMessageReceived: (message) => get().upsertMessage(message),
        handleMessageEdited: (message) => get().upsertMessage(message),
        handleMessageDeleted: (channelId, messageId) =>
          set((state) => ({ messagesByChannel: { ...state.messagesByChannel, [channelId]: (state.messagesByChannel[channelId] ?? []).filter((m) => m.ChatMessageId !== messageId) } })),
        handleChannelUpdated: () => get().fetchChannels(undefined, { bypassCache: true }),

        initChatbot: async () => {
          const result = await runner.run(
            'chatbot',
            async () => unwrapItem(await getChatbotChannel(getDataApiContext())),
            (channel) => ({ chatbotChannelId: channel?.ChatChannelId ?? null })
          );
          const channelId = result.ok ? (result.value?.ChatChannelId ?? null) : get().chatbotChannelId;
          if (channelId) await get().loadInitialMessages(channelId);
          return channelId;
        },

        sendChatbotMessage: async (text) => {
          const channelId = get().chatbotChannelId;
          const body = text.trim();
          if (!channelId || !body) return { ok: false };
          const clientMessageId = generateDataId();
          get().upsertMessage(optimisticChatbotMessage(clientMessageId, channelId, body, dataNow()));
          return deliverChatbotMessage(channelId, clientMessageId, body);
        },

        retryChatbotMessage: async (clientMessageId) => {
          const channelId = get().chatbotChannelId;
          const failed = channelId ? (get().messagesByChannel[channelId] ?? []).find((m) => m.ClientMessageId === clientMessageId && m._localStatus === 'failed') : undefined;
          if (!channelId || !failed?.Body) return { ok: false };
          get().setLocalStatus(channelId, clientMessageId, 'pending');
          return deliverChatbotMessage(channelId, clientMessageId, failed.Body);
        },

        newChatbotSession: async () => {
          const ok = await act(async () => {
            const result = assertV4Success(await postNewChatbotSession(getDataApiContext()));
            if (result?.Success === false) throw new Error('Assistant session was not reset');
          });
          const channelId = get().chatbotChannelId;
          // Core posts its confirmation into the channel before answering; pull it in case the hub misses it.
          if (ok && channelId) void get().loadNewerMessages(channelId);
          return ok;
        },

        handleChatbotMessageReceived: (payload) => {
          const channelId = get().chatbotChannelId;
          const record = parseChatEventPayload(payload);
          if (!channelId || !record || record.ChatChannelId !== channelId) return false;
          if (typeof record.ChatMessageId !== 'string' || typeof record.MessageSeq !== 'number' || record.BodyTruncated === true) {
            // Not a whole message (the hub trims bodies over 64 KB): fetch the stored copy instead.
            void refreshChatbot(channelId);
            return true;
          }
          const message = record as unknown as ChatMessageResultData;
          get().upsertMessage({ ...message, _localStatus: 'sent' });
          if (isChatbotReply(message) && message.MessageSeq > chatbotReplyBaseline) stopAwaitingReply();
          return true;
        },

        handleChatbotTyping: (payload) => {
          const channelId = get().chatbotChannelId;
          const record = parseChatEventPayload(payload);
          if (!channelId || !record) return;
          const eventChannelId = record.ChatChannelId ?? record.chatChannelId;
          if (typeof eventChannelId === 'string' && eventChannelId !== channelId) return;
          const isTyping = record.IsTyping ?? record.isTyping;
          if (isTyping === true) startAwaitingReply(channelId);
          else if (isTyping === false) stopAwaitingReply();
        },

        importLegacyOutbox: async () => {
          const items = get().outbox;
          // Signed out: leave the items for whoever signs in (they are scoped to the session that queued them).
          if (items.length === 0 || !hasDataOutbox() || !getDataSessionScope()) return 0;
          const outbox = getDataOutbox();
          let imported = 0;
          const kept: ChatOutboxItem[] = [];
          for (const item of items) {
            try {
              await outbox.enqueue<ChatSendPayload>({
                id: item.ClientMessageId,
                createdAt: item.CreatedAt,
                type: CHAT_MESSAGE_SEND_EVENT,
                payload: {
                  channelId: item.ChannelId,
                  senderDisplayName: item.SenderDisplayName,
                  input: {
                    Body: item.Body,
                    MessageType: item.MessageType,
                    Priority: item.Priority,
                    AsUnitId: item.AsUnitId,
                    AsIncidentCommander: item.AsIncidentCommander,
                    ThreadRootMessageId: item.ThreadRootMessageId,
                    AlsoSendToChannel: item.AlsoSendToChannel,
                    MetadataJson: item.MetadataJson,
                    Mentions: item.Mentions,
                  },
                },
              });
              imported++;
            } catch {
              kept.push(item);
              getDataLogger().warn({ message: 'Legacy chat outbox item could not be imported', context: { type: CHAT_MESSAGE_SEND_EVENT } });
            }
          }
          set({ outbox: kept });
          return imported;
        },

        upsertMessage: (message) => {
          const channelId = message.ChatChannelId;
          set((state) => ({ messagesByChannel: { ...state.messagesByChannel, [channelId]: upsertChatMessage(state.messagesByChannel[channelId] ?? [], message) } }));
        },

        setLocalStatus: (channelId, clientMessageId, status) =>
          set((state) => {
            const list = state.messagesByChannel[channelId] ?? [];
            const next = status === null ? list.filter((m) => m.ClientMessageId !== clientMessageId) : list.map((m) => (m.ClientMessageId === clientMessageId ? { ...m, _localStatus: status } : m));
            return { messagesByChannel: { ...state.messagesByChannel, [channelId]: next } };
          }),
      };
    },
    dataPersistOptions<ChatState, Pick<ChatData, 'outbox' | 'channels'>>({
      // Frozen legacy name; v0 held only `outbox` (moved into the durable outbox by importLegacyOutbox()).
      name: 'chat-outbox-storage',
      partialize: (state) => ({ outbox: state.outbox, channels: state.channels }),
      merge: (persisted, current) => {
        const value = (persisted ?? {}) as Partial<Pick<ChatData, 'outbox' | 'channels'>>;
        return { ...current, outbox: Array.isArray(value.outbox) ? value.outbox : [], channels: Array.isArray(value.channels) ? value.channels : current.channels };
      },
    })
  )
);

registerPersistedStore('chat-outbox-storage', useChatStore);
registerDataStoreReset<ChatState>('chat', useChatStore, initialData, () => {
  runner.invalidate();
  resetChatbotRuntime();
});

/** Chat compose (offline scope of every chat variant): ClientMessageId = outbox id, so a resend is idempotent server-side. */
export const chatMessageSendHandler = defineDataHandler<ChatSendPayload, ChatMessageResultData | null>({
  type: CHAT_MESSAGE_SEND_EVENT,
  optimisticApply: (event) => useChatStore.getState().upsertMessage(optimisticMessage(event.id, event.payload, event.createdAt)),
  send: async (event, context) => {
    const result = assertV4Success(await sendChatMessage(getDataApiContext(), { channelId: event.payload.channelId }, { ...event.payload.input, ClientMessageId: context.idempotencyKey }));
    return result.Data ?? null;
  },
  afterAck: (event, message) => {
    if (message) useChatStore.getState().upsertMessage({ ...message, ClientMessageId: message.ClientMessageId ?? event.id, _localStatus: 'sent' });
    else useChatStore.getState().setLocalStatus(event.payload.channelId, event.id, null);
  },
  rollback: (event, reason) => useChatStore.getState().setLocalStatus(event.payload.channelId, event.id, reason === 'discarded' ? null : 'failed'),
});

/** Total unread across channels (badge). */
export const selectChatUnreadTotal = (state: Pick<ChatState, 'channels'>): number => state.channels.reduce((total, channel) => total + ((channel as ChatChannelResultData & { UnreadCount?: number }).UnreadCount ?? 0), 0);
