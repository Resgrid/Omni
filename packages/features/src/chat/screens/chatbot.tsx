import { useAuthStore, useSecurity } from '@resgrid/auth';
import { PENDING_SEQ_BASE, useChatStore } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import { type ChatMessageResultData } from '@resgrid/models';
import { useRealtimeEvent } from '@resgrid/realtime';
import { BottomAnchoredKeyboardView, Button, ButtonText, FlatList, HStack, Loading, Pressable, Text, useThemeColors, useToast, View, ZeroState } from '@resgrid/ui';
import * as Clipboard from 'expo-clipboard';
import { useFocusEffect } from 'expo-router';
import { RefreshCw, Sparkles } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { ChatGate } from '../components/chat-gate';
import { MessageActionsSheet } from '../components/message-actions-sheet';
import { MessageBubble } from '../components/message-bubble';
import { MessageComposer } from '../components/message-composer';
import { TypingDots } from '../components/typing-dots';
import { useActiveChatChannel } from '../hooks/use-active-chat-channel';
import { useJoinedChatChannel } from '../hooks/use-joined-chat-channel';
import { flagMessage, setMessagePinned } from '../lib/chat-actions';
import { isOwnMessage, orderMessages } from '../lib/chat-format';

export interface ChatbotScreenProps {
  /** Chrome below the screen the keyboard already covers (a bottom tab bar), in dp. */
  keyboardOffset?: number;
}

const NO_MESSAGES: ChatMessageResultData[] = [];
const ASSISTANT_ACCENT = '#7c3aed';
const ASSISTANT_ACCENT_DARK = '#d8b4fe';

/** The assistant always talks to the signed-in user: no unit identity on its channel, even in Unit. */
const NO_UNIT: number | null = null;

