import '../../status/__tests__/test-setup';

import { type ApiContext } from '@resgrid/api';
import { featureFlagsStore, securityStore, useAuthStore } from '@resgrid/auth';
import { setDataApiContext, useChatStore, usePersonnelStore } from '@resgrid/data';
import { type ChatChannelResultData, ChatChannelType, type ChatMessageResultData, ChatMessageType, type DepartmentRightsResultData, type PersonnelInfoResultData } from '@resgrid/models';
import { emitRealtimeEvent, signalRService, useRealtimeStore } from '@resgrid/realtime';
import { GluestackUIProvider, useToastStore } from '@resgrid/ui';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router, useFocusEffect } from 'expo-router';
import React from 'react';
import { Text } from 'react-native';

import { ChatIdentityProvider } from '../chat-identity';
import { ChatGate } from '../components/chat-gate';
import { MessageActionsSheet } from '../components/message-actions-sheet';
import { MessageBubble } from '../components/message-bubble';
import { NewConversationSheet } from '../components/new-conversation-sheet';
import { assistantChannelOf, buildGifMetadata, groupChannels, isOwnMessage, parseGifMetadata } from '../lib/chat-format';
import ChatChannelsScreen from '../screens/chat-channels';
import ChatConversationScreen from '../screens/chat-conversation';

const mockCapabilities = { realtime: { chatHub: true, hubWatchdog: false } };
jest.mock('@resgrid/config', () => ({
  ...jest.requireActual('@resgrid/config'),
  useCapability: (key: keyof typeof mockCapabilities) => mockCapabilities[key],
  getActiveVariant: () => ({ shell: { homeRoute: '/home' } }),
}));

const mockStartDirect = jest.fn();
const mockSearchGifs = jest.fn();
jest.mock('../lib/chat-actions', () => ({
  startDirectConversation: (id: string) => mockStartDirect(id),
  searchGifs: (query: string, signal?: AbortSignal) => mockSearchGifs(query, signal),
  startGroupConversation: jest.fn(),
  setMessagePinned: jest.fn(),
  flagMessage: jest.fn(),
  moderatorDeleteMessage: jest.fn(),
}));

jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => true) }));

const channel = (ChatChannelId: string, Name: string, ChannelType: number, extra: Partial<ChatChannelResultData> = {}): ChatChannelResultData => ({
  ChatChannelId,
  Name,
  ChannelType,
  IsArchived: false,
  IsLocked: false,
  LastMessageSeq: 0,
  CreatedOn: '2026-10-30T10:00:00Z',
  UnreadCount: 0,
  NotificationPreference: 0,
  MyLastReadSeq: 0,
  ...extra,
});
const message = (id: string, extra: Partial<ChatMessageResultData> = {}): ChatMessageResultData => ({
  ChatMessageId: id,
  ChatChannelId: 'c1',
  MessageSeq: 1,
  SenderParticipantType: 0,
  SenderUserId: 'other',
  Body: `Message ${id}`,
  MessageType: 0,
  Priority: 0,
  ThreadReplyCount: 0,
  AlsoSendToChannel: false,
  SentOn: '2026-10-31T10:00:00Z',
  Reactions: [],
  Attachments: [],
  ...extra,
});

const setActiveChatChannel = jest.fn(async () => undefined);
const sendMessage = jest.fn(async () => ({ outcome: 'queued' as const, id: 'evt-1' }));

const enableChat = (enabled = true) => featureFlagsStore.setState({ flags: { 'Chat.System': { enabled } }, isLoaded: true });

