import { useSecurity } from '@resgrid/auth';
import { pushRoutePath } from '@resgrid/core/navigation/route-paths';
import { type QueuedMessage, useMessagesStore } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import {
  Button,
  ButtonText,
  Fab,
  FabIcon,
  FlatList,
  HStack,
  Input,
  InputField,
  InputIcon,
  InputSlot,
  Loading,
  Pressable,
  RefreshControl,
  TabBar,
  type TabBarItem,
  Text,
  useThemeColors,
  useToast,
  View,
  VStack,
  ZeroState,
} from '@resgrid/ui';
import { useFocusEffect, useRouter } from 'expo-router';
import { Mail, MessageSquarePlus, Search, Trash2, X } from 'lucide-react-native';
import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View as RNView } from 'react-native';

import { MessagesConfirmSheet } from '../components/confirm-sheet';
import { MessageCard } from '../components/message-card';
import { QueuedMessageRow } from '../components/queued-message-row';
import { buildMessageList, type MessageFilter, type MessageListItem } from '../lib/message-format';
import { messageRoutes } from '../routes';

type Row = { type: 'queued'; key: string; queued: QueuedMessage } | { type: 'message'; key: string; item: MessageListItem };

const FILTERS: readonly { key: MessageFilter; labelKey: string }[] = [
  { key: 'all', labelKey: 'messages.all_messages' },
  { key: 'inbox', labelKey: 'messages.inbox' },
  { key: 'sent', labelKey: 'messages.sent' },
];

/**
 * Messages (Responder inbox/outbox): search, All / Inbox / Sent, unread markers and long-press multi-select delete.
 * A message opens on its own page (`/messages/[id]`, with its answers) and compose is a page too (`/messages/new`,
 * offline-capable through the outbox; queued messages show here until sent). The 30 most recent days are persisted for
 * offline reading. Chat is a separate feature.
 */
