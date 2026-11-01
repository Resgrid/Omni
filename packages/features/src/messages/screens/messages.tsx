import { useSecurity } from '@resgrid/auth';
import { type QueuedMessage, useMessagesStore } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import type { MessageResultData } from '@resgrid/models';
import { Button, ButtonText, Fab, FabIcon, FlatList, HStack, Input, InputField, InputIcon, InputSlot, Loading, Pressable, RefreshControl, Text, useThemeColors, useToast, View, VStack, ZeroState } from '@resgrid/ui';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Mail, MessageSquarePlus, Search, Trash2, X } from 'lucide-react-native';
import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View as RNView } from 'react-native';

import { ComposeMessageSheet } from '../components/compose-message-sheet';
import { MessagesConfirmSheet } from '../components/confirm-sheet';
import { MessageCard } from '../components/message-card';
import { MessageDetailsSheet } from '../components/message-details-sheet';
import { QueuedMessageRow } from '../components/queued-message-row';
import { buildMessageList, type MessageFilter, type MessageListItem } from '../lib/message-format';

type Row = { type: 'queued'; key: string; queued: QueuedMessage } | { type: 'message'; key: string; item: MessageListItem };

const FILTERS: readonly { key: MessageFilter; labelKey: string }[] = [
  { key: 'all', labelKey: 'messages.all_messages' },
  { key: 'inbox', labelKey: 'messages.inbox' },
  { key: 'sent', labelKey: 'messages.sent' },
];

export interface MessagesScreenProps {
  /** Opens compose on arrival (`/messages?compose=1`). Defaults to the route param. */
  openCompose?: boolean;
}

/**
 * Messages (Responder inbox/outbox): search, All / Inbox / Sent, unread markers, long-press multi-select delete,
 * compose (offline-capable through the outbox; queued messages show until sent) and a detail sheet with answers.
 * The 30 most recent days are persisted for offline reading. Chat is a separate feature.
 */
export default function MessagesScreen({ openCompose }: MessagesScreenProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const toast = useToast();
  const { canUserCreateMessages } = useSecurity();
  const params = useLocalSearchParams<{ compose?: string | string[] }>();
  const composeParam = Array.isArray(params.compose) ? params.compose[0] : params.compose;
  const inbox = useMessagesStore((state) => state.inboxMessages);
  const sent = useMessagesStore((state) => state.sentMessages);
  const readIds = useMessagesStore((state) => state.readMessageIds);
  const queued = useMessagesStore((state) => state.queuedMessages);
  const isLoading = useMessagesStore((state) => state.loading.inbox === true || state.loading.sent === true);
  const loadError = useMessagesStore((state) => state.errors.inbox ?? state.errors.sent ?? null);

  const [filter, setFilter] = useState<MessageFilter>('all');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<MessageListItem | null>(null);
  const [isComposeOpen, setIsComposeOpen] = useState(() => (openCompose ?? ['1', 'true'].includes(composeParam ?? '')) && canUserCreateMessages);
  const [selection, setSelection] = useState<string[] | null>(null);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const load = useCallback((which: MessageFilter, bypassCache: boolean) => {
    const store = useMessagesStore.getState();
    if (which !== 'sent') void store.fetchInboxMessages({ bypassCache });
    if (which !== 'inbox') void store.fetchSentMessages({ bypassCache });
  }, []);

  useFocusEffect(
    useCallback(() => {
      load(filter, false);
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

  const isRead = (item: MessageListItem): boolean => item.isOwn || readSet.has(item.message.MessageId) || !!item.message.RespondedOn;

  const press = (item: MessageListItem) => {
    if (selection) {
      const id = item.message.MessageId;
      setSelection(selection.includes(id) ? selection.filter((value) => value !== id) : [...selection, id]);
      return;
    }
    setSelected(item);
  };
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

  const selectedMessage: MessageResultData | null = selected?.message ?? null;

  return (
    <View className="flex-1 bg-background-50" testID="messages-screen">
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
        ) : (
          <HStack space="sm" accessibilityRole="tablist">
            {FILTERS.map((option) => {
              const isActive = filter === option.key;
              return (
                <Pressable
                  key={option.key}
                  onPress={() => setFilter(option.key)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: isActive }}
                  testID={`messages-filter-${option.key}`}
                  className={`flex-row items-center rounded-full border px-3 py-1.5 ${isActive ? 'border-primary-600 bg-primary-600' : 'border-outline-300 bg-background-0'}`}
                >
                  <Text size="sm" className={isActive ? 'font-semibold text-typography-0' : 'text-typography-700'}>
                    {`${t(option.labelKey)} (${counts[option.key]})`}
                  </Text>
                </Pressable>
              );
            })}
          </HStack>
        )}
      </VStack>

      {isLoading && rows.length === 0 ? (
        <Loading />
      ) : loadError && rows.length === 0 ? (
        <ZeroState isError heading={t('messages.load_error')} description={t(loadError.messageKey)} testID="messages-error">
          <Button onPress={() => load(filter, true)} className="mt-4" testID="messages-retry">
            <ButtonText>{t('common.retry')}</ButtonText>
          </Button>
        </ZeroState>
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
          refreshControl={<RefreshControl refreshing={false} onRefresh={() => load(filter, true)} />}
          ListEmptyComponent={
            <ZeroState icon={Mail} heading={t('messages.no_messages')} description={canUserCreateMessages ? t('messages.no_messages_description') : undefined} testID="messages-empty">
              {canUserCreateMessages ? (
                <Button onPress={() => setIsComposeOpen(true)} className="mt-4" testID="messages-empty-compose">
                  <ButtonText>{t('messages.send_first_message')}</ButtonText>
                </Button>
              ) : null}
            </ZeroState>
          }
          testID="messages-list"
        />
      )}

      {!selection && canUserCreateMessages ? (
        <Fab size="lg" placement="bottom right" onPress={() => setIsComposeOpen(true)} accessibilityLabel={t('messages.compose')} testID="messages-compose-fab">
          <FabIcon as={MessageSquarePlus} />
        </Fab>
      ) : null}

      <MessageDetailsSheet message={selectedMessage} isOwn={selected?.isOwn ?? false} onClose={() => setSelected(null)} />
      <ComposeMessageSheet isOpen={isComposeOpen} onClose={() => setIsComposeOpen(false)} />
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