beforeEach(() => {
  mockCapabilities.realtime.chatHub = true;
  enableChat();
  (router.push as jest.Mock).mockClear();
  setActiveChatChannel.mockClear();
  sendMessage.mockClear();
  mockSearchGifs.mockReset();
  useToastStore.getState().clearToasts();
  useAuthStore.setState({ userId: 'me', accessToken: 'tok' });
  setDataApiContext({ http: { getBaseUrl: () => 'https://api.test/api/v4' } } as unknown as ApiContext);
  securityStore.setState({ rights: { IsAdmin: false } as DepartmentRightsResultData });
  useRealtimeStore.setState({ setActiveChatChannel, activeChatChannel: null });
  // Focus = mount, blur = unmount (expo-router's focus effect without a navigator).
  (useFocusEffect as jest.Mock).mockImplementation((effect: () => void | (() => void)) => React.useEffect(effect, [effect]));
  useChatStore.setState({
    channels: [channel('c1', 'Engine 1 crew', ChatChannelType.AdHocGroup, { UnreadCount: 3 }), channel('d1', 'Pat Lee', ChatChannelType.DirectMessage), channel('i1', 'Structure Fire', ChatChannelType.Incident)],
    messagesByChannel: { c1: [message('m1'), message('m2', { MessageSeq: 2, SenderUserId: 'me' })] },
    fetchChannels: jest.fn(async () => undefined),
    loadInitialMessages: jest.fn(async () => undefined),
    fetchMembers: jest.fn(async () => undefined),
    markChannelRead: jest.fn(async () => undefined),
    loadOlderMessages: jest.fn(async () => undefined),
    sendMessage,
  });
});

describe('chat format', () => {
  it('groups channels into sections and recognises own messages (as user or as unit)', () => {
    expect(groupChannels(useChatStore.getState().channels).map((group) => group.section)).toEqual(['direct', 'channels', 'incidents']);
    // The assistant is pinned above the sections, not listed in one.
    const bot = channel('b1', 'Assistant', ChatChannelType.Chatbot, { UnreadCount: 2 });
    expect(groupChannels([...useChatStore.getState().channels, bot]).map((group) => group.section)).toEqual(['direct', 'channels', 'incidents']);
    expect(assistantChannelOf([...useChatStore.getState().channels, bot])).toBe(bot);
    expect(assistantChannelOf(useChatStore.getState().channels)).toBeNull();
    expect(isOwnMessage(message('x', { SenderUserId: 'me' }), 'me', null)).toBe(true);
    expect(isOwnMessage(message('x', { SenderParticipantType: 1, SenderUnitId: 7, SenderUserId: 'me' }), 'me', 7)).toBe(true);
    expect(isOwnMessage(message('x', { SenderParticipantType: 1, SenderUnitId: 8 }), 'me', 7)).toBe(false);
  });

  it('reads GIF metadata in the nested wire form and the legacy flat form, https only', () => {
    const built = buildGifMetadata({ GifUrl: 'https://media.giphy.com/a.gif', PreviewUrl: 'https://media.giphy.com/a-s.gif', Width: 480, Height: 270 });
    expect(JSON.parse(built)).toEqual({ gif: { url: 'https://media.giphy.com/a.gif', previewUrl: 'https://media.giphy.com/a-s.gif', width: 480, height: 270 } });
    expect(parseGifMetadata(built)).toEqual({ GifUrl: 'https://media.giphy.com/a.gif', PreviewUrl: 'https://media.giphy.com/a-s.gif', Width: 480, Height: 270, Title: undefined });
    expect(parseGifMetadata(JSON.stringify({ GifUrl: 'https://media.tenor.com/b.gif', Title: 'Hello' }))).toEqual(expect.objectContaining({ GifUrl: 'https://media.tenor.com/b.gif', Title: 'Hello' }));
    expect(parseGifMetadata(JSON.stringify({ gif: { url: 'http://media.giphy.com/a.gif' } }))).toBeNull();
    expect(parseGifMetadata(JSON.stringify({ gif: { url: 'javascript:alert(1)' } }))).toBeNull();
    expect(parseGifMetadata(JSON.stringify({ gif: { url: 'https://media.giphy.com/a.gif', previewUrl: 'http://x/y.gif' } }))?.PreviewUrl).toBeUndefined();
    expect(parseGifMetadata('not json')).toBeNull();
    expect(parseGifMetadata(null)).toBeNull();
  });
});

