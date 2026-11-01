import '../../status/__tests__/test-setup';

import { featureFlagsStore, securityStore, useAuthStore } from '@resgrid/auth';
import { useChatStore, usePersonnelStore } from '@resgrid/data';
import { type ChatChannelResultData, ChatChannelType, type ChatMessageResultData, type DepartmentRightsResultData, type PersonnelInfoResultData } from '@resgrid/models';
import { emitRealtimeEvent, signalRService, useRealtimeStore } from '@resgrid/realtime';
import { GluestackUIProvider, useToastStore } from '@resgrid/ui';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router, useFocusEffect } from 'expo-router';
import React from 'react';
import { Text } from 'react-native';

import { ChatIdentityProvider } from '../chat-identity';
import { ChatGate } from '../components/chat-gate';
import { MessageActionsSheet } from '../components/message-actions-sheet';
import { NewConversationSheet } from '../components/new-conversation-sheet';
import { groupChannels, isOwnMessage } from '../lib/chat-format';
import ChatChannelsScreen from '../screens/chat-channels';
import ChatConversationScreen from '../screens/chat-conversation';

const mockCapabilities = { realtime: { chatHub: true, hubWatchdog: false } };
jest.mock('@resgrid/config', () => ({
  ...jest.requireActual('@resgrid/config'),
  useCapability: (key: keyof typeof mockCapabilities) => mockCapabilities[key],
  getActiveVariant: () => ({ shell: { homeRoute: '/home' } }),
}));

const mockStartDirect = jest.fn();
jest.mock('../lib/chat-actions', () => ({
  startDirectConversation: (id: string) => mockStartDirect(id),
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
  useToastStore.getState().clearToasts();
  useAuthStore.setState({ userId: 'me' });
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
    expect(isOwnMessage(message('x', { SenderUserId: 'me' }), 'me', null)).toBe(true);
    expect(isOwnMessage(message('x', { SenderParticipantType: 1, SenderUnitId: 7, SenderUserId: 'me' }), 'me', 7)).toBe(true);
    expect(isOwnMessage(message('x', { SenderParticipantType: 1, SenderUnitId: 8 }), 'me', 7)).toBe(false);
  });
});

describe('ChatGate', () => {
  it('redirects home when the department has Chat.System off', () => {
    enableChat(false);
    render(
      <ChatGate>
        <Text>chat</Text>
      </ChatGate>
    );
    expect(screen.getByTestId('redirect')).toHaveTextContent('/home');
    expect(screen.queryByText('chat')).toBeNull();
  });

  it('redirects home when the variant has no chat hub', () => {
    mockCapabilities.realtime.chatHub = false;
    render(
      <ChatGate>
        <Text>chat</Text>
      </ChatGate>
    );
    expect(screen.getByTestId('redirect')).toBeTruthy();
  });

  it('waits while flags are still loading, then renders chat', () => {
    featureFlagsStore.setState({ flags: {}, isLoaded: false });
    const { rerender } = render(
      <ChatGate>
        <Text>chat</Text>
      </ChatGate>
    );
    expect(screen.getByTestId('chat-gate-loading')).toBeTruthy();
    act(() => enableChat());
    rerender(
      <ChatGate>
        <Text>chat</Text>
      </ChatGate>
    );
    expect(screen.getByText('chat')).toBeTruthy();
  });
});

describe('ChatChannelsScreen', () => {
  it('lists sections with unread counts and opens a conversation', () => {
    render(<ChatChannelsScreen />);
    expect(screen.getByTestId('chat-channel-c1-unread')).toHaveTextContent('3');
    fireEvent.press(screen.getByTestId('chat-channel-c1'));
    expect(router.push).toHaveBeenCalledWith('/chat/c1');
  });
});

