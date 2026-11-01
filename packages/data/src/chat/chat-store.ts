import {
  ackChatMessage,
  addChatReaction,
  deleteChatMessage,
  editChatMessage,
  getChatChannels,
  getChatMembers,
  getChatMessages,
  getChatMessagesAfter,
  getMyPendingChatAcks,
  markChatRead,
  parseUtcMs,
  removeChatReaction,
  sendChatMessage,
} from '@resgrid/api';
import type { ChatAckResultData, ChatChannelResultData, ChatMemberResultData, ChatMentionInput, ChatMessageResultData, ChatOutboxItem, SendChatMessageInput } from '@resgrid/models';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { assertV4Success, unwrapList } from '../core/envelope';
import { type DataError, toDataError } from '../core/errors';
import { defineDataHandler, submitWrite, type WriteResult } from '../core/outbox';
import { dataPersistOptions, registerPersistedStore } from '../core/persist';
import { registerDataStoreReset } from '../core/reset';
import { getDataApiContext, getDataLogger, getDataOutbox, getDataSessionScope, hasDataOutbox } from '../core/runtime';
import { createSliceRunner, emptySliceMeta, type FetchOptions, type SliceMeta, type SliceRunner } from '../core/slices';

export const CHAT_MESSAGE_SEND_EVENT = 'chat.message.send';

/** Messages at or above this sequence are optimistic (unconfirmed) sends (IC). */
export const PENDING_SEQ_BASE = 9_000_000_000_000;
export const CHAT_PAGE_SIZE = 50;

export type IncidentChannelsStatus = 'loading' | 'loaded' | 'failed';

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

type ChatSlice = 'channels' | 'incidentChannels' | 'messages' | 'members' | 'acks';

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
registerDataStoreReset<ChatState>('chat', useChatStore, initialData, () => runner.invalidate());

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