export default function MessagesScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const colors = useThemeColors();
  const toast = useToast();
  const { canUserCreateMessages } = useSecurity();
  const inbox = useMessagesStore((state) => state.inboxMessages);
  const sent = useMessagesStore((state) => state.sentMessages);
  const readIds = useMessagesStore((state) => state.readMessageIds);
  const queued = useMessagesStore((state) => state.queuedMessages);
  const isLoading = useMessagesStore((state) => state.loading.inbox === true || state.loading.sent === true);
  const loadError = useMessagesStore((state) => state.errors.inbox ?? state.errors.sent ?? null);

  const [filter, setFilter] = useState<MessageFilter>('all');
  const [query, setQuery] = useState('');
  const [selection, setSelection] = useState<string[] | null>(null);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const load = useCallback(async (which: MessageFilter, bypassCache: boolean) => {
    const store = useMessagesStore.getState();

    await Promise.all([which === 'sent' ? undefined : store.fetchInboxMessages({ bypassCache }), which === 'inbox' ? undefined : store.fetchSentMessages({ bypassCache })]);
  }, []);

  const reload = useCallback(() => load(filter, true), [filter, load]);

  useFocusEffect(
    useCallback(() => {
      void load(filter, false);
    }, [filter, load])
  );

  const items = useMemo(() => buildMessageList(inbox, sent, filter, query), [inbox, sent, filter, query]);
  const readSet = useMemo(() => new Set(readIds), [readIds]);
  const queuedList = useMemo(() => (filter === 'inbox' || query ? [] : Object.values(queued).sort((a, b) => b.createdAt - a.createdAt)), [queued, filter, query]);

  const rows = useMemo<Row[]>(
    () => [
      ...queuedList.map((message) => ({ type: 'queued' as const, key: `queued-${message.localId}`, queued: message })),
      ...items.map((item) => ({ type: 'message' as const, key: `${item.isOwn ? 'sent' : 'inbox'}-${item.message.MessageId}`, item })),
    ],
    [queuedList, items]
  );

  const counts: Record<MessageFilter, number> = { all: buildMessageList(inbox, sent, 'all', '').length, inbox: inbox.length, sent: sent.length };
  const filterTabs: TabBarItem<MessageFilter>[] = FILTERS.map((option) => ({ key: option.key, label: `${t(option.labelKey)} (${counts[option.key]})`, testID: `messages-filter-${option.key}` }));

  // A selection only makes sense in the list it was made in: switching lists ends it.
  const changeFilter = (next: MessageFilter) => {
    setSelection(null);
    setFilter(next);
  };

  const isRead = (item: MessageListItem): boolean => item.isOwn || readSet.has(item.message.MessageId) || !!item.message.RespondedOn;

  const press = (item: MessageListItem) => {
    if (selection) {
      const id = item.message.MessageId;
      setSelection(selection.includes(id) ? selection.filter((value) => value !== id) : [...selection, id]);

      return;
    }

    pushRoutePath(router, messageRoutes.detail(item.message.MessageId));
  };

  const compose = () => router.push(messageRoutes.compose());

  const longPress = (item: MessageListItem) => {
    if (!selection) setSelection([item.message.MessageId]);
  };

  const deleteSelected = async () => {
    if (!selection || selection.length === 0) return;
    setIsDeleting(true);
    const ok = await useMessagesStore.getState().deleteMessages(selection);
    setIsDeleting(false);
    setIsConfirmOpen(false);

    if (!ok) {
      toast.error(t('messages.delete_failed'));

      return;
    }

    toast.success(t('messages.deleted'));
    setSelection(null);
  };

  return (
    <View className="flex-1 bg-background-50" testID="messages-screen">
      <TabBar tabs={filterTabs} activeKey={filter} onChange={changeFilter} variant="pills" testID="messages-filters" />
      <VStack space="sm" className="border-b border-outline-200 bg-background-0 p-4">
        <Input variant="outline" size="md">
          <InputSlot className="pl-3">
            <InputIcon as={Search} />
          </InputSlot>
          <InputField placeholder={t('messages.search_placeholder')} value={query} onChangeText={setQuery} accessibilityLabel={t('messages.search_placeholder')} testID="messages-search-input" />
          {query ? (
            <InputSlot className="pr-3" onPress={() => setQuery('')} accessibilityRole="button" accessibilityLabel={t('common.clear_search')} testID="messages-clear-search">
              <InputIcon as={X} />
            </InputSlot>
          ) : null}
        </Input>

        {selection ? (
          <HStack space="sm" className="items-center justify-between" testID="messages-selection-bar">
            <HStack space="sm" className="items-center">
              <Pressable onPress={() => setSelection(null)} accessibilityRole="button" accessibilityLabel={t('common.cancel')} testID="messages-exit-selection" className="rounded-lg p-2">
                <RNView>
                  <X size={20} color={colors.icon} />
                </RNView>
              </Pressable>
              <Text size="sm" className="text-typography-700">
                {t('messages.selected_count', { count: selection.length })}
              </Text>
            </HStack>
            <HStack space="sm">
              <Button size="sm" variant="outline" onPress={() => setSelection(items.map((item) => item.message.MessageId))} testID="messages-select-all">
                <ButtonText>{t('messages.select_all')}</ButtonText>
              </Button>
              <Button size="sm" action="negative" onPress={() => setIsConfirmOpen(true)} isDisabled={selection.length === 0} testID="messages-delete-selected">
                <RNView>
                  <Trash2 size={16} color={colors.textInverse} />
                </RNView>
                <ButtonText>{t('messages.delete')}</ButtonText>
              </Button>
            </HStack>
          </HStack>
        ) : null}
      </VStack>

      {isLoading && rows.length === 0 ? (
        <Loading />
      ) : loadError && rows.length === 0 ? (
        <ZeroState isError heading={t('messages.load_error')} description={t(loadError.messageKey)} onRetry={reload} retryTestID="messages-retry" testID="messages-error" />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(row: Row) => row.key}
          extraData={selection}
          renderItem={({ item: row }: { item: Row }) =>
            row.type === 'queued' ? (
              <QueuedMessageRow message={row.queued} />
            ) : (
              <MessageCard item={row.item} isRead={isRead(row.item)} selectionMode={selection !== null} isSelected={selection?.includes(row.item.message.MessageId) ?? false} onPress={press} onLongPress={longPress} />
            )
          }
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={false} onRefresh={() => void reload()} />}
          ListEmptyComponent={
            <ZeroState icon={Mail} heading={t('messages.no_messages')} description={canUserCreateMessages ? t('messages.no_messages_description') : undefined} onRetry={reload} testID="messages-empty">
              {canUserCreateMessages ? (
                <Button onPress={compose} className="mt-4" testID="messages-empty-compose">
                  <ButtonText>{t('messages.send_first_message')}</ButtonText>
                </Button>
              ) : null}
            </ZeroState>
          }
          testID="messages-list"
        />
      )}

      {!selection && canUserCreateMessages ? (
        <Fab size="lg" placement="bottom right" onPress={compose} accessibilityLabel={t('messages.compose')} testID="messages-compose-fab">
          <FabIcon as={MessageSquarePlus} />
        </Fab>
      ) : null}

      <MessagesConfirmSheet
        isOpen={isConfirmOpen}
        title={t('messages.delete_confirmation_title')}
        message={t('messages.delete_confirmation_message', { count: selection?.length ?? 0 })}
        confirmLabel={t('messages.delete')}
        isBusy={isDeleting}
        onConfirm={() => void deleteSelected()}
        onClose={() => setIsConfirmOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  list: { paddingTop: 8, paddingBottom: 96 },
});
