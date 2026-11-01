import { deleteMessage, getInboxMessages, getMessage, getOutboxMessages, getRecipients, parseUtcMs, respondToMessage, sendMessage } from '@resgrid/api';
import type { MessageResultData, NewMessageInput, RecipientsResultData, RespondToMessageInput, SendMessageResult } from '@resgrid/models';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { assertV4Success, unwrapItem, unwrapList } from '../core/envelope';
import { type DataError, toDataError } from '../core/errors';
import { defineDataHandler, submitWrite, type WriteResult } from '../core/outbox';
import { dataPersistOptions, registerPersistedStore } from '../core/persist';
import { registerDataStoreReset } from '../core/reset';
import { dataNow, getDataApiContext } from '../core/runtime';
import { createSliceRunner, emptySliceMeta, type FetchOptions, type SliceMeta, type SliceRunner } from '../core/slices';

export const MESSAGE_SEND_EVENT = 'messages.send';

/** Offline window for persisted messages (plan §8.2a: messages 30 days) and a row cap. */
export const MESSAGES_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
export const MESSAGES_MAX_ROWS = 200;

export interface QueuedMessage {
  localId: string;
  input: NewMessageInput;
  createdAt: number;
  state: 'queued' | 'rejected';
}

type MessagesSlice = 'inbox' | 'sent' | 'recipients' | 'detail';

interface MessagesData extends SliceMeta<MessagesSlice> {
  inboxMessages: MessageResultData[];
  sentMessages: MessageResultData[];
  recipients: RecipientsResultData[];
  messageDetailsById: Record<string, MessageResultData>;
  /** Read state kept on this device (Responder). */
  readMessageIds: string[];
  queuedMessages: Record<string, QueuedMessage>;
  writeError: DataError | null;
}

export interface MessagesState extends MessagesData {
  fetchInboxMessages: (options?: FetchOptions) => Promise<void>;
  fetchSentMessages: (options?: FetchOptions) => Promise<void>;
  fetchRecipients: (options?: FetchOptions & { includeUnits?: boolean }) => Promise<void>;
  fetchMessageDetails: (messageId: string, options?: FetchOptions) => Promise<MessageResultData | null>;
  /** Offline-capable compose (Responder message compose, plan §8.5). */
  sendNewMessage: (input: NewMessageInput) => Promise<WriteResult>;
  /** Online only. */
  deleteMessages: (messageIds: string[]) => Promise<boolean>;
  /** Online only (poll/callback answers are time-sensitive). */
  respondToMessage: (input: RespondToMessageInput) => Promise<boolean>;
  markMessageRead: (messageId: string) => void;
  applyQueuedMessage: (message: QueuedMessage) => void;
  setQueuedMessageState: (localId: string, state: QueuedMessage['state'] | null) => void;
}

const initialData = (): MessagesData => ({
  ...emptySliceMeta<MessagesSlice>(),
  inboxMessages: [],
  sentMessages: [],
  recipients: [],
  messageDetailsById: {},
  readMessageIds: [],
  queuedMessages: {},
  writeError: null,
});

/** Newest first, within the retention window, capped. */
export const retainMessages = (messages: MessageResultData[], now = dataNow()): MessageResultData[] =>
  [...messages]
    .map((message) => ({ message, at: parseUtcMs(message.SentOnUtc) ?? 0 }))
    .filter(({ at }) => at === 0 || now - at <= MESSAGES_RETENTION_MS)
    .sort((a, b) => b.at - a.at)
    .slice(0, MESSAGES_MAX_ROWS)
    .map(({ message }) => message);

let runner: SliceRunner<MessagesSlice, MessagesState>;

