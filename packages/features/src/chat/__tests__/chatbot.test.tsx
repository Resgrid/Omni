import '../../status/__tests__/test-setup';

import { featureFlagsStore, securityStore, useAuthStore } from '@resgrid/auth';
import { type Capabilities } from '@resgrid/config';
import { useChatStore } from '@resgrid/data';
import { type ChatChannelResultData, ChatChannelType, type ChatMessageResultData, ChatMessageType, ChatParticipantType, type DepartmentRightsResultData } from '@resgrid/models';
import { defaultResetRegistry } from '@resgrid/offline';
import { emitRealtimeEvent, signalRService, useRealtimeStore } from '@resgrid/realtime';
import { GluestackUIProvider, useToastStore } from '@resgrid/ui';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router, useFocusEffect } from 'expo-router';
import React from 'react';

import { chatNav } from '../nav';
import { CHAT_ROUTE_PATTERNS, chatRoutes } from '../routes';
import ChatChannelsScreen from '../screens/chat-channels';
import ChatbotScreen from '../screens/chatbot';

const mockCapabilities = { realtime: { chatHub: true, hubWatchdog: false } };
jest.mock('@resgrid/config', () => ({
  ...jest.requireActual('@resgrid/config'),
  useCapability: (key: keyof typeof mockCapabilities) => mockCapabilities[key],
  getActiveVariant: () => ({ shell: { homeRoute: '/home' } }),
}));

const mockFlag = jest.fn().mockResolvedValue(undefined);
const mockPin = jest.fn().mockResolvedValue(undefined);
jest.mock('../lib/chat-actions', () => ({
  startDirectConversation: jest.fn(),
  startGroupConversation: jest.fn(),
  setMessagePinned: (id: string, pinned: boolean) => mockPin(id, pinned),
  flagMessage: (id: string, reason: number) => mockFlag(id, reason),
  moderatorDeleteMessage: jest.fn(),
}));

const mockSetString = jest.fn().mockResolvedValue(true);
jest.mock('expo-clipboard', () => ({ setStringAsync: (text: string) => mockSetString(text) }));

const BOT = 'bot-1';
const q = { includeHiddenElements: true } as const;

const message = (id: string, extra: Partial<ChatMessageResultData> = {}): ChatMessageResultData => ({
  ChatMessageId: id,
  ChatChannelId: BOT,
  MessageSeq: 1,
  SenderParticipantType: ChatParticipantType.User,
  SenderUserId: 'me',
  Body: `Question ${id}`,
  MessageType: ChatMessageType.Text,
  Priority: 0,
  ThreadReplyCount: 0,
  AlsoSendToChannel: false,
  SentOn: '2026-10-31T10:00:00Z',
  Reactions: [],
  Attachments: [],
  ...extra,
});
const reply = (id: string, extra: Partial<ChatMessageResultData> = {}): ChatMessageResultData =>
  message(id, { SenderParticipantType: ChatParticipantType.Bot, SenderUserId: null, SenderDisplayName: 'Resgrid Assistant', MessageType: ChatMessageType.Bot, Body: `Answer ${id}`, MessageSeq: 2, ...extra });

const setActiveChatChannel = jest.fn(async () => undefined);
const initChatbot = jest.fn(async () => BOT);
const sendChatbotMessage = jest.fn(async () => ({ ok: true }));
const retryChatbotMessage = jest.fn(async () => ({ ok: true }));
const newChatbotSession = jest.fn(async () => true);
const loadNewerMessages = jest.fn(async () => undefined);
const markChannelRead = jest.fn(async () => undefined);
let invoke: jest.SpyInstance;

const enableChat = (enabled = true) => featureFlagsStore.setState({ flags: { 'Chat.System': { enabled } }, isLoaded: true });
const wrapper = ({ children }: { children?: React.ReactNode }) => <GluestackUIProvider>{children}</GluestackUIProvider>;

beforeEach(() => {
  mockCapabilities.realtime.chatHub = true;
  enableChat();
  jest.clearAllMocks();
  useToastStore.getState().clearToasts();
  useAuthStore.setState({ userId: 'me' });
  securityStore.setState({ rights: { IsAdmin: false } as DepartmentRightsResultData });
  useRealtimeStore.setState({ setActiveChatChannel, activeChatChannel: null });
  invoke = jest.spyOn(signalRService, 'invoke').mockResolvedValue(undefined);
  (useFocusEffect as jest.Mock).mockImplementation((effect: () => void | (() => void)) => React.useEffect(effect, [effect]));
  useChatStore.setState({
    chatbotChannelId: BOT,
    chatbotTyping: false,
    errors: {},
    fetchedAt: {},
    loading: {},
    channels: [],
    messagesByChannel: { [BOT]: [message('q1'), reply('r1')] },
    initChatbot,
    sendChatbotMessage,
    retryChatbotMessage,
    newChatbotSession,
    loadNewerMessages,
    markChannelRead,
    loadOlderMessages: jest.fn(async () => undefined),
    fetchChannels: jest.fn(async () => undefined),
  });
});

