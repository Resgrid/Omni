import { useNotifications } from '@novu/react-native';
import { useTranslation } from '@resgrid/i18n';
import { openInboxItem } from '@resgrid/notifications';
import { Button, ButtonText, FlatList, HStack, Loading, RefreshControl, Text, useToast, View, ZeroState } from '@resgrid/ui';
import { Bell } from 'lucide-react-native';
import React, { useCallback, useMemo, useState } from 'react';

import { NotificationDetailSheet } from '../components/notification-detail-sheet';
import { NotificationRow } from '../components/notification-row';
import { type InboxItem, inboxTargetOf, toInboxItem } from '../lib/inbox-item';

export interface NotificationsInboxScreenProps {
  /**
   * False until the Novu provider has real credentials (`useNovuInboxConfig().ready`): rendering the inbox against the
   * placeholder client would fetch for nobody.
   */
  isReady?: boolean;
}

function InboxContent() {
  const { t } = useTranslation();
  const toast = useToast();
  const { notifications, isLoading, isFetching, hasMore, fetchMore, refetch, readAll, error } = useNotifications({ archived: false });
  const [selected, setSelected] = useState<InboxItem | null>(null);

  const items = useMemo(() => (notifications ?? []).map(toInboxItem), [notifications]);
  const byId = useMemo(() => new Map((notifications ?? []).map((notification) => [notification.id, notification])), [notifications]);

  const markRead = useCallback(
    (item: InboxItem) => {
      const notification = byId.get(item.id);
      if (notification && !notification.isRead) void notification.read().catch(() => undefined);
    },
    [byId]
  );

  const open = useCallback(
    async (item: InboxItem) => {
      markRead(item);
      // Only a safe, known target navigates; anything else stays here in the detail sheet.
      if (!inboxTargetOf(item)) {
        setSelected(item);
        return;
      }
      setSelected(null);
      await openInboxItem(item);
    },
    [markRead]
  );

  const handleReadAll = useCallback(async () => {
    const result = await readAll();
    if (result?.error) toast.error(t('notifications.load_error'));
  }, [readAll, t, toast]);

  const isRefreshing = isFetching && !isLoading;

  if (isLoading && items.length === 0) return <Loading />;

  return (
    <View className="flex-1 bg-background-50" testID="notifications-inbox-screen">
      {items.some((item) => !item.isRead) ? (
        <HStack className="justify-end px-4 py-2">
          <Button size="sm" variant="link" onPress={() => void handleReadAll()} testID="notifications-read-all">
            <ButtonText>{t('notifications.mark_all_read')}</ButtonText>
          </Button>
        </HStack>
      ) : null}
      {error && items.length === 0 ? (
        <ZeroState icon={Bell} isError heading={t('notifications.load_error')} testID="notifications-error" />
      ) : items.length === 0 ? (
        <ZeroState icon={Bell} heading={t('notifications.empty')} testID="notifications-empty" />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <NotificationRow item={item} onPress={(row) => void open(row)} />}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => void refetch()} />}
          onEndReached={hasMore ? () => void fetchMore() : undefined}
          onEndReachedThreshold={0.5}
          ListFooterComponent={hasMore ? <Text className="py-3 text-center text-xs text-typography-400">{t('common.loading')}</Text> : null}
          testID="notifications-list"
        />
      )}
      <NotificationDetailSheet item={selected} onClose={() => setSelected(null)} onOpenTarget={(item) => void open(item)} />
    </View>
  );
}

/**
 * The notifications inbox (Responder inbox + Unit's inbox reference): Novu entries, newest first, unread marked. A tap
 * on an entry whose event code resolves to a safe target opens it like a tapped push (`openInboxItem`); others open the
 * detail sheet. Ids failing `isSafeRouteId` never navigate.
 */
export default function NotificationsInboxScreen({ isReady = true }: NotificationsInboxScreenProps) {
  return isReady ? <InboxContent /> : <Loading testID="notifications-inbox-pending" />;
}
