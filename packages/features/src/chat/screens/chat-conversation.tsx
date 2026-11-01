import { useAuthStore, useSecurity } from '@resgrid/auth';
import { isSafeRouteId } from '@resgrid/core/utils/route-ids';
import { useChatStore } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import { ChatChannelType, ChatMessagePriority, type ChatMessageResultData } from '@resgrid/models';
import { BottomAnchoredKeyboardView, FlatList, Loading, ScreenHeader, useToast, View, ZeroState } from '@resgrid/ui';
import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import { MessagesSquare } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { useChatIdentity } from '../chat-identity';
import { ChatGate } from '../components/chat-gate';
import { MessageActionsSheet } from '../components/message-actions-sheet';
import { MessageBubble } from '../components/message-bubble';
import { MessageComposer } from '../components/message-composer';
import { useActiveChatChannel } from '../hooks/use-active-chat-channel';
import { useJoinedChatChannel } from '../hooks/use-joined-chat-channel';
import { flagMessage, moderatorDeleteMessage, setMessagePinned } from '../lib/chat-actions';
import { isOwnMessage, orderMessages } from '../lib/chat-format';

export interface ChatConversationScreenProps {
  channelId?: string;
  /** Chrome below the screen the keyboard already covers (a bottom tab bar), in dp. */
  keyboardOffset?: number;
}

const NO_MESSAGES: ChatMessageResultData[] = [];

