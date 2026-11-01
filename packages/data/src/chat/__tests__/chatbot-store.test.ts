import { getChatbotChannel, getChatMessages, getChatMessagesAfter, newChatbotSession, sendChatbotMessage } from '@resgrid/api';
import { type ChatMessageResultData, ChatMessageType, ChatParticipantType } from '@resgrid/models';
import { defaultResetRegistry } from '@resgrid/offline';

import { createDataTestRuntime, flush, httpError, networkError, notFound, ok } from '../../__tests__/helpers';
import { type DataLogger, setDataIdGenerator, setDataLogger } from '../../core/runtime';
import { CHATBOT_REPLY_POLL_MS, CHATBOT_TYPING_TIMEOUT_MS, isChatbotReply, parseChatEventPayload, PENDING_SEQ_BASE, useChatStore } from '../chat-store';

jest.mock('@resgrid/api', () => ({
  ...jest.requireActual('@resgrid/api'),
  getChatbotChannel: jest.fn(),
  getChatMessages: jest.fn(),
  getChatMessagesAfter: jest.fn(),
  newChatbotSession: jest.fn(),
  sendChatbotMessage: jest.fn(),
}));

const BOT_CHANNEL = 'bot-1';
const QUESTION = 'Who is on Engine 1 today?';

const message = (id: string, seq: number, overrides: Partial<ChatMessageResultData> = {}): ChatMessageResultData =>
  ({
    ChatMessageId: id,
    ChatChannelId: BOT_CHANNEL,
    MessageSeq: seq,
    SenderParticipantType: ChatParticipantType.User,
    SenderUserId: 'user-a',
    MessageType: ChatMessageType.Text,
    SentOn: '2026-10-31T12:00:00Z',
    Body: id,
    Reactions: [],
    Attachments: [],
    ...overrides,
  }) as ChatMessageResultData;
const reply = (id: string, seq: number, overrides: Partial<ChatMessageResultData> = {}): ChatMessageResultData =>
  message(id, seq, { SenderParticipantType: ChatParticipantType.Bot, SenderUserId: null, SenderDisplayName: 'Resgrid Assistant', MessageType: ChatMessageType.Bot, ...overrides });

const list = (): ChatMessageResultData[] => useChatStore.getState().messagesByChannel[BOT_CHANNEL] ?? [];
const resetChat = async (): Promise<void> => {
  await defaultResetRegistry.getStoreResets().get('data.chat')?.('logout');
};

let logger: { [K in keyof DataLogger]: jest.Mock };

beforeEach(async () => {
  await createDataTestRuntime({ variant: 'responder' });
  await resetChat();
  logger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  setDataLogger(logger);
  setDataIdGenerator(() => 'client-1');
  jest.mocked(getChatMessages).mockResolvedValue(ok([]) as never);
  jest.mocked(getChatMessagesAfter).mockResolvedValue(ok([]) as never);
});

afterEach(async () => {
  // Clears the reply timers so nothing outlives the test.
  await resetChat();
  jest.useRealTimers();
});

const useFakeClock = (): void => {
  jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick', 'queueMicrotask'] });
};

const initWith = async (messages: ChatMessageResultData[] = []): Promise<void> => {
  jest.mocked(getChatbotChannel).mockResolvedValue(ok({ ChatChannelId: BOT_CHANNEL, LastMessageSeq: 0 }) as never);
  jest.mocked(getChatMessages).mockResolvedValue(ok(messages) as never);
  await useChatStore.getState().initChatbot();
};