afterEach(async () => {
  invoke.mockRestore();
  useToastStore.getState().clearToasts();
  // Clears the reply timers a real `chatbotTyping` handler may have started.
  await defaultResetRegistry.getStoreResets().get('data.chat')?.('logout');
});

describe('chat routes and nav', () => {
  it('builds the assistant route and offers it in the menu behind Chat.System and the chat hub', () => {
    expect(chatRoutes.chatbot()).toBe('/chatbot');
    expect(CHAT_ROUTE_PATTERNS.chatbot).toBe('/chatbot');
    const entry = chatNav.find((item) => item.id === 'chatbot');
    expect(entry).toMatchObject({ href: '/chatbot', labelKey: 'chatbot.title', requiresFlag: 'Chat.System' });
    expect(entry?.requiresCapability?.({ realtime: { chatHub: false } } as Capabilities)).toBe(false);
    expect(entry?.requiresCapability?.({ realtime: { chatHub: true } } as Capabilities)).toBe(true);
  });

  it('the conversation list opens the assistant channel on its own screen', () => {
    useChatStore.setState({ channels: [{ ChatChannelId: BOT, Name: 'Assistant', ChannelType: ChatChannelType.Chatbot, IsArchived: false, CreatedOn: '2026-10-30T10:00:00Z' } as ChatChannelResultData] });
    render(<ChatChannelsScreen />);
    fireEvent.press(screen.getByTestId(`chat-channel-${BOT}`));
    expect(router.push).toHaveBeenCalledWith('/chatbot');
  });
});