function ChatConversationContent({ channelId, keyboardOffset = 0 }: { channelId: string; keyboardOffset?: number }) {
  const { t } = useTranslation();
  const toast = useToast();
  const { asUnitId } = useChatIdentity();
  const userId = useAuthStore((state) => state.userId);
  const { isUserDepartmentAdmin } = useSecurity();
  const channel = useChatStore((state) => state.channels.find((item) => item.ChatChannelId === channelId));
  const messages = useChatStore((state) => state.messagesByChannel[channelId] ?? NO_MESSAGES);
  const isLoading = useChatStore((state) => state.loading.messages === true);
  const [resolveAttempted, setResolveAttempted] = useState(false);
  const [actionsFor, setActionsFor] = useState<ChatMessageResultData | null>(null);
  const [editing, setEditing] = useState<ChatMessageResultData | null>(null);

  // Deep links can arrive before the channel list: resolve once, then show the generic screen for unknown ids.
  useEffect(() => {
    if (channel || resolveAttempted) return;
    void useChatStore
      .getState()
      .fetchChannels(asUnitId != null ? { activeUnitId: asUnitId } : undefined)
      .finally(() => setResolveAttempted(true));
  }, [asUnitId, channel, resolveAttempted]);

  const isChatbot = channel?.ChannelType === ChatChannelType.Chatbot;
  const isResolved = !!channel || resolveAttempted;

  useActiveChatChannel(channelId, asUnitId, isResolved && !isChatbot);
  // Core sends chatMessageReceived only to connections in the channel's group.
  useJoinedChatChannel(channelId, asUnitId, isResolved && !isChatbot);

  useEffect(() => {
    if (!isResolved || isChatbot) return;
    void useChatStore.getState().loadInitialMessages(channelId);
    void useChatStore.getState().fetchMembers(channelId);
  }, [channelId, isChatbot, isResolved]);

  const ordered = useMemo(() => orderMessages(messages), [messages]);
  const newestSeq = ordered.length > 0 ? ordered[ordered.length - 1].MessageSeq : 0;
  useEffect(() => {
    if (isResolved && !isChatbot && newestSeq > 0) void useChatStore.getState().markChannelRead(channelId, asUnitId ?? undefined);
  }, [asUnitId, channelId, isChatbot, isResolved, newestSeq]);

  const send = useCallback(
    async (body: string, urgent: boolean) => {
      if (editing) {
        const ok = await useChatStore.getState().editMessage(editing.ChatMessageId, channelId, body);
        setEditing(null);
        if (!ok) toast.error(t('chat.edit_failed'));
        return;
      }
      const result = await useChatStore.getState().sendMessage({ channelId, body, priority: urgent ? ChatMessagePriority.Urgent : ChatMessagePriority.Normal, ...(asUnitId != null ? { asUnitId } : {}) });
      if (result.outcome === 'rejected') toast.error(t('chat.send_failed'));
    },
    [asUnitId, channelId, editing, t, toast]
  );

  const run = useCallback(
    async (action: () => Promise<unknown>, failureKey: string) => {
      try {
        const ok = await action();
        if (ok === false) toast.error(t(failureKey));
      } catch {
        toast.error(t(failureKey));
      }
    },
    [t, toast]
  );

  const back = () => (router.canGoBack() ? router.back() : router.replace('/chat'));
  const isFrozen = !!channel?.IsArchived;
  const isReadOnly = isFrozen || !!channel?.IsLocked;
  const showSender = channel?.ChannelType !== ChatChannelType.DirectMessage;

  if (!isResolved) return <Loading testID="chat-conversation-loading" />;

  return (
    <View className="flex-1 bg-background-50" testID="chat-conversation-screen">
      <ScreenHeader title={channel?.Name ?? t('chat.title')} onBack={back} />
      <BottomAnchoredKeyboardView offset={keyboardOffset}>
        {isLoading && ordered.length === 0 ? (
          <Loading />
        ) : ordered.length === 0 ? (
          <ZeroState icon={MessagesSquare} heading={t('chat.no_messages')} viewClassName="flex-1 p-6" testID="chat-conversation-empty" />
        ) : (
          <FlatList
            data={ordered}
            keyExtractor={(message) => message.ClientMessageId || message.ChatMessageId}
            renderItem={({ item }) => <MessageBubble message={item} isOwn={isOwnMessage(item, userId, asUnitId)} showSender={showSender} onLongPress={setActionsFor} />}
            maintainVisibleContentPosition={{ startRenderingFromBottom: true, autoscrollToBottomThreshold: 0.2 }}
            onStartReached={() => void useChatStore.getState().loadOlderMessages(channelId)}
            contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 8 }}
            testID="chat-message-list"
          />
        )}
        <MessageComposer
          key={editing?.ChatMessageId ?? 'new'}
          onSend={(body, urgent) => void send(body, urgent)}
          disabled={isReadOnly}
          placeholder={isReadOnly ? t('chat.read_only') : undefined}
          initialValue={editing?.Body ?? ''}
          allowUrgent={!editing}
          {...(editing ? { onCancelEdit: () => setEditing(null) } : {})}
        />
      </BottomAnchoredKeyboardView>
      <MessageActionsSheet
        message={actionsFor}
        isOpen={!!actionsFor}
        onClose={() => setActionsFor(null)}
        isOwn={actionsFor ? isOwnMessage(actionsFor, userId, asUnitId) : false}
        isModerator={isUserDepartmentAdmin}
        frozen={isFrozen}
        onReact={(message, emoji) => {
          const mine = (message.Reactions ?? []).some((reaction) => reaction.Emoji === emoji && (asUnitId != null ? reaction.UnitId === asUnitId : !!userId && reaction.UserId === userId));
          void run(() => (mine ? useChatStore.getState().removeReaction(message.ChatMessageId, emoji) : useChatStore.getState().addReaction(message.ChatMessageId, emoji)), 'chat.reaction_failed');
        }}
        onCopy={(message) => void Clipboard.setStringAsync(message.Body ?? '').then(() => toast.success(t('chat.copied')))}
        onEdit={setEditing}
        onDelete={(message) => void run(() => useChatStore.getState().deleteMessage(message.ChatMessageId, channelId), 'chat.delete_failed')}
        onTogglePin={(message, pinned) => void run(() => setMessagePinned(message.ChatMessageId, pinned), 'chat.pin_failed')}
        onFlag={(message, reason) => void run(() => flagMessage(message.ChatMessageId, reason), 'chat.flag_failed')}
        onModeratorDelete={(message) => void run(() => moderatorDeleteMessage(message.ChatMessageId), 'chat.delete_failed')}
      />
    </View>
  );
}

/**
 * One conversation at `/chat/[channelId]` (R composer + I message actions): messages bottom-anchored, the composer in a
 * BottomAnchoredKeyboardView, offline-capable sends through the outbox, read marks, and `SetActiveChannel` while focused.
 */
export default function ChatConversationScreen({ channelId: channelIdProp, keyboardOffset }: ChatConversationScreenProps) {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ channelId?: string | string[] }>();
  const raw = channelIdProp ?? (Array.isArray(params.channelId) ? params.channelId[0] : params.channelId);
  const channelId = isSafeRouteId(raw) ? raw : null;
  return (
    <ChatGate>
      {channelId ? (
        <ChatConversationContent channelId={channelId} keyboardOffset={keyboardOffset} />
      ) : (
        <View className="flex-1 bg-background-50" testID="chat-conversation-screen">
          <ScreenHeader title={t('chat.title')} onBack={() => router.replace('/chat')} />
          <ZeroState icon={MessagesSquare} heading={t('chat.conversation_not_found')} testID="chat-conversation-invalid" />
        </View>
      )}
    </ChatGate>
  );
}