describe('chatbot helpers', () => {
  it('parses hub payloads sent as JSON strings or objects', () => {
    expect(parseChatEventPayload('{"ChatChannelId":"bot-1","IsTyping":true}')).toEqual({ ChatChannelId: 'bot-1', IsTyping: true });
    expect(parseChatEventPayload({ ChatChannelId: 'bot-1' })).toEqual({ ChatChannelId: 'bot-1' });
    expect(parseChatEventPayload('not json')).toBeNull();
    expect(parseChatEventPayload(['x'])).toBeNull();
    expect(parseChatEventPayload(null)).toBeNull();
  });

  it('recognises the assistant by participant or message type', () => {
    expect(isChatbotReply(reply('r', 2))).toBe(true);
    expect(isChatbotReply(message('m', 1, { MessageType: ChatMessageType.Bot }))).toBe(true);
    expect(isChatbotReply(message('m', 1))).toBe(false);
  });
});

describe('initChatbot', () => {
  it('resolves the assistant channel and loads its latest messages', async () => {
    await initWith([message('q1', 1), reply('r1', 2)]);
    expect(useChatStore.getState().chatbotChannelId).toBe(BOT_CHANNEL);
    expect(getChatMessages).toHaveBeenCalledWith(expect.anything(), { channelId: BOT_CHANNEL, limit: 50 });
    expect(list().map((m) => m.ChatMessageId)).toEqual(['q1', 'r1']);
  });

  it('a not_found envelope leaves no channel (assistant off for the department)', async () => {
    jest.mocked(getChatbotChannel).mockResolvedValue(notFound(null) as never);
    expect(await useChatStore.getState().initChatbot()).toBeNull();
    expect(useChatStore.getState().chatbotChannelId).toBeNull();
    expect(useChatStore.getState().fetchedAt.chatbot).toBeGreaterThan(0);
    expect(getChatMessages).not.toHaveBeenCalled();
  });

  it('records why the channel could not be loaded', async () => {
    jest.mocked(getChatbotChannel).mockRejectedValue(httpError(404));
    await useChatStore.getState().initChatbot();
    expect(useChatStore.getState().errors.chatbot?.code).toBe('not_found');
  });
});

describe('sendChatbotMessage', () => {
  it('shows the question at once, sends it with a client id and reconciles it with the server row', async () => {
    await initWith([reply('r0', 3)]);
    let resolveSend: (value: unknown) => void = () => undefined;
    jest.mocked(sendChatbotMessage).mockReturnValue(new Promise((resolve) => (resolveSend = resolve)) as never);

    const pending = useChatStore.getState().sendChatbotMessage(`  ${QUESTION}  `);
    expect(list()[1]).toMatchObject({ ChatMessageId: 'client-1', ClientMessageId: 'client-1', Body: QUESTION, SenderUserId: 'user-a', _localStatus: 'pending' });
    expect(list()[1].MessageSeq).toBeGreaterThanOrEqual(PENDING_SEQ_BASE);
    expect(useChatStore.getState().chatbotTyping).toBe(true);
    expect(sendChatbotMessage).toHaveBeenCalledWith(expect.anything(), { Text: QUESTION, ClientMessageId: 'client-1' });

    resolveSend(ok({ ChatMessageId: 'srv-1', MessageSeq: 4, SentOn: '2026-10-31T12:01:00Z' }, 'created'));
    expect(await pending).toEqual({ ok: true });
    expect(list().map((m) => [m.ChatMessageId, m.MessageSeq, m._localStatus ?? 'server'])).toEqual([
      ['r0', 3, 'server'],
      ['srv-1', 4, 'sent'],
    ]);
    // Still waiting for the answer.
    expect(useChatStore.getState().chatbotTyping).toBe(true);
  });

  it('does nothing without a channel or text', async () => {
    expect(await useChatStore.getState().sendChatbotMessage('hello')).toEqual({ ok: false });
    await initWith();
    expect(await useChatStore.getState().sendChatbotMessage('   ')).toEqual({ ok: false });
    expect(sendChatbotMessage).not.toHaveBeenCalled();
  });

  it('a failed send stays visible as failed, never logs the question, and retries under the same client id', async () => {
    await initWith();
    jest.mocked(sendChatbotMessage).mockRejectedValueOnce(networkError());
    const result = await useChatStore.getState().sendChatbotMessage(QUESTION);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('network');
    expect(list()[0]._localStatus).toBe('failed');
    expect(useChatStore.getState().chatbotTyping).toBe(false);
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain(QUESTION);

    jest.mocked(sendChatbotMessage).mockResolvedValueOnce(ok({ ChatMessageId: 'srv-1', MessageSeq: 1, SentOn: '2026-10-31T12:01:00Z' }) as never);
    expect(await useChatStore.getState().retryChatbotMessage('client-1')).toEqual({ ok: true });
    expect(sendChatbotMessage).toHaveBeenLastCalledWith(expect.anything(), { Text: QUESTION, ClientMessageId: 'client-1' });
    expect(list()).toHaveLength(1);
    expect(list()[0]).toMatchObject({ ChatMessageId: 'srv-1', _localStatus: 'sent' });
  });

  it('only retries a failed question', async () => {
    await initWith([message('q1', 1, { ClientMessageId: 'old' })]);
    expect(await useChatStore.getState().retryChatbotMessage('old')).toEqual({ ok: false });
    expect(sendChatbotMessage).not.toHaveBeenCalled();
  });
});