export const useMessagesStore = create<MessagesState>()(
  persist(
    (set, get) => {
      runner = createSliceRunner<MessagesSlice, MessagesState>('messages', set);
      return {
        ...initialData(),

        fetchInboxMessages: async (options) => {
          await runner.run(
            'inbox',
            async () => retainMessages(unwrapList(await getInboxMessages(getDataApiContext()))),
            (inboxMessages) => ({ inboxMessages }),
            { trailing: options?.bypassCache === true }
          );
        },

        fetchSentMessages: async (options) => {
          await runner.run(
            'sent',
            async () => retainMessages(unwrapList(await getOutboxMessages(getDataApiContext()))),
            (sentMessages) => ({ sentMessages }),
            { trailing: options?.bypassCache === true }
          );
        },

        fetchRecipients: async (options) => {
          await runner.run(
            'recipients',
            async () => unwrapList(await getRecipients(getDataApiContext(), { disallowNoone: true, includeUnits: options?.includeUnits ?? true })),
            (recipients) => ({ recipients })
          );
        },

        fetchMessageDetails: async (messageId, options) => {
          const cached = get().messageDetailsById[messageId];
          if (cached && !options?.bypassCache) return cached;
          const result = await runner.run(
            'detail',
            async () => unwrapItem(await getMessage(getDataApiContext(), { messageId })),
            (message, state) => (message ? { messageDetailsById: { ...state.messageDetailsById, [messageId]: message } } : {}),
            { flightKey: `detail:${messageId}` }
          );
          return result.ok ? result.value : (cached ?? null);
        },

        sendNewMessage: async (input) => submitWrite<NewMessageInput>({ type: MESSAGE_SEND_EVENT, payload: input }),

        deleteMessages: async (messageIds) => {
          set({ writeError: null });
          try {
            await Promise.all(messageIds.map(async (messageId) => assertV4Success(await deleteMessage(getDataApiContext(), { messageId }))));
            const removed = new Set(messageIds);
            set((state) => ({ inboxMessages: state.inboxMessages.filter((m) => !removed.has(m.MessageId)), sentMessages: state.sentMessages.filter((m) => !removed.has(m.MessageId)) }));
            return true;
          } catch (error) {
            set({ writeError: toDataError(error) });
            return false;
          }
        },

        respondToMessage: async (input) => {
          set({ writeError: null });
          try {
            assertV4Success(await respondToMessage(getDataApiContext(), input));
            if (input.Id !== undefined) await get().fetchMessageDetails(String(input.Id), { bypassCache: true });
            return true;
          } catch (error) {
            set({ writeError: toDataError(error) });
            return false;
          }
        },

        markMessageRead: (messageId) => set((state) => (state.readMessageIds.includes(messageId) ? {} : { readMessageIds: [...state.readMessageIds, messageId].slice(-MESSAGES_MAX_ROWS * 2) })),

        applyQueuedMessage: (message) => set((state) => ({ queuedMessages: { ...state.queuedMessages, [message.localId]: message } })),

        setQueuedMessageState: (localId, messageState) =>
          set((state) => {
            const existing = state.queuedMessages[localId];
            if (!existing) return {};
            const queuedMessages = { ...state.queuedMessages };
            if (messageState === null) delete queuedMessages[localId];
            else queuedMessages[localId] = { ...existing, state: messageState };
            return { queuedMessages };
          }),
      };
    },
    dataPersistOptions<MessagesState, Pick<MessagesData, 'inboxMessages' | 'sentMessages' | 'recipients' | 'readMessageIds' | 'queuedMessages' | 'fetchedAt'>>({
      name: 'omni-messages-storage',
      partialize: (state) => ({
        inboxMessages: state.inboxMessages,
        sentMessages: state.sentMessages,
        recipients: state.recipients,
        readMessageIds: state.readMessageIds,
        queuedMessages: state.queuedMessages,
        fetchedAt: state.fetchedAt,
      }),
    })
  )
);

registerPersistedStore('omni-messages-storage', useMessagesStore);
registerDataStoreReset<MessagesState>('messages', useMessagesStore, initialData, () => runner.invalidate());

export const messageSendHandler = defineDataHandler<NewMessageInput, SendMessageResult>({
  type: MESSAGE_SEND_EVENT,
  optimisticApply: (event) => useMessagesStore.getState().applyQueuedMessage({ localId: event.id, input: event.payload, createdAt: event.createdAt, state: 'queued' }),
  send: async (event) => assertV4Success(await sendMessage(getDataApiContext(), event.payload)),
  afterAck: async (event) => {
    useMessagesStore.getState().setQueuedMessageState(event.id, null);
    await useMessagesStore.getState().fetchSentMessages({ bypassCache: true });
  },
  rollback: (event, reason) => useMessagesStore.getState().setQueuedMessageState(event.id, reason === 'discarded' ? null : 'rejected'),
});
