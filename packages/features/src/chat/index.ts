// @resgrid/features/chat — conversations (R composer + I message actions + D new conversation) and the assistant,
// gated by the chat hub capability and the Chat.System flag (ChatGate), SetActiveChannel while a conversation has focus.
export { type ChatIdentity, ChatIdentityProvider, useChatIdentity } from './chat-identity';
export { ChannelListItem, type ChannelListItemProps } from './components/channel-list-item';
export { ChatGate, type ChatGateProps } from './components/chat-gate';
export { MessageActionsSheet, type MessageActionsSheetProps, QUICK_REACTIONS } from './components/message-actions-sheet';
export { MessageBubble, type MessageBubbleProps } from './components/message-bubble';
export { MessageComposer, type MessageComposerProps } from './components/message-composer';
export { NewConversationSheet, type NewConversationSheetProps } from './components/new-conversation-sheet';
export { TypingDots, type TypingDotsProps } from './components/typing-dots';
export { useActiveChatChannel } from './hooks/use-active-chat-channel';
export { type ChatAvailability, useChatAvailability } from './hooks/use-chat-availability';
export { JOIN_CHAT_CHANNEL_METHOD, joinChatChannel, useJoinedChatChannel } from './hooks/use-joined-chat-channel';
export { flagMessage, moderatorDeleteMessage, setMessagePinned, startDirectConversation, startGroupConversation } from './lib/chat-actions';
export * from './lib/chat-format';
export { chatNav, type FeatureNavEntry } from './nav';
export { CHAT_ROUTE_PATTERNS, chatRoutes } from './routes';
export { default as ChatChannelsScreen } from './screens/chat-channels';
export { default as ChatConversationScreen, type ChatConversationScreenProps } from './screens/chat-conversation';
export { default as ChatbotScreen, type ChatbotScreenProps } from './screens/chatbot';
