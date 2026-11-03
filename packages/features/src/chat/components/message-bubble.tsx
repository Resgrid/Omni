import { safeFormatDate } from '@resgrid/core/utils/dates';
import { useTranslation } from '@resgrid/i18n';
import { ChatMessagePriority, type ChatMessageResultData, ChatMessageType } from '@resgrid/models';
import { HStack, Image, Pressable, Text, useThemeColors, View, VStack } from '@resgrid/ui';
import { AlertTriangle, Clock, MapPin, Pin } from 'lucide-react-native';
import React, { useMemo } from 'react';

import { parseGifMetadata } from '../lib/chat-format';
import { messageBodyText } from '../lib/message-text';
import { ChatImageThumbnail } from './chat-image';

export interface MessageBubbleProps {
  message: ChatMessageResultData;
  isOwn: boolean;
  showSender: boolean;
  onLongPress?: (message: ChatMessageResultData) => void;
  /** Makes a failed send tappable ("tap to retry") — the assistant, whose sends are online only. */
  onRetry?: (message: ChatMessageResultData) => void;
  /** Opens an image message full screen; without it the picture is not tappable. */
  onOpenImage?: (message: ChatMessageResultData) => void;
}

const GIF_MAX_WIDTH = 200;
const GIF_DEFAULT_HEIGHT = 160;

/** Bubble size for a GIF: the provider's aspect ratio at most 200dp wide, height kept between 80 and 240dp. */
const gifSize = (width?: number, height?: number): { width: number; height: number } => {
  if (!width || !height) return { width: GIF_MAX_WIDTH, height: GIF_DEFAULT_HEIGHT };
  const scaledHeight = Math.round((GIF_MAX_WIDTH * height) / width);
  return { width: GIF_MAX_WIDTH, height: Math.min(240, Math.max(80, scaledHeight)) };
};

/** One message (Responder bubble): sender in group channels, body, GIF or picture, urgency, edited/deleted/pinned markers and send state. */
export const MessageBubble: React.FC<MessageBubbleProps> = React.memo(({ message, isOwn, showSender, onLongPress, onRetry, onOpenImage }) => {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const isDeleted = !!message.DeletedOn;
  const isUrgent = message.Priority === ChatMessagePriority.Urgent;
  const status = message._localStatus;
  const isGif = message.MessageType === ChatMessageType.Gif;
  const isImage = message.MessageType === ChatMessageType.Image && !isDeleted;
  const gif = useMemo(() => (isGif ? parseGifMetadata(message.MetadataJson) : null), [isGif, message.MetadataJson]);
  const testID = `chat-message-${message.ClientMessageId || message.ChatMessageId}`;
  const textClassName = `text-base ${isOwn ? 'text-typography-0' : 'text-typography-900'} ${isDeleted ? 'italic opacity-70' : ''}`;
  // A GIF whose metadata cannot be read falls back to its body (the title), else the word "GIF".
  const body = isDeleted ? t('chat.message_deleted') : message.MessageType === ChatMessageType.Location ? t('chat.shared_location') : isGif && !message.Body ? t('chat.gif') : messageBodyText(message);

  return (
    <Pressable
      testID={testID}
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
            <AlertTriangle size={12} color={isOwn ? colors.textInverse : colors.token('error-600')} />
            <Text className={`text-xs font-bold ${isOwn ? 'text-typography-0' : 'text-error-600'}`}>{t('chat.urgent')}</Text>
          </HStack>
        ) : null}
        {isImage ? (
          <VStack space="xs">
            <ChatImageThumbnail message={message} isOwn={isOwn} {...(onOpenImage ? { onOpen: onOpenImage } : {})} {...(onLongPress ? { onLongPress } : {})} testID={testID} />
            {message.Body ? <Text className={textClassName}>{body}</Text> : null}
          </VStack>
        ) : gif && !isDeleted ? (
          <Image source={{ uri: gif.GifUrl }} style={{ ...gifSize(gif.Width, gif.Height), borderRadius: 10 }} contentFit="contain" accessibilityLabel={message.Body || t('chat.gif')} testID={`${testID}-gif`} />
        ) : (
          <HStack space="xs" className="items-center">
            {message.MessageType === ChatMessageType.Location ? <MapPin size={14} color={isOwn ? colors.textInverse : colors.icon} /> : null}
            <Text className={textClassName}>{body}</Text>
          </HStack>
        )}
        <HStack space="xs" className="mt-0.5 items-center justify-end">
          {message.PinnedOn ? <Pin size={10} color={isOwn ? colors.textInverse : colors.token('typography-500')} /> : null}
          {message.EditedOn && !isDeleted ? <Text className={`text-[10px] ${isOwn ? 'text-typography-0' : 'text-typography-500'}`}>{t('chat.edited')}</Text> : null}
          {status === 'pending' ? <Clock size={10} color={isOwn ? colors.textInverse : colors.token('typography-500')} /> : null}
          <Text className={`text-[10px] ${isOwn ? 'text-typography-0' : 'text-typography-500'}`}>{safeFormatDate(message.SentOn, 'h:mm a', '')}</Text>
        </HStack>
      </VStack>
      {status === 'failed' ? (
        onRetry ? (
          <Pressable className="mt-0.5 self-end" onPress={() => onRetry(message)} accessibilityRole="button" accessibilityLabel={t('chat.failed_tap_retry')} testID={`${testID}-retry`}>
            <Text className="text-xs text-error-600">{t('chat.failed_tap_retry')}</Text>
          </Pressable>
        ) : (
          <View className="mt-0.5 self-end" testID={`${testID}-failed`}>
            <Text className="text-xs text-error-600">{t('chat.send_failed')}</Text>
          </View>
        )
      ) : null}
    </Pressable>
  );
});

MessageBubble.displayName = 'MessageBubble';
