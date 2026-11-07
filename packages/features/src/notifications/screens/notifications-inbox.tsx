import { type Notification, useNotifications, useNovu } from '@novu/react-native';
import { useTranslation } from '@resgrid/i18n';
import { openInboxItem } from '@resgrid/notifications';
import { Button, ButtonText, FlatList, HStack, Loading, Pressable, RefreshControl, Text, useThemeColors, useToast, View, ZeroState } from '@resgrid/ui';
import { Bell, CheckCheck, Trash2, X } from 'lucide-react-native';
import React, { useCallback, useMemo, useState } from 'react';
import { View as RNView } from 'react-native';

import { MessagesConfirmSheet } from '../../messages/components/confirm-sheet';
import { NotificationDetailSheet } from '../components/notification-detail-sheet';
import { NotificationRow } from '../components/notification-row';
import { type InboxItem, inboxTargetOf, toInboxItem } from '../lib/inbox-item';
import { type InboxSelection, isInboxItemSelected, runInBatches, selectAllInboxItems, selectedInboxIds, toggleInboxSelection } from '../lib/inbox-selection';

export interface NotificationsInboxScreenProps {
  /**
   * False until the Novu provider has real credentials (`useNovuInboxConfig().ready`): rendering the inbox against the
   * placeholder client would fetch for nobody.
   */
  isReady?: boolean;
  isUnavailable?: boolean;
}

