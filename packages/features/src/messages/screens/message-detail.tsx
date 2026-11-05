import { useAuthStore } from '@resgrid/auth';
import { isSafeRouteId } from '@resgrid/core/utils/route-ids';
import { useMessagesStore } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import { KeyboardAwareScrollView, ScreenHeader, View, ZeroState } from '@resgrid/ui';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet } from 'react-native';

import { MessageDetails } from '../components/message-details';
import { isOwnMessage } from '../lib/message-format';
import { messageRoutes } from '../routes';

export interface MessageDetailScreenProps {
  /** Defaults to the `id` route param. */
  messageId?: string;
}

/** A message on its own page (`/messages/[id]`): opened from the list, inbox push notifications and links. */
export default function MessageDetailScreen({ messageId }: MessageDetailScreenProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const routeId = Array.isArray(params.id) ? params.id[0] : params.id;
  const id = messageId ?? (routeId && isSafeRouteId(routeId) ? routeId : '');
  const userId = useAuthStore((state) => state.userId);
  const fallback = useMessagesStore((state) => state.inboxMessages.find((message) => message.MessageId === id) ?? state.sentMessages.find((message) => message.MessageId === id) ?? null);
  const isOwn = useMessagesStore((state) => isOwnMessage(id, { inbox: state.inboxMessages, sent: state.sentMessages }, state.messageDetailsById[id], userId));

  const back = () => (router.canGoBack() ? router.back() : router.replace(messageRoutes.list()));

  return (
    <View className="flex-1 bg-background-0" testID="message-detail-screen">
      <ScreenHeader title={t('messages.title')} onBack={back} testID="message-detail-header" />
      {id ? (
        <KeyboardAwareScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <MessageDetails messageId={id} fallback={fallback} isOwn={isOwn} onDeleted={back} />
        </KeyboardAwareScrollView>
      ) : (
        <ZeroState isError heading={t('messages.not_found')} testID="message-detail-invalid" />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40 },
});