describe('assistant replies over the chat hub', () => {
  beforeEach(async () => {
    await initWith([message('q0', 1)]);
    jest.mocked(sendChatbotMessage).mockResolvedValue(ok({ ChatMessageId: 'srv-1', MessageSeq: 2, SentOn: '2026-10-31T12:01:00Z' }) as never);
    await useChatStore.getState().sendChatbotMessage(QUESTION);
  });

  it('the echo of the question keeps the thinking row; the reply (chatMessageReceived JSON) clears it', () => {
    expect(useChatStore.getState().handleChatbotMessageReceived(JSON.stringify(message('srv-1', 2, { ClientMessageId: 'client-1', Body: QUESTION })))).toBe(true);
    expect(list()).toHaveLength(2);
    expect(useChatStore.getState().chatbotTyping).toBe(true);

    expect(useChatStore.getState().handleChatbotMessageReceived(reply('r1', 3, { Body: 'Engine 1: Lee, Patel' }))).toBe(true);
    expect(list().map((m) => m.ChatMessageId)).toEqual(['q0', 'srv-1', 'r1']);
    expect(list()[2]._localStatus).toBe('sent');
    expect(useChatStore.getState().chatbotTyping).toBe(false);
  });

  it('ignores messages for other channels and unusable payloads', () => {
    expect(useChatStore.getState().handleChatbotMessageReceived(reply('x', 9, { ChatChannelId: 'other' }))).toBe(false);
    expect(useChatStore.getState().handleChatbotMessageReceived('garbage')).toBe(false);
    expect(useChatStore.getState().messagesByChannel.other).toBeUndefined();
    expect(useChatStore.getState().chatbotTyping).toBe(true);
  });

  it('fetches a reply whose body the hub truncated instead of storing the cut copy', async () => {
    jest.mocked(getChatMessagesAfter).mockResolvedValue(ok([reply('r1', 3, { Body: 'full answer' })]) as never);
    expect(useChatStore.getState().handleChatbotMessageReceived({ ...reply('r1', 3, { Body: 'cut' }), BodyTruncated: true })).toBe(true);
    await flush();
    expect(getChatMessagesAfter).toHaveBeenCalledWith(expect.anything(), { channelId: BOT_CHANNEL, afterSeq: 2, limit: 50 });
    expect(list().find((m) => m.ChatMessageId === 'r1')?.Body).toBe('full answer');
    expect(useChatStore.getState().chatbotTyping).toBe(false);
  });
});