describe('MessageBubble', () => {
  const gifMessage = (extra: Partial<ChatMessageResultData> = {}) =>
    message('g1', { MessageType: ChatMessageType.Gif, Body: 'Tom Hanks Hello GIF', MetadataJson: JSON.stringify({ gif: { url: 'https://media.giphy.com/hello.gif', width: 400, height: 200 } }), ...extra });

  it('renders a GIF message as the animated image, not its title', async () => {
    await render(<MessageBubble message={gifMessage()} isOwn={false} showSender />);
    const image = screen.getByTestId('chat-message-g1-gif');
    expect(image.props.source).toEqual(expect.objectContaining({ uri: 'https://media.giphy.com/hello.gif' }));
    expect(image.props.accessibilityLabel).toBe('Tom Hanks Hello GIF');
    expect(screen.queryByText('Tom Hanks Hello GIF')).toBeNull();
  });

  it('falls back to the title when the GIF url is missing or unsafe, and shows deleted GIFs as deleted', async () => {
    const { rerender } = await render(<MessageBubble message={gifMessage({ MetadataJson: JSON.stringify({ gif: { url: 'http://insecure/a.gif' } }) })} isOwn={false} showSender />);
    expect(screen.queryByTestId('chat-message-g1-gif')).toBeNull();
    expect(screen.getByText('Tom Hanks Hello GIF')).toBeTruthy();

    await rerender(<MessageBubble message={gifMessage({ DeletedOn: '2026-10-31T11:00:00Z' })} isOwn={false} showSender />);
    expect(screen.queryByTestId('chat-message-g1-gif')).toBeNull();
    expect(screen.getByText('chat.message_deleted')).toBeTruthy();
  });

  const imageMessage = (extra: Partial<ChatMessageResultData> = {}) =>
    message('p1', { MessageType: ChatMessageType.Image, Body: 'Hydrant is blocked', Attachments: [{ ChatAttachmentId: 'att-1', FileName: 'photo.jpg', ContentType: 'image/jpeg', Size: 1024 }], ...extra });

  it('renders an image message as its authenticated thumbnail with the caption, and opens it on tap', async () => {
    const onOpenImage = jest.fn();
    await render(<MessageBubble message={imageMessage()} isOwn={false} showSender onOpenImage={onOpenImage} />);
    expect(screen.getByTestId('chat-message-p1-image-content').props.source).toEqual(
      expect.objectContaining({ uri: 'https://api.test/api/v4/Chat/GetAttachmentThumbnail?attachmentId=att-1', headers: { Authorization: 'Bearer tok' } })
    );
    expect(screen.getByText('Hydrant is blocked')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('chat-message-p1-image'));
    expect(onOpenImage).toHaveBeenCalledWith(expect.objectContaining({ ChatMessageId: 'p1' }));
  });

  it('shows a placeholder while the attachment has not arrived, and when the picture fails to load', async () => {
    const { rerender } = await render(<MessageBubble message={imageMessage({ Attachments: [], Body: '' })} isOwn={false} showSender />);
    expect(screen.getByTestId('chat-message-p1-image-unavailable')).toHaveTextContent('chat.image');

    await rerender(<MessageBubble message={imageMessage()} isOwn={false} showSender />);
    await fireEvent(screen.getByTestId('chat-message-p1-image-content'), 'error', { error: '401' });
    expect(screen.getByTestId('chat-message-p1-image-unavailable')).toHaveTextContent('chat.image_unavailable');

    // A rotated token is a new source: the picture is retried.
    await act(() => {
      useAuthStore.setState({ accessToken: 'tok-2' });
    });
    expect(screen.getByTestId('chat-message-p1-image-content').props.source).toEqual(expect.objectContaining({ headers: { Authorization: 'Bearer tok-2' } }));
  });
});

