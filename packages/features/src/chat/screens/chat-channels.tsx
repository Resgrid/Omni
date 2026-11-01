import { useChatStore } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import { type ChatChannelResultData, ChatChannelType } from '@resgrid/models';
import { useRealtimeEvent } from '@resgrid/realtime';
import { Fab, FabIcon, Input, InputField, InputIcon, InputSlot, Loading, RefreshControl, ScrollView, Text, View, VStack, ZeroState } from '@resgrid/ui';
import { type Href, router } from 'expo-router';
import { MessageSquarePlus, MessagesSquare, Search, X } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { useChatIdentity } from '../chat-identity';
import { ChannelListItem } from '../components/channel-list-item';
import { ChatGate } from '../components/chat-gate';
import { NewConversationSheet } from '../components/new-conversation-sheet';
import { CHAT_SECTION_KEYS, groupChannels } from '../lib/chat-format';
import { chatRoutes } from '../routes';

function ChatChannelsContent() {
  const { t } = useTranslation();
  const { asUnitId } = useChatIdentity();
  const channels = useChatStore((state) => state.channels);
  const isLoading = useChatStore((state) => state.loading.channels === true);
  const [query, setQuery] = useState('');
  const [isNewOpen, setIsNewOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const load = useCallback((bypassCache: boolean) => useChatStore.getState().fetchChannels(asUnitId != null ? { activeUnitId: asUnitId } : undefined, { bypassCache }), [asUnitId]);

  useEffect(() => {
    void load(false);
  }, [load]);

  useRealtimeEvent('chatChannelUpdated', () => void load(true));
  useRealtimeEvent('chatChannelProvisioned', () => void load(true));
  useRealtimeEvent('chatMessageReceived', () => void load(true));

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await load(true);
    setIsRefreshing(false);
  }, [load]);

  const open = useCallback((channel: ChatChannelResultData) => {
    // The assistant has its own screen; every other channel opens the conversation.
    router.push((channel.ChannelType === ChatChannelType.Chatbot ? chatRoutes.chatbot() : chatRoutes.conversation(channel.ChatChannelId)) as Href);
  }, []);

  const sections = useMemo(() => groupChannels(channels, query), [channels, query]);

  return (
    <View className="flex-1 bg-background-50" testID="chat-channels-screen">
      <View className="px-4 pb-2 pt-4">
        <Input className="bg-background-0" size="md" variant="outline">
          <InputSlot className="pl-3">
            <InputIcon as={Search} />
          </InputSlot>
          <InputField testID="chat-search" placeholder={t('chat.search_conversations')} value={query} onChangeText={setQuery} accessibilityLabel={t('chat.search_conversations')} />
          {query ? (
            <InputSlot className="pr-3" onPress={() => setQuery('')} accessibilityRole="button" accessibilityLabel={t('common.clear_search')}>
              <InputIcon as={X} />
            </InputSlot>
          ) : null}
        </Input>
      </View>
      {isLoading && !isRefreshing && channels.length === 0 ? (
        <Loading />
      ) : sections.length === 0 ? (
        <ZeroState icon={MessagesSquare} heading={t('chat.title')} description={t('chat.empty')} testID="chat-empty" />
      ) : (
        <ScrollView refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />} contentContainerStyle={{ paddingBottom: 96 }} testID="chat-channel-list">
          {sections.map(({ section, channels: sectionChannels }) => (
            <VStack key={section} testID={`chat-section-${section}`}>
              <Text className="px-4 pb-1 pt-3 text-xs font-semibold uppercase text-typography-500">{t(CHAT_SECTION_KEYS[section])}</Text>
              {sectionChannels.map((channel) => (
                <ChannelListItem key={channel.ChatChannelId} channel={channel} onPress={open} />
              ))}
            </VStack>
          ))}
        </ScrollView>
      )}
      <Fab size="lg" placement="bottom right" onPress={() => setIsNewOpen(true)} testID="chat-new-conversation" accessibilityLabel={t('chat.new_direct_message')}>
        <FabIcon as={MessageSquarePlus} />
      </Fab>
      <NewConversationSheet isOpen={isNewOpen} onClose={() => setIsNewOpen(false)} onCreated={(channel) => router.push(chatRoutes.conversation(channel.ChatChannelId))} />
    </View>
  );
}

/** Conversations (Responder list): direct messages, channels, incidents and the assistant, with unread counts. Gated by ChatGate. */
export default function ChatChannelsScreen() {
  return (
    <ChatGate>
      <ChatChannelsContent />
    </ChatGate>
  );
}
