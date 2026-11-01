import { formatUtcInDepartmentTime } from '@resgrid/core/utils/dates';
import { useArchivedCallsStore, useCallsStore } from '@resgrid/data';
import { callRoutes, priorityOptions } from '@resgrid/features/calls';
import { useTranslation } from '@resgrid/i18n';
import { DateTimeField, HStack, Loading, Pressable, ScrollView, Text, ZeroState } from '@resgrid/ui';
import { type Href, useRouter } from 'expo-router';
import { Archive, Filter, Search } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { FilterChip, QueueSearch } from '../components/queue-controls';
import { PriorityCell, type QueueColumn, QueueTable, TextCell, TypeCell } from '../components/queue-table';
import {
  ARCHIVED_CALL_STATES,
  type ArchivedCallFilters,
  archivedCallStateLabelKey,
  archivedCallTypes,
  countActiveArchivedCallFilters,
  EMPTY_ARCHIVED_CALL_FILTERS,
  filterArchivedCalls,
  toggled,
} from '../lib/archived-calls';

/** How long a loaded year counts as current when the screen comes back into view. */
export const ARCHIVED_CALLS_FRESH_MS = 60 * 1000;

export interface ArchivedCallsScreenProps {
  showHeader?: boolean;
  /** Clock for the freshness check (tests). */
  now?: () => number;
}

/**
 * Archived calls (Dispatch baseline): the department's closed calls a year at a time, with search, close-type,
 * priority, type and logged-date filters. Rows open the call. (Entering a past call, "Add Archived Call", needs Core's
 * `SaveArchivedCall`, which is not on Core develop yet.)
 */
