import { safeFormatDate } from '@resgrid/core/utils/dates';
import { useTranslation } from '@resgrid/i18n';
import { type ChatChannelResultData } from '@resgrid/models';
import { HStack, Pressable, Text, useThemeColors, View, VStack } from '@resgrid/ui';
import { Sparkles } from 'lucide-react-native';
import React from 'react';

import { ASSISTANT_ACCENT, ASSISTANT_ACCENT_DARK } from '../lib/assistant-accent';
import { UnreadPill } from './channel-list-item';

export interface AssistantListItemProps {
  /** The assistant's channel when Core has created it (unread count, last activity); null before the first visit. */
  channel: ChatChannelResultData | null;
  onPress: () => void;
}

/**
 * The assistant, pinned at the top of the chat list: the way into it from Chat in every app, so no app needs a separate
 * menu entry or shortcut for it. It shows before Core has made the assistant's channel, which the assistant screen does.
 */
export const AssistantListItem: React.FC<AssistantListItemProps> = React.memo(({ channel, onPress }) => {
  const { t } = useTranslation();
  const { isDark } = useThemeColors();
  const title = t('chatbot.title');
  const unread = channel?.UnreadCount ?? 0;
  const lastMessageOn = channel?.LastMessageOn ?? null;

  return (
    <Pressable
      testID="chat-assistant"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={unread > 0 ? `${title}, ${t('chat.unread_count', { count: unread })}` : title}
      className="border-b border-outline-100 bg-background-0 px-4 py-3"
    >
      <HStack space="md" className="items-center">
        <View className="size-10 items-center justify-center rounded-full bg-purple-100 dark:bg-purple-950">
          <Sparkles size={18} color={isDark ? ASSISTANT_ACCENT_DARK : ASSISTANT_ACCENT} />
        </View>
        <VStack className="flex-1">
          <HStack space="xs" className="items-center">
            <Text className={`flex-1 text-base ${unread > 0 ? 'font-bold' : 'font-medium'} text-typography-900`} numberOfLines={1}>
              {title}
            </Text>
            {lastMessageOn ? <Text className="text-xs text-typography-400">{safeFormatDate(lastMessageOn, 'MMM d, h:mm a', '')}</Text> : null}
          </HStack>
          <Text className="text-xs text-typography-500" numberOfLines={1}>
            {t('chatbot.subtitle')}
          </Text>
        </VStack>
        <UnreadPill count={unread} testID="chat-assistant-unread" />
      </HStack>
    </Pressable>
  );
});

AssistantListItem.displayName = 'AssistantListItem';
