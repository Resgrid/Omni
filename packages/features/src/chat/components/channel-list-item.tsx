import { safeFormatDate } from '@resgrid/core/utils/dates';
import { useTranslation } from '@resgrid/i18n';
import { type ChatChannelResultData } from '@resgrid/models';
import { HStack, Pressable, Text, View, VStack } from '@resgrid/ui';
import { Bot, Hash, Lock, MessageCircle, Siren } from 'lucide-react-native';
import React from 'react';

import { chatSectionOf } from '../lib/chat-format';

export interface ChannelListItemProps {
  channel: ChatChannelResultData;
  onPress: (channel: ChatChannelResultData) => void;
}

const ICONS = { direct: MessageCircle, channels: Hash, incidents: Siren, assistant: Bot } as const;

/** One conversation in the list: type icon, name, topic, last activity and the unread count. */
export const ChannelListItem: React.FC<ChannelListItemProps> = React.memo(({ channel, onPress }) => {
  const { t } = useTranslation();
  const Icon = ICONS[chatSectionOf(channel)];
  const unread = channel.UnreadCount ?? 0;
  return (
    <Pressable
      testID={`chat-channel-${channel.ChatChannelId}`}
      onPress={() => onPress(channel)}
      accessibilityRole="button"
      accessibilityLabel={unread > 0 ? `${channel.Name}, ${t('chat.unread_count', { count: unread })}` : channel.Name}
      className="border-b border-outline-100 bg-background-0 px-4 py-3"
    >
      <HStack space="md" className="items-center">
        <View className="size-10 items-center justify-center rounded-full bg-primary-50">
          <Icon size={18} color="#3b82f6" />
        </View>
        <VStack className="flex-1">
          <HStack space="xs" className="items-center">
            <Text className={`flex-1 text-base ${unread > 0 ? 'font-bold' : 'font-medium'} text-typography-900`} numberOfLines={1}>
              {channel.Name}
            </Text>
            {channel.IsLocked ? <Lock size={12} color="#9ca3af" /> : null}
            {channel.LastMessageOn ? <Text className="text-xs text-typography-400">{safeFormatDate(channel.LastMessageOn, 'MMM d, h:mm a', '')}</Text> : null}
          </HStack>
          {channel.Topic ? (
            <Text className="text-xs text-typography-500" numberOfLines={1}>
              {channel.Topic}
            </Text>
          ) : null}
        </VStack>
        {unread > 0 ? (
          <View className="min-w-[22px] items-center rounded-full bg-primary-500 px-1.5 py-0.5" testID={`chat-channel-${channel.ChatChannelId}-unread`}>
            <Text className="text-xs font-bold text-typography-0">{unread > 99 ? '99+' : String(unread)}</Text>
          </View>
        ) : null}
      </HStack>
    </Pressable>
  );
});

ChannelListItem.displayName = 'ChannelListItem';