describe('ChatbotScreen', () => {
  it('redirects home when the department has Chat.System off', () => {
    enableChat(false);
    render(<ChatbotScreen />);
    expect(screen.getByTestId('redirect')).toHaveTextContent('/home');
    expect(initChatbot).not.toHaveBeenCalled();
  });

  it('loads the channel on focus, marks it active for the user (never the unit) and joins its hub group', async () => {
    render(<ChatbotScreen />);
    expect(screen.getByTestId('chatbot-screen')).toBeOnTheScreen();
    expect(screen.getByText('Answer r1')).toBeOnTheScreen();
    expect(initChatbot).toHaveBeenCalledTimes(1);
    expect(setActiveChatChannel).toHaveBeenCalledWith(BOT, null);
    expect(invoke).toHaveBeenCalledWith(expect.any(String), 'JoinChannel', BOT, null);
    await waitFor(() => expect(markChannelRead).toHaveBeenCalledWith(BOT));
  });

  it('waits for the channel, then says when the department has no assistant', () => {
    useChatStore.setState({ chatbotChannelId: null, messagesByChannel: {} });
    const { rerender } = render(<ChatbotScreen />);
    expect(screen.getByTestId('chatbot-loading')).toBeOnTheScreen();

    act(() => useChatStore.setState({ errors: { chatbot: { code: 'not_found', status: 404, messageKey: 'errors.data.not_found' } } }));
    rerender(<ChatbotScreen />);
    expect(screen.getByTestId('chatbot-unavailable')).toBeOnTheScreen();
    expect(screen.queryByTestId('chatbot-retry')).toBeNull();
    expect(invoke).not.toHaveBeenCalled();
  });

  it('offers a retry when the assistant could not be reached', () => {
    useChatStore.setState({ chatbotChannelId: null, messagesByChannel: {}, errors: { chatbot: { code: 'network', messageKey: 'errors.data.network' } } });
    render(<ChatbotScreen />);
    expect(screen.getByTestId('chatbot-load-failed')).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('chatbot-retry'));
    expect(initChatbot).toHaveBeenCalledTimes(2);
  });

  it('asks a question through the shared composer (no urgent toggle)', async () => {
    render(<ChatbotScreen />);
    expect(screen.queryByTestId('chat-composer-urgent')).toBeNull();
    fireEvent.changeText(screen.getByTestId('chat-composer-input'), '  Who is on shift?  ');
    fireEvent.press(screen.getByTestId('chat-composer-send'));
    await waitFor(() => expect(sendChatbotMessage).toHaveBeenCalledWith('Who is on shift?'));
    expect(screen.getByTestId('chat-composer-input').props.value).toBe('');
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it('a refused question shows an error toast', async () => {
    sendChatbotMessage.mockResolvedValueOnce({ ok: false, error: { code: 'forbidden', status: 403, messageKey: 'errors.data.forbidden' } } as never);
    render(<ChatbotScreen />);
    fireEvent.changeText(screen.getByTestId('chat-composer-input'), 'PAR');
    fireEvent.press(screen.getByTestId('chat-composer-send'));
    await waitFor(() => expect(useToastStore.getState().toasts).toHaveLength(1));
    expect(useToastStore.getState().toasts[0]).toMatchObject({ type: 'error' });
  });

  it('shows the thinking row on chatbotTyping and replaces it with the reply from chatMessageReceived', () => {
    render(<ChatbotScreen />);
    expect(screen.queryByTestId('chatbot-typing')).toBeNull();

    act(() => emitRealtimeEvent('chatbotTyping', JSON.stringify({ ChatChannelId: BOT, IsTyping: true })));
    expect(screen.getByTestId('chatbot-typing')).toBeOnTheScreen();

    // A message for another conversation changes nothing here.
    act(() => emitRealtimeEvent('chatMessageReceived', JSON.stringify(reply('x', { ChatChannelId: 'other', MessageSeq: 9 }))));
    expect(screen.getByTestId('chatbot-typing')).toBeOnTheScreen();

    act(() => emitRealtimeEvent('chatMessageReceived', JSON.stringify(reply('r2', { MessageSeq: 3, Body: 'Engine 1: Lee, Patel' }))));
    expect(screen.getByText('Engine 1: Lee, Patel')).toBeOnTheScreen();
    expect(screen.queryByTestId('chatbot-typing')).toBeNull();
  });

  it('accepts chatbotMessageReceived too', () => {
    render(<ChatbotScreen />);
    act(() => emitRealtimeEvent('chatbotMessageReceived', reply('r3', { MessageSeq: 4, Body: 'Hydrant 12 is out of service' })));
    expect(screen.getByText('Hydrant 12 is out of service')).toBeOnTheScreen();
  });

  it('rejoins the channel and backfills after the chat hub reconnects', () => {
    render(<ChatbotScreen />);
    invoke.mockClear();
    act(() => emitRealtimeEvent('chatHubJoined', { hub: 'chat', rejoin: true, at: 1 }));
    expect(invoke).toHaveBeenCalledWith(expect.any(String), 'JoinChannel', BOT, null);
    expect(loadNewerMessages).toHaveBeenCalledWith(BOT);
  });

  it('a failed question is tap-to-retry under its client id', () => {
    useChatStore.setState({ messagesByChannel: { [BOT]: [message('client-1', { ClientMessageId: 'client-1', MessageSeq: 9_000_000_000_001, _localStatus: 'failed' })] } });
    render(<ChatbotScreen />);
    fireEvent.press(screen.getByTestId('chat-message-client-1-retry'));
    expect(retryChatbotMessage).toHaveBeenCalledWith('client-1');
  });

  it('starts a new session and reports a failure', async () => {
    newChatbotSession.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    render(<ChatbotScreen />);
    fireEvent.press(screen.getByTestId('chatbot-new-session'));
    await waitFor(() => expect(newChatbotSession).toHaveBeenCalledTimes(1));
    expect(useToastStore.getState().toasts).toHaveLength(0);

    fireEvent.press(screen.getByTestId('chatbot-new-session'));
    await waitFor(() => expect(useToastStore.getState().toasts).toHaveLength(1));
    expect(useToastStore.getState().toasts[0]).toMatchObject({ type: 'error' });
  });

  it('assistant replies offer copy and report only; a moderator can also pin', async () => {
    render(<ChatbotScreen />, { wrapper });
    fireEvent(screen.getByTestId('chat-message-r1'), 'longPress');
    expect(screen.getByTestId('message-action-copy', q)).toBeOnTheScreen();
    expect(screen.getByTestId('message-action-flag', q)).toBeOnTheScreen();
    expect(screen.queryByTestId('message-react-👍', q)).toBeNull();
    expect(screen.queryByTestId('message-action-edit', q)).toBeNull();
    expect(screen.queryByTestId('message-action-delete', q)).toBeNull();
    expect(screen.queryByTestId('message-action-pin', q)).toBeNull();

    fireEvent.press(screen.getByTestId('message-action-copy', q));
    await waitFor(() => expect(mockSetString).toHaveBeenCalledWith('Answer r1'));

    act(() => securityStore.setState({ rights: { IsAdmin: true } as DepartmentRightsResultData }));
    fireEvent(screen.getByTestId('chat-message-r1'), 'longPress');
    fireEvent.press(screen.getByTestId('message-action-pin', q));
    await waitFor(() => expect(mockPin).toHaveBeenCalledWith('r1', true));
  });
});