describe('ChatGate', () => {
  it('redirects home when the department has Chat.System off', async () => {
    enableChat(false);
    await render(
      <ChatGate>
        <Text>chat</Text>
      </ChatGate>
    );
    expect(screen.getByTestId('redirect')).toHaveTextContent('/home');
    expect(screen.queryByText('chat')).toBeNull();
  });

  it('redirects home when the variant has no chat hub', async () => {
    mockCapabilities.realtime.chatHub = false;
    await render(
      <ChatGate>
        <Text>chat</Text>
      </ChatGate>
    );
    expect(screen.getByTestId('redirect')).toBeTruthy();
  });

  it('waits while flags are still loading, then renders chat', async () => {
    featureFlagsStore.setState({ flags: {}, isLoaded: false });
    const { rerender } = await render(
      <ChatGate>
        <Text>chat</Text>
      </ChatGate>
    );
    expect(screen.getByTestId('chat-gate-loading')).toBeTruthy();
    await act(() => {
      enableChat();
    });
    await rerender(
      <ChatGate>
        <Text>chat</Text>
      </ChatGate>
    );
    expect(screen.getByText('chat')).toBeTruthy();
  });
});

describe('ChatChannelsScreen', () => {
  it('lists sections with unread counts and opens a conversation', async () => {
    await render(<ChatChannelsScreen />);
    expect(screen.getByTestId('chat-channel-c1-unread')).toHaveTextContent('3');
    await fireEvent.press(screen.getByTestId('chat-channel-c1'));
    expect(router.push).toHaveBeenCalledWith('/chat/c1');
  });

  // Every chat app reaches the assistant from Chat, before Core has made its channel and with no menu entry of its own.
  it('pins the assistant first and opens its screen', async () => {
    await render(<ChatChannelsScreen />);
    expect(screen.getByTestId('chat-assistant')).toHaveAccessibleName('chatbot.title');
    expect(screen.queryByTestId('chat-assistant-unread')).toBeNull();
    await fireEvent.press(screen.getByTestId('chat-assistant'));
    expect(router.push).toHaveBeenCalledWith('/chatbot');
  });

  it('shows the assistant channel’s unread count on the pinned entry, not as a list row', async () => {
    useChatStore.setState({ channels: [...useChatStore.getState().channels, channel('b1', 'Assistant', ChatChannelType.Chatbot, { UnreadCount: 2 })] });
    await render(<ChatChannelsScreen />);
    expect(screen.getByTestId('chat-assistant-unread')).toHaveTextContent('2');
    expect(screen.queryByTestId('chat-channel-b1')).toBeNull();
  });

  it('keeps the assistant reachable when there are no conversations', async () => {
    useChatStore.setState({ channels: [] });
    await render(<ChatChannelsScreen />);
    expect(screen.getByTestId('chat-empty')).toBeTruthy();
    expect(screen.getByTestId('chat-assistant')).toBeTruthy();
  });
});

