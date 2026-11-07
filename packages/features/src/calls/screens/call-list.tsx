import { useCapability } from '@resgrid/config';
import { pushRoutePath } from '@resgrid/core/navigation/route-paths';
import { type CallListItem, useCallsStore, useCheckInTimersStore } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import type { DispatchedEventResultData } from '@resgrid/models';
import { Fab, FlatList, Loading, RefreshControl, TabBar, type TabBarItem, useFormFactor, useThemeColors, ZeroState } from '@resgrid/ui';
import { useRouter } from 'expo-router';
import { Plus } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { CallCard, type CallCardDensity, type CallCardTimerState } from '../components/call-card';
import { CallFiltersBar } from '../components/call-filters-bar';
import { OfflineCallBanner } from '../components/offline-call-banner';
import { SyncedCallNotices } from '../components/synced-call-notices';
import { useCallAssignmentContext } from '../hooks/use-call-assignment-context';
import { useCallList } from '../hooks/use-call-list';
import { useCallPermissions } from '../hooks/use-call-permissions';
import { useIsOnline } from '../hooks/use-connectivity';
import { type CallListFilters, type CallListTab, EMPTY_CALL_FILTERS, filterCalls, hasActiveFilters } from '../lib/call-filters';
import { priorityOptions, resolvePriority } from '../lib/call-priority';
import { callCorrect, callDetail, callNew } from '../routes';

export interface CallListScreenProps {
  /** Row density; defaults by form factor (wall boards get `wall`, desktop consoles `compact`). */
  density?: CallCardDensity;
  /** Subscribe to call pushes (default true). */
  realtime?: boolean;
  /** Override navigation to a call (e.g. a console opening a side panel instead of a route). */
  onOpenCall?: (callId: string) => void;
}

const TAB_KEYS: Record<CallListTab, string> = { active: 'calls.tabs.active', pending: 'calls.tabs.pending', scheduled: 'calls.tabs.scheduled' };

/**
 * The call list for every variant (omni-plan §7.10). Pending and Scheduled tabs exist only with
 * `capabilities.calls.queues` (Dispatch); this device's queued offline calls come first with their
 * "Queued — not dispatched yet" badge; id-only call pushes refetch bypassing caches.
 */