function InboxContent() {
  const { t } = useTranslation();
  const toast = useToast();
  const colors = useThemeColors();
  const novu = useNovu();
  const { notifications, isLoading, isFetching, hasMore, fetchMore, refetch, readAll, error } = useNotifications({ archived: false });
  const [selected, setSelected] = useState<InboxItem | null>(null);
  const [selection, setSelection] = useState<InboxSelection | null>(null);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isWorking, setIsWorking] = useState(false);

  const items = useMemo(() => (notifications ?? []).map(toInboxItem), [notifications]);
  const byId = useMemo(() => new Map((notifications ?? []).map((notification) => [notification.id, notification])), [notifications]);
  const hasUnread = items.some((item) => !item.isRead);
  const selectedIds = useMemo(() => (selection ? selectedInboxIds(selection, items) : []), [selection, items]);
  const selectedUnread = selectedIds.filter((id) => byId.get(id)?.isRead === false);

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

  const press = useCallback(
    (item: InboxItem) => {
      if (selection) {
        setSelection(toggleInboxSelection(selection, item.id, items));

        return;
      }

      void open(item);
    },
    [items, open, selection]
  );

  const longPress = useCallback((item: InboxItem) => setSelection((current) => current ?? { ids: [item.id], all: false }), []);

  const endSelection = () => {
    setSelection(null);
    setIsConfirmOpen(false);
  };

  const handleReadAll = useCallback(async () => {
    const result = await readAll();

    if (result?.error) toast.error(t('notifications.mark_read_error'));
  }, [readAll, t, toast]);

  // Every unread notification (loaded or not) when all are selected; otherwise one read per selected unread row.
  const readSelected = async () => {
    if (!selection) return;
    setIsWorking(true);
    const failed = selection.all ? (await readAll())?.error !== undefined : (await runInBatches(selectedUnread, (id) => readOne(byId.get(id)))).some((ok) => !ok);
    setIsWorking(false);

    if (failed) {
      toast.error(t('notifications.mark_read_error'));

      return;
    }

    endSelection();
  };

  // "Select all" deletes the whole inbox, pages not loaded yet included; otherwise one delete per selected row.
  const deleteSelected = async () => {
    if (!selection) return;
    setIsWorking(true);
    const failed = selection.all ? (await novu.notifications.deleteAll()).error !== undefined : (await runInBatches(selectedIds, (id) => deleteOne(byId.get(id)))).some((ok) => !ok);
    await refetch().catch(() => undefined);
    setIsWorking(false);

    if (failed) {
      setIsConfirmOpen(false);
      toast.error(t('notifications.delete_error'));

      return;
    }

    toast.success(t('notifications.deleted'));
    endSelection();
  };

  const isRefreshing = isFetching && !isLoading;

  const reload = async () => {
    await refetch();
  };

  if (isLoading && items.length === 0) return <Loading />;

  const allLoadedSelected = selection !== null && items.length > 0 && selectedIds.length === items.length;

  return (
    <View className="flex-1 bg-background-50" testID="notifications-inbox-screen">
      {selection ? (
        <HStack space="sm" className="items-center justify-between border-b border-outline-200 bg-background-0 px-4 py-2" testID="notifications-selection-bar">
          <HStack space="sm" className="flex-1 items-center">
            <Pressable onPress={endSelection} accessibilityRole="button" accessibilityLabel={t('common.cancel')} className="rounded-lg p-2" testID="notifications-exit-selection">
              <RNView>
                <X size={20} color={colors.icon} />
              </RNView>
            </Pressable>
            <Text size="sm" className="shrink text-typography-700" numberOfLines={1}>
              {t('notifications.selected_count', { count: selection.all ? Math.max(selectedIds.length, items.length) : selectedIds.length })}
            </Text>
          </HStack>
          <HStack space="xs" className="items-center">
            <Button size="sm" variant="link" onPress={() => setSelection(allLoadedSelected ? { ids: [], all: false } : selectAllInboxItems(items))} testID="notifications-select-all">
              <ButtonText>{allLoadedSelected ? t('notifications.deselect_all') : t('notifications.select_all')}</ButtonText>
            </Button>
            <Button size="sm" variant="outline" onPress={() => void readSelected()} isDisabled={isWorking || (selection.all ? !hasUnread : selectedUnread.length === 0)} testID="notifications-read-selected">
              <RNView>
                <CheckCheck size={16} color={colors.primary} />
              </RNView>
              <ButtonText>{t('notifications.mark_read')}</ButtonText>
            </Button>
            <Button size="sm" action="negative" onPress={() => setIsConfirmOpen(true)} isDisabled={isWorking || selectedIds.length === 0} testID="notifications-delete-selected">
              <RNView>
                <Trash2 size={16} color={colors.textInverse} />
              </RNView>
              <ButtonText>{t('notifications.delete')}</ButtonText>
            </Button>
          </HStack>
        </HStack>
      ) : items.length > 0 ? (
        <HStack className="items-center justify-between px-4 py-2">
          <Button size="sm" variant="link" onPress={() => setSelection({ ids: [], all: false })} testID="notifications-select">
            <ButtonText>{t('notifications.select')}</ButtonText>
          </Button>
          {hasUnread ? (
            <Button size="sm" variant="link" onPress={() => void handleReadAll()} testID="notifications-read-all">
              <ButtonText>{t('notifications.mark_all_read')}</ButtonText>
            </Button>
          ) : null}
        </HStack>
      ) : null}
      {error && items.length === 0 ? (
        <ZeroState icon={Bell} isError heading={t('notifications.load_error')} onRetry={reload} testID="notifications-error" />
      ) : items.length === 0 ? (
        <ZeroState icon={Bell} heading={t('notifications.empty')} onRetry={reload} testID="notifications-empty" />
      ) : (
        <FlatList
          data={items}
          extraData={selection}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <NotificationRow item={item} onPress={press} onLongPress={longPress} selectionMode={selection !== null} isSelected={selection ? isInboxItemSelected(selection, item.id) : false} />}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => void refetch()} />}
          onEndReached={hasMore ? () => void fetchMore() : undefined}
          onEndReachedThreshold={0.5}
          ListFooterComponent={hasMore ? <Text className="py-3 text-center text-xs text-typography-400">{t('common.loading')}</Text> : null}
          testID="notifications-list"
        />
      )}
      <NotificationDetailSheet item={selected} onClose={() => setSelected(null)} onOpenTarget={(item) => void open(item)} />
      <MessagesConfirmSheet
        isOpen={isConfirmOpen}
        title={t('notifications.confirm_delete_title')}
        message={selection?.all ? t('notifications.delete_all_message') : t('notifications.delete_selected_message', { count: selectedIds.length })}
        confirmLabel={t('notifications.delete')}
        isBusy={isWorking}
        onConfirm={() => void deleteSelected()}
        onClose={() => setIsConfirmOpen(false)}
        testID="notifications-confirm-delete"
      />
    </View>
  );
}

const readOne = async (notification: Notification | undefined): Promise<boolean> => {
  if (!notification || notification.isRead) return true;
  const result = await notification.read().catch(() => ({ error: true }));

  return !('error' in result && result.error);
};

const deleteOne = async (notification: Notification | undefined): Promise<boolean> => {
  if (!notification) return true;
  const result = await notification.delete().catch(() => ({ error: true }));

  return !('error' in result && result.error);
};

/**
 * The notifications inbox (Responder inbox + Unit's inbox reference): Novu entries, newest first, unread marked. A tap
 * on an entry whose event code resolves to a safe target opens it like a tapped push (`openInboxItem`); others open the
 * detail sheet. Ids failing `isSafeRouteId` never navigate. "Select" (or a long press) picks entries — or all of them —
 * to mark read or delete; "Mark all as read" clears every unread entry at once.
 */
export default function NotificationsInboxScreen({ isReady = true, isUnavailable = false }: NotificationsInboxScreenProps) {
  const { t } = useTranslation();

  if (isUnavailable) return <ZeroState heading={t('notifications.inbox_unavailable')} testID="notifications-inbox-unavailable" />;

  return isReady ? <InboxContent /> : <Loading testID="notifications-inbox-pending" />;
}
