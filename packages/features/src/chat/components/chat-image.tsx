import { type AuthenticatedImageSource, getChatAttachmentImageSource } from '@resgrid/api';
import { useAuthStore } from '@resgrid/auth';
import { getDataApiContext } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import { type ChatMessageResultData } from '@resgrid/models';
import { HStack, Image, NativeModal, Pressable, Text } from '@resgrid/ui';
import { ImageOff, X } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { imageAttachmentOf } from '../lib/chat-format';

const THUMBNAIL_SIZE = 200;

/**
 * Image source for an image message: the optimistic local file while it uploads, else the attachment (thumbnail or full
 * file) with the bearer header. Re-created when the token rotates (a stale bearer would 401), and otherwise stable —
 * expo-image on web refetches whenever the source object changes.
 */
export const useChatImageSource = (message: ChatMessageResultData | null, thumbnail: boolean): AuthenticatedImageSource | null => {
  const accessToken = useAuthStore((state) => state.accessToken);
  const localUri = message?._localAttachmentUri;
  const attachmentId = message ? imageAttachmentOf(message)?.ChatAttachmentId : undefined;
  return useMemo(() => {
    if (localUri) return { uri: localUri };
    return attachmentId ? getChatAttachmentImageSource(getDataApiContext(), attachmentId, accessToken, thumbnail) : null;
  }, [accessToken, attachmentId, localUri, thumbnail]);
};

export interface ChatImageThumbnailProps {
  message: ChatMessageResultData;
  isOwn: boolean;
  onOpen?: (message: ChatMessageResultData) => void;
  onLongPress?: (message: ChatMessageResultData) => void;
  testID: string;
}

/** An image message's picture inside its bubble (thumbnail endpoint); tap opens the full image. */
export const ChatImageThumbnail: React.FC<ChatImageThumbnailProps> = ({ message, isOwn, onOpen, onLongPress, testID }) => {
  const { t } = useTranslation();
  const source = useChatImageSource(message, true);
  // Keyed on the source object, so a new token (new source) retries an image that failed with the old one.
  const [failedSource, setFailedSource] = useState<AuthenticatedImageSource | null>(null);
  const label = message.Body || t('chat.image');

  if (!source || failedSource === source) {
    // No attachment yet (the sender's upload is still running) or the download failed.
    return (
      <HStack space="xs" className="h-24 w-[200px] items-center justify-center rounded-[10px] bg-background-200" accessibilityRole="image" accessibilityLabel={label} testID={`${testID}-image-unavailable`}>
        <ImageOff size={16} color={isOwn ? '#ffffff' : '#6b7280'} />
        <Text className={`text-xs ${isOwn ? 'text-typography-0' : 'text-typography-500'}`}>{source ? t('chat.image_unavailable') : t('chat.image')}</Text>
      </HStack>
    );
  }

  return (
    <Pressable
      onPress={onOpen ? () => onOpen(message) : undefined}
      onLongPress={onLongPress ? () => onLongPress(message) : undefined}
      delayLongPress={350}
      accessibilityRole={onOpen ? 'imagebutton' : 'image'}
      accessibilityLabel={label}
      testID={`${testID}-image`}
    >
      <Image source={source} style={styles.thumbnail} contentFit="cover" onError={() => setFailedSource(source)} testID={`${testID}-image-content`} />
    </Pressable>
  );
};

export interface ChatImageViewerProps {
  /** The image message being viewed; null closes the viewer. */
  message: ChatMessageResultData | null;
  onClose: () => void;
}

/** Full-screen view of an image message: the full file, with the cached thumbnail shown while it downloads. */
export const ChatImageViewer: React.FC<ChatImageViewerProps> = ({ message, onClose }) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const source = useChatImageSource(message, false);
  const thumbnail = useChatImageSource(message, true);
  const isOpen = message !== null && source !== null;

  return (
    <NativeModal visible={isOpen} animationType="fade" onRequestClose={onClose} testID="chat-image-viewer">
      <View style={styles.viewer}>
        {source ? (
          <Image source={source} placeholder={thumbnail} placeholderContentFit="contain" style={styles.full} contentFit="contain" accessibilityLabel={message?.Body || t('chat.image')} testID="chat-image-viewer-image" />
        ) : null}
        {message?.Body ? (
          <View style={StyleSheet.flatten([styles.caption, { paddingBottom: insets.bottom + 16 }])}>
            <Text className="text-base text-white">{message.Body}</Text>
          </View>
        ) : null}
        <View style={StyleSheet.flatten([styles.close, { top: insets.top + 8 }])}>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={t('common.close')} className="size-10 items-center justify-center rounded-full bg-black/50" testID="chat-image-viewer-close">
            <X size={22} color="#ffffff" />
          </Pressable>
        </View>
      </View>
    </NativeModal>
  );
};

const styles = StyleSheet.create({
  thumbnail: { width: THUMBNAIL_SIZE, height: THUMBNAIL_SIZE, borderRadius: 10 },
  viewer: { flex: 1, backgroundColor: '#000000' },
  full: { flex: 1 },
  caption: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 12, backgroundColor: 'rgba(0,0,0,0.5)' },
  close: { position: 'absolute', right: 16 },
});