export default function CallListScreen({ density, realtime = true, onOpenCall }: CallListScreenProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const router = useRouter();
  const calls = useCapability('calls');
  const { canCreate } = useCallPermissions();
  const { formFactor } = useFormFactor();
  const isOnline = useIsOnline();
  const assignment = useCallAssignmentContext();
  const { activeCalls, pendingCalls, scheduledCalls, isLoading, hasError, refresh } = useCallList({ queues: calls.queues, realtime });
  const callPriorities = useCallsStore((state) => state.callPriorities);
  const callExtrasById = useCallsStore((state) => state.callExtrasById);
  const callDispatches = useCallsStore((state) => state.callDispatches);
  const queuedCount = useCallsStore((state) => Object.keys(state.queuedCalls).length);
  const fetchCallDispatches = useCallsStore((state) => state.fetchCallDispatches);
  const timerStatuses = useCheckInTimersStore((state) => state.statusesByCall);
  const [tab, setTab] = useState<CallListTab>('active');
  const [filters, setFilters] = useState<CallListFilters>(EMPTY_CALL_FILTERS);

  const rowDensity: CallCardDensity = density ?? (formFactor === 'wall' ? 'wall' : 'comfortable');
  const tabs: CallListTab[] = calls.queues ? ['active', 'pending', 'scheduled'] : ['active'];
  const activeTab: CallListTab = tabs.includes(tab) ? tab : 'active';
  const source: CallListItem[] = activeTab === 'pending' ? pendingCalls : activeTab === 'scheduled' ? scheduledCalls : activeCalls;
  const visible = useMemo(() => filterCalls(source, filters), [source, filters]);
  const priorities = useMemo(() => priorityOptions(callPriorities), [callPriorities]);

  const tabItems: TabBarItem<CallListTab>[] = tabs.map((key) => {
    const count = key === 'pending' ? pendingCalls.length : key === 'scheduled' ? scheduledCalls.length : activeCalls.length;

    return { key, label: `${t(TAB_KEYS[key])} (${count})`, testID: `call-list-tab-${key}` };
  });

  // Dispatches drive the ticker and the assignment outline; the store keeps them per call with a TTL (Unit).
  const serverCallIds = useMemo(() => activeCalls.filter((call) => !call.queued).map((call) => call.CallId), [activeCalls]);
  const serverCallIdsKey = serverCallIds.join(',');
  useEffect(() => {
    if (rowDensity !== 'compact' && serverCallIds.length > 0) void fetchCallDispatches(serverCallIds);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the id list, not the array identity
  }, [serverCallIdsKey, rowDensity, fetchCallDispatches]);

  const openCall = useCallback(
    (call: CallListItem) => {
      if (call.queued?.state === 'rejected') {
        pushRoutePath(router, callCorrect(call.queued.localId));
        return;
      }
      if (onOpenCall) onOpenCall(call.CallId);
      else pushRoutePath(router, callDetail(call.CallId));
    },
    [onOpenCall, router]
  );

  const openCallById = useCallback((callId: string) => (onOpenCall ? onOpenCall(callId) : pushRoutePath(router, callDetail(callId))), [onOpenCall, router]);

  const dispatchesFor = useCallback((callId: string): DispatchedEventResultData[] | null => callExtrasById[callId]?.Dispatches ?? callDispatches[callId] ?? null, [callExtrasById, callDispatches]);

  const timerStateFor = useCallback(
    (callId: string): CallCardTimerState | null => {
      const statuses = timerStatuses[callId];
      if (!statuses || statuses.length === 0) return null;
      return {
        overdue: statuses.filter((status) => status.Status === 'Overdue' || status.Status === 'Critical' || status.Status === 'Red').length,
        warning: statuses.filter((status) => status.Status === 'Warning' || status.Status === 'Yellow').length,
      };
    },
    [timerStatuses]
  );

  const renderItem = useCallback(
    ({ item }: { item: CallListItem }) => {
      const priority = resolvePriority(callPriorities, item.Priority);
      return (
        <CallCard
          call={item}
          density={rowDensity}
          priorityColor={priority?.color}
          priorityLabel={priority ? (priority.isLabelKey ? t(priority.label) : priority.label) : null}
          dispatches={dispatchesFor(item.CallId)}
          assignmentContext={assignment}
          timerState={item.CheckInTimersEnabled ? timerStateFor(item.CallId) : null}
          onPress={openCall}
        />
      );
    },
    [assignment, callPriorities, dispatchesFor, openCall, rowDensity, t, timerStateFor]
  );

  const emptyState = isLoading ? (
    <Loading text={t('calls.loading')} />
  ) : hasError && activeTab === 'active' && visible.length === 0 ? (
    <ZeroState isError heading={t('errors.data.unknown')} description={t('common.tryAgainLater')} onRetry={refresh} testID="call-list-error" />
  ) : (
    <ZeroState
      heading={hasActiveFilters(filters) ? t('common.no_results_found') : t('calls.no_calls')}
      description={hasActiveFilters(filters) ? undefined : t('calls.no_calls_description')}
      onRetry={refresh}
      testID="call-list-empty"
    />
  );

  return (
    <View style={styles.screen} className="bg-background-50" testID="call-list-screen">
      {!isOnline ? <OfflineCallBanner context="list" queuedCount={queuedCount} /> : null}
      <SyncedCallNotices onOpenCall={openCallById} />

      {tabs.length > 1 ? <TabBar tabs={tabItems} activeKey={activeTab} onChange={setTab} variant="pills" testID="call-list-tabs" /> : null}

      <CallFiltersBar filters={filters} onChange={setFilters} priorities={priorities} />

      <FlatList
        data={visible}
        keyExtractor={(item: CallListItem) => item.CallId}
        renderItem={renderItem}
        contentContainerStyle={canCreate ? styles.listAboveFab : styles.list}
        ListEmptyComponent={emptyState}
        refreshControl={<RefreshControl refreshing={false} onRefresh={() => void refresh()} />}
        testID="call-list"
      />
      {/* The shell header titles the screen; New Call floats over the list rather than adding a second header row. */}
      {canCreate ? (
        <Fab size="lg" placement="bottom right" onPress={() => router.push(callNew())} accessibilityLabel={t('calls.new_call')} testID="call-list-new">
          <View>
            <Plus size={24} color={colors.textInverse} />
          </View>
        </Fab>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  list: { paddingHorizontal: 12, paddingBottom: 24, paddingTop: 8 },
  // Room for the New Call button over the last card.
  listAboveFab: { paddingHorizontal: 12, paddingBottom: 96, paddingTop: 8 },
});