describe('ChatConversationScreen', () => {
  it('marks the channel active on focus and clears it on blur', () => {
    const { unmount } = render(<ChatConversationScreen channelId="c1" />);
    expect(setActiveChatChannel).toHaveBeenCalledWith('c1', null);
    useRealtimeStore.setState({ activeChatChannel: { channelId: 'c1', asUnitId: null } });
    unmount();
    expect(setActiveChatChannel).toHaveBeenLastCalledWith(null);
  });

  it('joins the channel group (as the unit when acting as one) and rejoins after a chat hub reconnect', () => {
    const invoke = jest.spyOn(signalRService, 'invoke').mockResolvedValue(undefined);
    try {
      render(
        <ChatIdentityProvider asUnitId={7}>
          <ChatConversationScreen channelId="c1" />
        </ChatIdentityProvider>
      );
      expect(invoke).toHaveBeenCalledWith(expect.any(String), 'JoinChannel', 'c1', 7);
      invoke.mockClear();
      act(() => emitRealtimeEvent('chatHubJoined', { hub: 'chat', rejoin: true, at: 1 }));
      expect(invoke).toHaveBeenCalledWith(expect.any(String), 'JoinChannel', 'c1', 7);
    } finally {
      invoke.mockRestore();
    }
  });

  it('passes the unit identity to SetActiveChannel and sends (Unit)', async () => {
    render(
      <ChatIdentityProvider asUnitId={7}>
        <ChatConversationScreen channelId="c1" />
      </ChatIdentityProvider>
    );
    expect(setActiveChatChannel).toHaveBeenCalledWith('c1', 7);

    fireEvent.changeText(screen.getByTestId('chat-composer-input'), 'On scene');
    fireEvent.press(screen.getByTestId('chat-composer-send'));
    await waitFor(() => expect(sendMessage).toHaveBeenCalledWith({ channelId: 'c1', body: 'On scene', priority: 0, asUnitId: 7 }));
  });

  it('queues a message offline without an error and clears the composer; urgent sets the priority', async () => {
    render(<ChatConversationScreen channelId="c1" />);

    fireEvent.press(screen.getByTestId('chat-composer-urgent'));
    fireEvent.changeText(screen.getByTestId('chat-composer-input'), '  Mayday  ');
    fireEvent.press(screen.getByTestId('chat-composer-send'));

    await waitFor(() => expect(sendMessage).toHaveBeenCalledWith({ channelId: 'c1', body: 'Mayday', priority: 1 }));
    expect(screen.getByTestId('chat-composer-input').props.value).toBe('');
    expect(useToastStore.getState().toasts).toHaveLength(0);
    expect(useChatStore.getState().markChannelRead).toHaveBeenCalledWith('c1', undefined);
  });

  it('rejects an unsafe channel id', () => {
    render(<ChatConversationScreen channelId="../settings" />);
    expect(screen.getByTestId('chat-conversation-invalid')).toBeTruthy();
    expect(setActiveChatChannel).not.toHaveBeenCalled();
  });
});

describe('MessageActionsSheet', () => {
  const q = { includeHiddenElements: true } as const;
  // The actionsheet portals into the overlay host the app's GluestackUIProvider mounts.
  const wrapper = ({ children }: { children?: React.ReactNode }) => <GluestackUIProvider>{children}</GluestackUIProvider>;

  it('offers edit and delete on own messages, report on others', () => {
    const handlers = { onReact: jest.fn(), onCopy: jest.fn(), onEdit: jest.fn(), onDelete: jest.fn(), onFlag: jest.fn() };
    const { rerender } = render(<MessageActionsSheet message={message('m2', { SenderUserId: 'me' })} isOpen onClose={jest.fn()} isOwn isModerator={false} {...handlers} />, { wrapper });
    expect(screen.getByTestId('message-action-edit', q)).toBeTruthy();
    expect(screen.queryByTestId('message-action-flag', q)).toBeNull();

    rerender(<MessageActionsSheet message={message('m1')} isOpen onClose={jest.fn()} isOwn={false} isModerator={false} {...handlers} />);
    expect(screen.queryByTestId('message-action-edit', q)).toBeNull();
    fireEvent.press(screen.getByTestId('message-action-flag', q));
    fireEvent.press(screen.getByTestId('message-flag-3', q));
    expect(handlers.onFlag).toHaveBeenCalledWith(expect.objectContaining({ ChatMessageId: 'm1' }), 3);
  });

  it('removes reactions, edits and deletes in a frozen (closed incident) chat', () => {
    render(<MessageActionsSheet message={message('m2')} isOpen onClose={jest.fn()} isOwn isModerator frozen onReact={jest.fn()} onEdit={jest.fn()} onDelete={jest.fn()} onModeratorDelete={jest.fn()} />, { wrapper });
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
    render(<NewConversationSheet isOpen onClose={jest.fn()} onCreated={onCreated} />);
    const q = { includeHiddenElements: true } as const;

    expect(screen.queryByTestId('new-conversation-person-me', q)).toBeNull();
    fireEvent.press(screen.getByTestId('new-conversation-person-u2', q));
    fireEvent.press(screen.getByTestId('new-conversation-create', q));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ ChatChannelId: 'd2' })));
    expect(mockStartDirect).toHaveBeenCalledWith('u2');
  });
});