export default function ArchivedCallsScreen({ showHeader = true, now = Date.now }: ArchivedCallsScreenProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const years = useArchivedCallsStore((state) => state.years);
  const selectedYear = useArchivedCallsStore((state) => state.selectedYear);
  const archivedCalls = useArchivedCallsStore((state) => state.archivedCalls);
  const isLoading = useArchivedCallsStore((state) => state.loading.years === true || state.loading.calls === true);
  const error = useArchivedCallsStore((state) => state.errors.calls ?? state.errors.years ?? null);
  const callPriorities = useCallsStore((state) => state.callPriorities);
  const [filters, setFilters] = useState<ArchivedCallFilters>(EMPTY_ARCHIVED_CALL_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    void useCallsStore.getState().fetchCallPriorities();
    // Archived calls rarely change: coming back reuses the year loaded a moment ago.
    if (now() - (useArchivedCallsStore.getState().fetchedAt.calls ?? 0) > ARCHIVED_CALLS_FRESH_MS) void useArchivedCallsStore.getState().load();
  }, [now]);

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    void useArchivedCallsStore
      .getState()
      .fetchArchivedCalls()
      .finally(() => setIsRefreshing(false));
  }, []);

  const priorities = useMemo(() => priorityOptions(callPriorities), [callPriorities]);
  const callTypes = useMemo(() => archivedCallTypes(archivedCalls), [archivedCalls]);
  const visible = useMemo(() => filterArchivedCalls(archivedCalls, filters), [archivedCalls, filters]);
  const activeFilterCount = countActiveArchivedCallFilters(filters);
  const update = (changes: Partial<ArchivedCallFilters>) => setFilters((current) => ({ ...current, ...changes }));

  const columns = useMemo<QueueColumn[]>(
    () => [
      { key: 'type', titleKey: 'scheduled_calls.table_type', flex: 1, render: (call) => <TypeCell call={call} /> },
      { key: 'priority', titleKey: 'scheduled_calls.table_priority', flex: 1, render: (call) => <PriorityCell priorityId={call.Priority} /> },
      {
        key: 'state',
        titleKey: 'archived_calls.table_state',
        flex: 1,
        render: (call) => {
          const key = archivedCallStateLabelKey(call.State);
          return <TextCell value={key ? t(key) : null} />;
        },
      },
      { key: 'address', titleKey: 'scheduled_calls.table_address', flex: 2, render: (call) => <TextCell value={call.Address} /> },
      { key: 'logged', titleKey: 'archived_calls.table_logged', flex: 1.5, render: (call) => <TextCell value={formatUtcInDepartmentTime(call.LoggedOnUtc, null)} /> },
      { key: 'closed', titleKey: 'archived_calls.table_closed', flex: 1.5, render: (call) => <TextCell value={formatUtcInDepartmentTime(call.ClosedOnUtc, null)} /> },
    ],
    [t]
  );

  const renderFilters = () => (
    <View className="mb-3 rounded-lg border border-outline-200 bg-background-0 p-3" testID="archived-calls-filters">
      <Text className="mb-1 text-xs font-semibold uppercase text-typography-500">{t('archived_calls.table_state')}</Text>
      <View style={styles.chipRow}>
        {ARCHIVED_CALL_STATES.map((state) => (
          <FilterChip
            key={state.value}
            label={t(state.labelKey)}
            active={filters.states.includes(state.value)}
            onPress={() => update({ states: toggled(filters.states, state.value) })}
            testID={`archived-filter-state-${state.value}`}
          />
        ))}
      </View>
      {priorities.length > 0 ? (
        <>
          <Text className="mb-1 text-xs font-semibold uppercase text-typography-500">{t('scheduled_calls.table_priority')}</Text>
          <View style={styles.chipRow}>
            {priorities.map((priority) => (
              <FilterChip
                key={priority.id}
                label={priority.isLabelKey ? t(priority.label) : priority.label}
                color={priority.color}
                active={filters.priorities.includes(priority.id)}
                onPress={() => update({ priorities: toggled(filters.priorities, priority.id) })}
                testID={`archived-filter-priority-${priority.id}`}
              />
            ))}
          </View>
        </>
      ) : null}
      {callTypes.length > 0 ? (
        <>
          <Text className="mb-1 text-xs font-semibold uppercase text-typography-500">{t('scheduled_calls.table_type')}</Text>
          <View style={styles.chipRow}>
            {callTypes.map((type) => (
              <FilterChip key={type} label={type} active={filters.types.includes(type)} onPress={() => update({ types: toggled(filters.types, type) })} testID={`archived-filter-type-${type}`} />
            ))}
          </View>
        </>
      ) : null}
      <Text className="mb-1 text-xs font-semibold uppercase text-typography-500">{t('archived_calls.logged_between')}</Text>
      <HStack space="sm">
        <View className="flex-1">
          <DateTimeField value={filters.fromDate} onChange={(fromDate) => update({ fromDate })} label={t('archived_calls.from_date')} mode="date" testID="archived-filter-from" />
        </View>
        <View className="flex-1">
          <DateTimeField value={filters.toDate} onChange={(toDate) => update({ toDate })} label={t('archived_calls.to_date')} mode="date" testID="archived-filter-to" />
        </View>
      </HStack>
      {activeFilterCount > 0 ? (
        <Pressable onPress={() => setFilters((current) => ({ ...EMPTY_ARCHIVED_CALL_FILTERS, query: current.query }))} accessibilityRole="button" className="mt-2 self-start" testID="archived-filters-clear">
          <Text className="text-sm font-medium text-primary-600">{t('archived_calls.clear_filters')}</Text>
        </Pressable>
      ) : null}
    </View>
  );

  const renderContent = () => {
    // Only the first load replaces the table; a refresh keeps the rows on screen.
    if (isLoading && archivedCalls.length === 0) return <Loading text={t('archived_calls.loading')} />;
    if (error && archivedCalls.length === 0) return <ZeroState heading={t('common.errorOccurred')} description={t(error.messageKey)} isError />;
    if (archivedCalls.length === 0) return <ZeroState heading={t('archived_calls.no_archived_calls')} description={t('archived_calls.no_archived_calls_description', { year: selectedYear ?? '' })} icon={Archive} />;
    if (visible.length === 0) return <ZeroState heading={t('archived_calls.no_matches')} description={t('archived_calls.no_matches_description')} icon={Search} />;
    return (
      <QueueTable
        calls={visible}
        columns={columns}
        onOpenCall={(call) => router.push(callRoutes.callDetail(call.CallId) as Href)}
        refreshing={isRefreshing}
        onRefresh={handleRefresh}
        testID="archived-calls-table"
        rowTestID="archived-call-row"
      />
    );
  };

  return (
    <View className="flex-1 bg-background-50 px-4 pt-4" testID="archived-calls-screen">
      {showHeader ? <Text className="mb-3 text-lg font-bold">{t('archived_calls.title')}</Text> : null}
      <View className="mb-3 flex-row items-center">
        <QueueSearch value={filters.query} onChange={(query) => update({ query })} placeholder={t('archived_calls.search')} testID="archived-calls-search" />
        <Pressable
          onPress={() => setShowFilters((shown) => !shown)}
          accessibilityRole="button"
          accessibilityState={{ expanded: showFilters }}
          accessibilityLabel={t('archived_calls.filters')}
          className={`ml-2 flex-row items-center rounded-lg border border-outline-200 px-3 py-2 ${showFilters || activeFilterCount > 0 ? 'bg-primary-50' : 'bg-background-0'}`}
          testID="archived-calls-filters-toggle"
        >
          <View>
            <Filter size={16} color="#4b5563" />
          </View>
          <Text className="ml-1 text-sm text-typography-700">{activeFilterCount > 0 ? `${t('archived_calls.filters')} (${activeFilterCount})` : t('archived_calls.filters')}</Text>
        </Pressable>
      </View>
      {years.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-3 flex-grow-0" testID="archived-calls-years">
          {years.map((year) => (
            <FilterChip key={year} label={year} active={year === selectedYear} onPress={() => void useArchivedCallsStore.getState().selectYear(year)} testID={`archived-year-${year}`} />
          ))}
        </ScrollView>
      ) : null}
      {showFilters ? renderFilters() : null}
      <View className="flex-1">{renderContent()}</View>
    </View>
  );
}

const styles = StyleSheet.create({ chipRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 4 } });
