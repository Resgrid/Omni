import { useCommandStore } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import { IncidentCommandStatus, type IncidentCommandSummary } from '@resgrid/models';
import { Box, FlatList, HStack, Input, InputField, Loading, Pressable, RefreshControl, Text, useToast, View, ZeroState } from '@resgrid/ui';
import { router, useFocusEffect } from 'expo-router';
import { LayoutDashboard, Search } from 'lucide-react-native';
import React, { useCallback, useMemo, useState } from 'react';

import { IncidentCard } from '../components/incident-card';
import { useNow } from '../hooks/use-now';
import { incidentCommandRoutes } from '../routes';

/** Search over the card's visible fields (IC incidents screen). */
export const matchesIncidentSearch = (summary: IncidentCommandSummary, query: string): boolean => {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return true;
  return [String(summary.CallId), summary.CallNumber, summary.Name, summary.CallName, summary.CallAddress, summary.CommanderName, summary.CommandPostLocationText].some((value) =>
    value?.toLocaleLowerCase().includes(normalized)
  );
};

/**
 * IC's incident list (`/incidents`, GetCommandList): active incidents by default, ended ones on request. Opening an
 * active incident tracks its board on this device and shows it on the command tab; an ended one opens its call.
 */
export default function IncidentsListScreen() {
  const { t } = useTranslation();
  const toast = useToast();
  const summaries = useCommandStore((state) => state.summaries);
  const boards = useCommandStore((state) => state.boards);
  const isLoading = useCommandStore((state) => state.loading.incidents === true);
  const hasError = useCommandStore((state) => !!state.errors.incidents);
  const fetchIncidents = useCommandStore((state) => state.fetchIncidents);
  const [includeClosed, setIncludeClosed] = useState(false);
  const [query, setQuery] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const nowMs = useNow(60_000);

  useFocusEffect(
    useCallback(() => {
      void fetchIncidents(includeClosed);
    }, [fetchIncidents, includeClosed])
  );

  const rows = useMemo(
    () => summaries.filter((summary) => (includeClosed ? true : summary.Status === IncidentCommandStatus.Active)).filter((summary) => matchesIncidentSearch(summary, query)),
    [includeClosed, query, summaries]
  );

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    await fetchIncidents(includeClosed);
    setIsRefreshing(false);
  }, [fetchIncidents, includeClosed]);

  const open = useCallback(
    async (summary: IncidentCommandSummary) => {
      const callId = String(summary.CallId);
      if (summary.Status !== IncidentCommandStatus.Active) {
        router.push(`/call/${encodeURIComponent(callId)}` as never);
        return;
      }
      const store = useCommandStore.getState();
      if (!store.boards[callId]?.board) await store.refreshBoard(callId, { bypassCache: true });
      if (useCommandStore.getState().boards[callId]?.board) {
        useCommandStore.getState().switchCommand(callId);
        router.push(incidentCommandRoutes.board() as never);
      } else {
        toast.error(t('incident_command.track_failed'));
      }
    },
    [t, toast]
  );

  const filterChip = (value: boolean, label: string, testID: string) => (
    <Pressable
      onPress={() => setIncludeClosed(value)}
      accessibilityRole="radio"
      accessibilityState={{ selected: includeClosed === value }}
      className={`rounded-full px-4 py-2 ${includeClosed === value ? 'bg-primary-500' : 'bg-background-200'}`}
      testID={testID}
    >
      <Text className={`text-sm font-semibold ${includeClosed === value ? 'text-white' : 'text-typography-700'}`}>{label}</Text>
    </Pressable>
  );

  return (
    <View className="flex-1 bg-background-50" testID="incidents-screen">
      <Box className="flex-1 px-4 pt-2">
        <Input className="mb-3" size="md" variant="outline">
          <InputField
            value={query}
            onChangeText={setQuery}
            placeholder={t('incident_command.search_incidents')}
            accessibilityLabel={t('incident_command.search_incidents')}
            returnKeyType="search"
            testID="incidents-search"
          />
        </Input>
        <HStack className="mb-3" space="sm" accessibilityRole="radiogroup">
          {filterChip(false, t('incident_command.filter_active'), 'incidents-filter-active')}
          {filterChip(true, t('incident_command.filter_all'), 'incidents-filter-all')}
        </HStack>
        {isLoading && summaries.length === 0 ? (
          <Loading text={t('common.loading')} />
        ) : hasError && summaries.length === 0 ? (
          <ZeroState heading={t('common.errorOccurred')} description={t('incident_command.incidents_error')} isError testID="incidents-error" />
        ) : (
          <FlatList<IncidentCommandSummary>
            data={rows}
            keyExtractor={(item: IncidentCommandSummary) => item.IncidentCommandId}
            renderItem={({ item }: { item: IncidentCommandSummary }) => <IncidentCard summary={item} nowMs={nowMs} isTracked={!!boards[String(item.CallId)]?.board} onPress={(summary) => void open(summary)} />}
            refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => void refresh()} />}
            ListEmptyComponent={
              query.trim() ? (
                <ZeroState icon={Search} heading={t('common.no_results_found')} description={t('incident_command.no_incident_results')} testID="incidents-no-results" />
              ) : (
                <ZeroState icon={LayoutDashboard} heading={t('incident_command.no_incidents')} description={t('incident_command.no_incidents_description')} testID="incidents-empty" />
              )
            }
            testID="incidents-list"
          />
        )}
      </Box>
    </View>
  );
}
