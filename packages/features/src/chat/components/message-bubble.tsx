import { safeFormatDate } from '@resgrid/core/utils/dates';
import { useTranslation } from '@resgrid/i18n';
import { ChatMessagePriority, type ChatMessageResultData, ChatMessageType } from '@resgrid/models';
import { HStack, Pressable, Text, View, VStack } from '@resgrid/ui';
import { AlertTriangle, Clock, MapPin, Pin } from 'lucide-react-native';
import React from 'react';

export interface MessageBubbleProps {
  message: ChatMessageResultData;
  isOwn: boolean;
  showSender: boolean;
  onLongPress?: (message: ChatMessageResultData) => void;
}

/** One message (Responder bubble): sender in group channels, body, urgency, edited/deleted/pinned markers and send state. */
export const MessageBubble: React.FC<MessageBubbleProps> = React.memo(({ message, isOwn, showSender, onLongPress }) => {
  const { t } = useTranslation();
  const isDeleted = !!message.DeletedOn;
  const isUrgent = message.Priority === ChatMessagePriority.Urgent;
  const status = message._localStatus;
  const body = isDeleted ? t('chat.message_deleted') : message.MessageType === ChatMessageType.Location ? t('chat.shared_location') : (message.Body ?? '');

  return (
    <Pressable
      testID={`chat-message-${message.ClientMessageId || message.ChatMessageId}`}
      onLongPress={onLongPress && !isDeleted ? () => onLongPress(message) : undefined}
      delayLongPress={350}
      accessibilityRole="text"
      accessibilityHint={onLongPress ? t('chat.message_actions_hint') : undefined}
      className={`my-1 max-w-[85%] ${isOwn ? 'self-end' : 'self-start'}`}
    >
      <VStack className={`rounded-2xl px-3 py-2 ${isOwn ? 'bg-primary-500' : 'bg-background-100'} ${isUrgent ? 'border-2 border-error-500' : ''}`}>
        {showSender && !isOwn ? <Text className="mb-0.5 text-xs font-semibold text-typography-600">{message.SenderDisplayName || t('chat.someone')}</Text> : null}
        {isUrgent ? (
          <HStack space="xs" className="items-center">
            <AlertTriangle size={12} color={isOwn ? '#ffffff' : '#dc2626'} />
            <Text className={`text-xs font-bold ${isOwn ? 'text-typography-0' : 'text-error-600'}`}>{t('chat.urgent')}</Text>
          </HStack>
        ) : null}
        <HStack space="xs" className="items-center">
          {message.MessageType === ChatMessageType.Location ? <MapPin size={14} color={isOwn ? '#ffffff' : '#374151'} /> : null}
          <Text className={`text-base ${isOwn ? 'text-typography-0' : 'text-typography-900'} ${isDeleted ? 'italic opacity-70' : ''}`}>{body}</Text>
        </HStack>
        <HStack space="xs" className="mt-0.5 items-center justify-end">
          {message.PinnedOn ? <Pin size={10} color={isOwn ? '#ffffff' : '#6b7280'} /> : null}
          {message.EditedOn && !isDeleted ? <Text className={`text-[10px] ${isOwn ? 'text-typography-0' : 'text-typography-500'}`}>{t('chat.edited')}</Text> : null}
          {status === 'pending' ? <Clock size={10} color={isOwn ? '#ffffff' : '#6b7280'} /> : null}
          <Text className={`text-[10px] ${isOwn ? 'text-typography-0' : 'text-typography-500'}`}>{safeFormatDate(message.SentOn, 'h:mm a', '')}</Text>
        </HStack>
      </VStack>
      {status === 'failed' ? (
        <View className="mt-0.5 self-end" testID={`chat-message-${message.ClientMessageId || message.ChatMessageId}-failed`}>
          <Text className="text-xs text-error-600">{t('chat.send_failed')}</Text>
        </View>
      ) : null}
    </Pressable>
  );
});

MessageBubble.displayName = 'MessageBubble';