function ChatbotContent({ keyboardOffset = 0 }: ChatbotScreenProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const { isDark } = useThemeColors();
  const userId = useAuthStore((state) => state.userId);
  const { isUserDepartmentAdmin } = useSecurity();
  const channelId = useChatStore((state) => state.chatbotChannelId);
  const isTyping = useChatStore((state) => state.chatbotTyping);
  const initError = useChatStore((state) => state.errors.chatbot ?? null);
  const initFetchedAt = useChatStore((state) => state.fetchedAt.chatbot ?? 0);
  const messages = useChatStore((state) => (channelId ? (state.messagesByChannel[channelId] ?? NO_MESSAGES) : NO_MESSAGES));
  const isLoadingMessages = useChatStore((state) => state.loading.messages === true);
  const [actionsFor, setActionsFor] = useState<ChatMessageResultData | null>(null);
  const [isResetting, setIsResetting] = useState(false);

  // Every focus: (re)resolve the channel and pull its latest page — replies may have landed while away.
  useFocusEffect(
    useCallback(() => {
      void useChatStore.getState().initChatbot();
    }, [])
  );

  useActiveChatChannel(channelId, NO_UNIT, !!channelId);
  useJoinedChatChannel(channelId, NO_UNIT, !!channelId);

  // Core delivers replies as `chatMessageReceived` on the channel group; `chatbotMessageReceived` is handled too for
  // servers that emit it. The store ignores payloads for other channels.
  useRealtimeEvent('chatMessageReceived', (payload) => {
    useChatStore.getState().handleChatbotMessageReceived(payload);
  });
  useRealtimeEvent('chatbotMessageReceived', (payload) => {
    useChatStore.getState().handleChatbotMessageReceived(payload);
  });
  useRealtimeEvent('chatbotTyping', (payload) => useChatStore.getState().handleChatbotTyping(payload));
  // A new hub connection may have missed replies: backfill.
  useRealtimeEvent(
    'chatHubJoined',
    () => {
      if (channelId) void useChatStore.getState().loadNewerMessages(channelId);
    },
    !!channelId
  );

  const ordered = useMemo(() => orderMessages(messages), [messages]);
  const newestConfirmedSeq = useMemo(() => ordered.reduce((max, message) => (message.MessageSeq < PENDING_SEQ_BASE && message.MessageSeq > max ? message.MessageSeq : max), 0), [ordered]);
  useEffect(() => {
    if (channelId && newestConfirmedSeq > 0) void useChatStore.getState().markChannelRead(channelId);
  }, [channelId, newestConfirmedSeq]);

  const send = useCallback(
    async (body: string) => {
      const result = await useChatStore.getState().sendChatbotMessage(body);
      if (!result.ok && result.error) toast.error(t(result.error.code === 'forbidden' ? result.error.messageKey : 'chat.send_failed'));
    },
    [t, toast]
  );

  const retry = useCallback(
    (message: ChatMessageResultData) => {
      if (!message.ClientMessageId) return;
      void useChatStore
        .getState()
        .retryChatbotMessage(message.ClientMessageId)
        .then((result) => {
          if (!result.ok && result.error) toast.error(t(result.error.code === 'forbidden' ? result.error.messageKey : 'chat.send_failed'));
        });
    },
    [t, toast]
  );

  const startNewSession = useCallback(async () => {
    setIsResetting(true);
    const ok = await useChatStore.getState().newChatbotSession();
    setIsResetting(false);
    if (!ok) toast.error(t('chatbot.new_session_failed'));
  }, [t, toast]);

  const run = useCallback(
    async (action: () => Promise<unknown>, failureKey: string) => {
      try {
        await action();
      } catch {
        toast.error(t(failureKey));
      }
    },
    [t, toast]
  );

  if (!channelId) {
    const isUnavailable = initError ? initError.code === 'not_found' || initError.code === 'forbidden' : initFetchedAt > 0;
    if (!initError && !isUnavailable) return <Loading testID="chatbot-loading" />;
    return (
      <View className="flex-1 bg-background-50" testID="chatbot-screen">
        <ZeroState
          icon={Sparkles}
          iconColor={ASSISTANT_ACCENT}
          heading={t('chatbot.title')}
          description={isUnavailable ? t('chatbot.unavailable') : t('chatbot.load_failed')}
          testID={isUnavailable ? 'chatbot-unavailable' : 'chatbot-load-failed'}
        >
          {isUnavailable ? null : (
            <Button onPress={() => void useChatStore.getState().initChatbot()} className="mt-4" testID="chatbot-retry">
              <ButtonText>{t('common.retry')}</ButtonText>
            </Button>
          )}
        </ZeroState>
      </View>
    );
  }

  const canModerate = isUserDepartmentAdmin && !!actionsFor && actionsFor.MessageSeq < PENDING_SEQ_BASE;

  return (
    <View className="flex-1 bg-background-50" testID="chatbot-screen">
      {/* Assistant identity strip: the app bar above carries the title (Unit/IC), this keeps the mark and the reset. */}
      <HStack className="items-center justify-between border-b border-outline-100 bg-purple-50 px-4 py-2 dark:bg-purple-950" space="sm">
        <HStack className="min-w-0 flex-1 items-center" space="sm">
          <View className="size-8 items-center justify-center rounded-full bg-purple-600">
            <Sparkles size={18} color="#ffffff" />
          </View>
          <Text className="min-w-0 flex-1 text-xs text-typography-500">{t('chatbot.subtitle')}</Text>
        </HStack>
        <Pressable
          className="flex-row items-center rounded-full bg-purple-100 px-3 py-1 dark:bg-purple-900"
          onPress={() => void startNewSession()}
          disabled={isResetting}
          accessibilityRole="button"
          accessibilityState={{ disabled: isResetting, busy: isResetting }}
          accessibilityLabel={t('chatbot.new_session')}
          testID="chatbot-new-session"
        >
          <View>
            <RefreshCw size={14} color={isDark ? ASSISTANT_ACCENT_DARK : ASSISTANT_ACCENT} />
          </View>
          <Text className="ml-1 text-xs font-medium text-purple-700 dark:text-purple-300">{t('chatbot.new_session')}</Text>
        </Pressable>
      </HStack>

      <BottomAnchoredKeyboardView offset={keyboardOffset}>
        {isLoadingMessages && ordered.length === 0 ? (
          <Loading />
        ) : ordered.length === 0 ? (
          <ZeroState icon={Sparkles} iconSize={48} iconColor="#a78bfa" heading={t('chatbot.title')} description={t('chatbot.empty')} viewClassName="flex-1 p-6" testID="chatbot-empty" />
        ) : (
          <FlatList
            data={ordered}
            keyExtractor={(message) => message.ClientMessageId || message.ChatMessageId}
            renderItem={({ item }) => <MessageBubble message={item} isOwn={isOwnMessage(item, userId, NO_UNIT)} showSender={false} onLongPress={setActionsFor} onRetry={retry} />}
            // FlashList v2 keeps a new answer in view only with an autoscroll threshold (Responder).
            maintainVisibleContentPosition={{ startRenderingFromBottom: true, autoscrollToBottomThreshold: 0.2 }}
            onStartReached={() => void useChatStore.getState().loadOlderMessages(channelId)}
            contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 8 }}
            testID="chatbot-message-list"
          />
        )}
        {isTyping ? (
          <HStack className="items-center px-4 py-1" space="sm" accessible accessibilityRole="progressbar" accessibilityLabel={t('chatbot.thinking')} testID="chatbot-typing">
            <View className="size-6 items-center justify-center rounded-full bg-purple-600">
              <Sparkles size={12} color="#ffffff" />
            </View>
            <TypingDots color={ASSISTANT_ACCENT} />
          </HStack>
        ) : null}
        <MessageComposer onSend={(body) => void send(body)} allowUrgent={false} placeholder={t('chatbot.ask_placeholder')} />
      </BottomAnchoredKeyboardView>

      {/* Assistant messages: copy, pin (moderator) and report only — no reactions, edits or deletes. */}
      <MessageActionsSheet
        message={actionsFor}
        isOpen={!!actionsFor}
        onClose={() => setActionsFor(null)}
        isOwn={actionsFor ? isOwnMessage(actionsFor, userId, NO_UNIT) : false}
        isModerator={canModerate}
        onCopy={(message) =>
          void Clipboard.setStringAsync(message.Body ?? '').then(
            () => toast.success(t('chat.copied')),
            () => toast.info(t('chat.copy_unavailable'))
          )
        }
        {...(canModerate ? { onTogglePin: (message: ChatMessageResultData, pinned: boolean) => void run(() => setMessagePinned(message.ChatMessageId, pinned), 'chat.pin_failed') } : {})}
        onFlag={(message, reason) => void run(() => flagMessage(message.ChatMessageId, reason), 'chat.flag_failed')}
      />
    </View>
  );
}

/**
 * The assistant at `/chatbot` (Responder baseline, Unit/IC layout): the caller's chatbot channel with an identity
 * strip, "new session", a thinking row while a reply is awaited, and the shared composer in a
 * BottomAnchoredKeyboardView. Questions are online only (failed ones are tap-to-retry); replies arrive over the chat
 * hub with a polling fallback. Gated like every chat route (chat hub + `Chat.System`): the assistant rides on chat.
 */
export default function ChatbotScreen({ keyboardOffset }: ChatbotScreenProps) {
  return (
    <ChatGate>
      <ChatbotContent keyboardOffset={keyboardOffset} />
    </ChatGate>
  );
}