describe('thinking row and realtime fallback', () => {
  it('chatbotTyping turns the row on; it times out and pulls newer messages', async () => {
    useFakeClock();
    await initWith([message('q0', 1)]);
    useChatStore.getState().handleChatbotTyping({ ChatChannelId: 'other', IsTyping: true });
    expect(useChatStore.getState().chatbotTyping).toBe(false);

    useChatStore.getState().handleChatbotTyping('{"ChatChannelId":"bot-1","IsTyping":true}');
    expect(useChatStore.getState().chatbotTyping).toBe(true);
    jest.advanceTimersByTime(CHATBOT_TYPING_TIMEOUT_MS);
    expect(useChatStore.getState().chatbotTyping).toBe(false);
    await flush();
    expect(getChatMessagesAfter).toHaveBeenLastCalledWith(expect.anything(), { channelId: BOT_CHANNEL, afterSeq: 1, limit: 50 });

    useChatStore.getState().handleChatbotTyping({ chatChannelId: 'bot-1', isTyping: true });
    expect(useChatStore.getState().chatbotTyping).toBe(true);
    useChatStore.getState().handleChatbotTyping({ IsTyping: false });
    expect(useChatStore.getState().chatbotTyping).toBe(false);
  });

  it('polls for the reply while the hub stays silent, then stops', async () => {
    useFakeClock();
    await initWith([message('q0', 1)]);
    jest.mocked(sendChatbotMessage).mockResolvedValue(ok({ ChatMessageId: 'srv-1', MessageSeq: 2, SentOn: '2026-10-31T12:01:00Z' }) as never);
    await useChatStore.getState().sendChatbotMessage(QUESTION);
    jest.mocked(getChatMessagesAfter).mockClear();

    jest.mocked(getChatMessagesAfter).mockResolvedValueOnce(ok([]) as never);
    jest.advanceTimersByTime(CHATBOT_REPLY_POLL_MS);
    await flush();
    expect(getChatMessagesAfter).toHaveBeenCalledTimes(1);
    expect(useChatStore.getState().chatbotTyping).toBe(true);

    jest.mocked(getChatMessagesAfter).mockResolvedValueOnce(ok([reply('r1', 3)]) as never);
    jest.advanceTimersByTime(CHATBOT_REPLY_POLL_MS);
    await flush();
    expect(list().map((m) => m.ChatMessageId)).toEqual(['q0', 'srv-1', 'r1']);
    expect(useChatStore.getState().chatbotTyping).toBe(false);

    jest.advanceTimersByTime(CHATBOT_TYPING_TIMEOUT_MS);
    await flush();
    expect(getChatMessagesAfter).toHaveBeenCalledTimes(2);
  });
});

describe('newChatbotSession', () => {
  it('resets the session and pulls the confirmation Core posts into the channel', async () => {
    await initWith([message('q0', 1)]);
    jest.mocked(newChatbotSession).mockResolvedValue({ Success: true, Status: 'success' } as never);
    jest.mocked(getChatMessagesAfter).mockResolvedValue(ok([reply('r1', 2, { Body: 'Starting a new conversation' })]) as never);
    expect(await useChatStore.getState().newChatbotSession()).toBe(true);
    await flush();
    expect(list().map((m) => m.ChatMessageId)).toEqual(['q0', 'r1']);
  });

  it('reports a failed reset', async () => {
    await initWith();
    jest.mocked(newChatbotSession).mockRejectedValue(httpError(500));
    expect(await useChatStore.getState().newChatbotSession()).toBe(false);
    expect(useChatStore.getState().actionError?.code).toBe('server');
  });
});

describe('reset', () => {
  it('sign-out clears the assistant channel, the thinking row and its timers', async () => {
    useFakeClock();
    await initWith();
    useChatStore.getState().handleChatbotTyping({ ChatChannelId: BOT_CHANNEL, IsTyping: true });
    await resetChat();
    expect(useChatStore.getState()).toMatchObject({ chatbotChannelId: null, chatbotTyping: false });
    jest.mocked(getChatMessagesAfter).mockClear();
    jest.advanceTimersByTime(CHATBOT_TYPING_TIMEOUT_MS);
    await flush();
    expect(getChatMessagesAfter).not.toHaveBeenCalled();
  });
});
