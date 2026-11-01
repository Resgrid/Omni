import { isSafeRouteId } from '@resgrid/core/utils/route-ids';
import { useCommandStore } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import type { CommandLogEntry } from '@resgrid/models';
import { FlatList, HStack, Input, InputField, RefreshControl, ScreenHeader, Text, View, ZeroState } from '@resgrid/ui';
import { router, useLocalSearchParams } from 'expo-router';
import { RefreshCw, ScrollText } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { IconPress } from '../components/board-buttons';
import { LogEntryRow, sortLogEntries } from '../components/log-section';

const EMPTY: CommandLogEntry[] = [];

export interface CommandLogScreenProps {
  callId?: string;
}

/** The full incident log (`/command-log/[callId]`, IC): every server-logged entry, newest first, with text search. */
export default function CommandLogScreen({ callId: callIdProp }: CommandLogScreenProps) {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ callId?: string | string[] }>();
  const raw = callIdProp ?? (Array.isArray(params.callId) ? params.callId[0] : params.callId);
  const callId = isSafeRouteId(raw) ? raw : null;
  const entries = useCommandStore((state) => (callId ? (state.boards[callId]?.timeline ?? EMPTY) : EMPTY));
  const isLoading = useCommandStore((state) => state.loading.timeline === true);
  const fetchTimeline = useCommandStore((state) => state.fetchTimeline);
  const [query, setQuery] = useState('');

  const load = useCallback(() => {
    if (callId) void fetchTimeline(callId);
  }, [callId, fetchTimeline]);

  useEffect(load, [load]);

  const rows = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    const sorted = sortLogEntries(entries);
    return normalized ? sorted.filter((entry) => entry.Description?.toLocaleLowerCase().includes(normalized) ?? false) : sorted;
  }, [entries, query]);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/command' as never));

  return (
    <View className="flex-1 bg-background-50" testID="command-log-screen">
      <ScreenHeader title={t('incident_command.log')} onBack={back} right={<IconPress label={t('incident_command.refresh')} icon={RefreshCw} onPress={load} testID="command-log-refresh" />} />
      {callId ? (
        <>
          <View className="px-4 pb-2">
            <Input size="md" variant="outline">
              <InputField value={query} onChangeText={setQuery} placeholder={t('incident_command.search_log')} accessibilityLabel={t('incident_command.search_log')} testID="command-log-search" />
            </Input>
            <HStack className="mt-1">
              <Text className="text-xs text-typography-500" testID="command-log-count">
                {query.trim() ? t('incident_command.log_results', { shown: rows.length, total: entries.length }) : t('incident_command.log_count', { count: entries.length })}
              </Text>
            </HStack>
          </View>
          <FlatList<CommandLogEntry>
            data={rows}
            keyExtractor={(item: CommandLogEntry) => item.CommandLogEntryId}
            renderItem={({ item }: { item: CommandLogEntry }) => (
              <View className="px-4 py-1">
                <LogEntryRow entry={item} testID={`command-log-entry-${item.CommandLogEntryId}`} />
              </View>
            )}
            refreshControl={<RefreshControl refreshing={isLoading} onRefresh={load} />}
            ListEmptyComponent={<ZeroState icon={ScrollText} heading={t('incident_command.no_log')} testID="command-log-empty" />}
            testID="command-log-list"
          />
        </>
      ) : (
        <ZeroState icon={ScrollText} heading={t('incident_command.not_found')} isError testID="command-log-invalid" />
      )}
    </View>
  );
}