describe('ChatConversationScreen', () => {
  it('marks the channel active on focus and clears it on blur', async () => {
    const { unmount } = await render(<ChatConversationScreen channelId="c1" />);
    expect(setActiveChatChannel).toHaveBeenCalledWith('c1', null);
    useRealtimeStore.setState({ activeChatChannel: { channelId: 'c1', asUnitId: null } });
    await unmount();
    expect(setActiveChatChannel).toHaveBeenLastCalledWith(null);
  });

  it('joins the channel group (as the unit when acting as one) and rejoins after a chat hub reconnect', async () => {
    const invoke = jest.spyOn(signalRService, 'invoke').mockResolvedValue(undefined);
    try {
      await render(
        <ChatIdentityProvider asUnitId={7}>
          <ChatConversationScreen channelId="c1" />
        </ChatIdentityProvider>
      );
      expect(invoke).toHaveBeenCalledWith(expect.any(String), 'JoinChannel', 'c1', 7);
      invoke.mockClear();
      await act(() => emitRealtimeEvent('chatHubJoined', { hub: 'chat', rejoin: true, at: 1 }));
      expect(invoke).toHaveBeenCalledWith(expect.any(String), 'JoinChannel', 'c1', 7);
    } finally {
      invoke.mockRestore();
    }
  });

  it('fetches new messages for the conversation receiving a realtime event', async () => {
    const loadNewerMessages = jest.fn(async () => undefined);
    useChatStore.setState({ loadNewerMessages });
    await render(<ChatConversationScreen channelId="c1" />);

    await act(() => emitRealtimeEvent('chatMessageReceived', JSON.stringify({ ChatChannelId: 'd1' })));
    expect(loadNewerMessages).not.toHaveBeenCalled();

    await act(() => emitRealtimeEvent('chatMessageReceived', JSON.stringify({ ChatChannelId: 'c1' })));
    expect(loadNewerMessages).toHaveBeenCalledWith('c1');
  });

  it('passes the unit identity to SetActiveChannel and sends (Unit)', async () => {
    await render(
      <ChatIdentityProvider asUnitId={7}>
        <ChatConversationScreen channelId="c1" />
      </ChatIdentityProvider>
    );
    expect(setActiveChatChannel).toHaveBeenCalledWith('c1', 7);

    await fireEvent.changeText(screen.getByTestId('chat-composer-input'), 'On scene');
    await fireEvent.press(screen.getByTestId('chat-composer-send'));
    await waitFor(() => expect(sendMessage).toHaveBeenCalledWith({ channelId: 'c1', body: 'On scene', priority: 0, asUnitId: 7 }));
  });

  it('queues a message offline without an error and clears the composer; urgent sets the priority', async () => {
    await render(<ChatConversationScreen channelId="c1" />);

    await fireEvent.press(screen.getByTestId('chat-composer-urgent'));
    await fireEvent.changeText(screen.getByTestId('chat-composer-input'), '  Mayday  ');
    await fireEvent.press(screen.getByTestId('chat-composer-send'));

    await waitFor(() => expect(sendMessage).toHaveBeenCalledWith({ channelId: 'c1', body: 'Mayday', priority: 1 }));
    expect(screen.getByTestId('chat-composer-input').props.value).toBe('');
    expect(useToastStore.getState().toasts).toHaveLength(0);
    expect(useChatStore.getState().markChannelRead).toHaveBeenCalledWith('c1', undefined);
  });

  it('searches GIFs from the composer and sends the picked one as a GIF message', async () => {
    mockSearchGifs.mockResolvedValueOnce([
      { Id: 'gif-1', Title: 'Thumbs up', PreviewUrl: 'https://media.giphy.com/up-s.gif', GifUrl: 'https://media.giphy.com/up.gif', Width: 320, Height: 240 },
      { Id: 'gif-2', Title: 'Unsafe', PreviewUrl: 'http://evil.example/x.gif', GifUrl: 'http://evil.example/x.gif', Width: 10, Height: 10 },
    ]);
    await render(
      <ChatIdentityProvider asUnitId={7}>
        <ChatConversationScreen channelId="c1" />
      </ChatIdentityProvider>
    );
    const q = { includeHiddenElements: true } as const;

    await fireEvent.press(screen.getByTestId('chat-composer-gif'));
    await waitFor(() => expect(screen.getByTestId('gif-picker-item-gif-1', q)).toBeTruthy());
    expect(mockSearchGifs).toHaveBeenCalledWith('', expect.anything());
    expect(screen.queryByTestId('gif-picker-item-gif-2', q)).toBeNull();

    await fireEvent.press(screen.getByTestId('gif-picker-item-gif-1', q));
    await waitFor(() =>
      expect(sendMessage).toHaveBeenCalledWith({
        channelId: 'c1',
        body: 'Thumbs up',
        messageType: ChatMessageType.Gif,
        priority: 0,
        metadataJson: JSON.stringify({ gif: { url: 'https://media.giphy.com/up.gif', previewUrl: 'https://media.giphy.com/up-s.gif', width: 320, height: 240 } }),
        asUnitId: 7,
      })
    );
  });

  it('opens an image message full screen and closes it', async () => {
    useChatStore.setState({
      messagesByChannel: { c1: [message('p1', { MessageType: ChatMessageType.Image, Body: '', Attachments: [{ ChatAttachmentId: 'att-1', FileName: 'photo.jpg', ContentType: 'image/jpeg', Size: 1024 }] })] },
    });
    await render(<ChatConversationScreen channelId="c1" />);
    expect(screen.queryByTestId('chat-image-viewer-image')).toBeNull();

    await fireEvent.press(screen.getByTestId('chat-message-p1-image'));
    expect(screen.getByTestId('chat-image-viewer-image').props.source).toEqual(expect.objectContaining({ uri: 'https://api.test/api/v4/Chat/GetAttachment?attachmentId=att-1', headers: { Authorization: 'Bearer tok' } }));

    await fireEvent.press(screen.getByTestId('chat-image-viewer-close'));
    expect(screen.queryByTestId('chat-image-viewer-image')).toBeNull();
  });

  it('shows the empty state when GIF search fails', async () => {
    mockSearchGifs.mockRejectedValueOnce(new Error('offline'));
    await render(<ChatConversationScreen channelId="c1" />);
    await fireEvent.press(screen.getByTestId('chat-composer-gif'));
    await waitFor(() => expect(screen.getByTestId('gif-picker-empty', { includeHiddenElements: true })).toBeTruthy());
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('rejects an unsafe channel id', async () => {
    await render(<ChatConversationScreen channelId="../settings" />);
    expect(screen.getByTestId('chat-conversation-invalid')).toBeTruthy();
    expect(setActiveChatChannel).not.toHaveBeenCalled();
  });
});

describe('MessageActionsSheet', () => {
  const q = { includeHiddenElements: true } as const;
  // The actionsheet portals into the overlay host the app's GluestackUIProvider mounts.
  const wrapper = ({ children }: { children?: React.ReactNode }) => <GluestackUIProvider>{children}</GluestackUIProvider>;

  it('offers edit and delete on own messages, report on others', async () => {
    const handlers = { onReact: jest.fn(), onCopy: jest.fn(), onEdit: jest.fn(), onDelete: jest.fn(), onFlag: jest.fn() };
    const { rerender } = await render(<MessageActionsSheet message={message('m2', { SenderUserId: 'me' })} isOpen onClose={jest.fn()} isOwn isModerator={false} {...handlers} />, { wrapper });
    expect(screen.getByTestId('message-action-edit', q)).toBeTruthy();
    expect(screen.queryByTestId('message-action-flag', q)).toBeNull();

    await rerender(<MessageActionsSheet message={message('m1')} isOpen onClose={jest.fn()} isOwn={false} isModerator={false} {...handlers} />);
    expect(screen.queryByTestId('message-action-edit', q)).toBeNull();
    await fireEvent.press(screen.getByTestId('message-action-flag', q));
    await fireEvent.press(screen.getByTestId('message-flag-3', q));
    expect(handlers.onFlag).toHaveBeenCalledWith(expect.objectContaining({ ChatMessageId: 'm1' }), 3);
  });

  it('removes reactions, edits and deletes in a frozen (closed incident) chat', async () => {
    await render(<MessageActionsSheet message={message('m2')} isOpen onClose={jest.fn()} isOwn isModerator frozen onReact={jest.fn()} onEdit={jest.fn()} onDelete={jest.fn()} onModeratorDelete={jest.fn()} />, {
      wrapper,
    });
    expect(screen.queryByTestId('message-react-👍', q)).toBeNull();
    expect(screen.queryByTestId('message-action-edit', q)).toBeNull();
    expect(screen.getByTestId('message-action-moderator-delete', q)).toBeTruthy();
  });
});

describe('NewConversationSheet', () => {
  it('starts a direct message with one selected person', async () => {
    usePersonnelStore.setState({ personnel: [{ UserId: 'u2', FirstName: 'Sam', LastName: 'Lee' } as PersonnelInfoResultData, { UserId: 'me', FirstName: 'Me' } as PersonnelInfoResultData] });
    mockStartDirect.mockResolvedValueOnce(channel('d2', 'Sam Lee', ChatChannelType.DirectMessage));
    const onCreated = jest.fn();
    await render(<NewConversationSheet isOpen onClose={jest.fn()} onCreated={onCreated} />);
    const q = { includeHiddenElements: true } as const;

    expect(screen.queryByTestId('new-conversation-person-me', q)).toBeNull();
    await fireEvent.press(screen.getByTestId('new-conversation-person-u2', q));
    await fireEvent.press(screen.getByTestId('new-conversation-create', q));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ ChatChannelId: 'd2' })));
    expect(mockStartDirect).toHaveBeenCalledWith('u2');
  });
});
