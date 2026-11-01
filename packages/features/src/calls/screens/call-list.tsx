import { useSecurity, useTerm } from '@resgrid/auth';
import { useCapability } from '@resgrid/config';
import { type CallListItem, useCallsStore, useCheckInTimersStore } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import type { DispatchedEventResultData } from '@resgrid/models';
import { Button, ButtonText, FlatList, Loading, Pressable, RefreshControl, Text, useFormFactor, ZeroState } from '@resgrid/ui';
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
  /** Show the in-content title row (default true; off when the shell header already titles the screen). */
  showHeader?: boolean;
}

const TAB_KEYS: Record<CallListTab, string> = { active: 'calls.tabs.active', pending: 'calls.tabs.pending', scheduled: 'calls.tabs.scheduled' };

/**
 * The call list for every variant (omni-plan §7.10). Pending and Scheduled tabs exist only with
 * `capabilities.calls.queues` (Dispatch); this device's queued offline calls come first with their
 * "Queued — not dispatched yet" badge; id-only call pushes refetch bypassing caches.
 */
export default function CallListScreen({ density, realtime = true, onOpenCall, showHeader = true }: CallListScreenProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const calls = useCapability('calls');
  const { canUserCreateCalls } = useSecurity();
  const { formFactor } = useFormFactor();
  const isOnline = useIsOnline();
  const title = useTerm('module.calls', t('calls.title'));
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
  const canCreate = calls.create !== 'none' && canUserCreateCalls;

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
        router.push(callCorrect(call.queued.localId));
        return;
      }
      if (onOpenCall) onOpenCall(call.CallId);
      else router.push(callDetail(call.CallId));
    },
    [onOpenCall, router]
  );

  const openCallById = useCallback((callId: string) => (onOpenCall ? onOpenCall(callId) : router.push(callDetail(callId))), [onOpenCall, router]);

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
    <ZeroState isError heading={t('errors.data.unknown')} description={t('common.tryAgainLater')} testID="call-list-error">
      <Button onPress={() => void refresh()} accessibilityLabel={t('common.retry')}>
        <ButtonText>{t('common.retry')}</ButtonText>
      </Button>
    </ZeroState>
  ) : (
    <ZeroState heading={hasActiveFilters(filters) ? t('common.no_results_found') : t('calls.no_calls')} description={hasActiveFilters(filters) ? undefined : t('calls.no_calls_description')} testID="call-list-empty" />
  );

  return (
    <View style={styles.screen} className="bg-background-50" testID="call-list-screen">
      {showHeader ? (
        <View style={styles.header}>
          <Text className="text-xl font-bold text-typography-900" accessibilityRole="header">
            {title}
          </Text>
          {canCreate ? (
            <Button size="sm" onPress={() => router.push(callNew())} accessibilityLabel={t('calls.new_call')} testID="call-list-new">
              <View style={styles.buttonIcon}>
                <Plus size={16} color="#FFFFFF" />
              </View>
              <ButtonText>{t('calls.new_call')}</ButtonText>
            </Button>
          ) : null}
        </View>
      ) : null}

      {!isOnline ? <OfflineCallBanner context="list" queuedCount={queuedCount} /> : null}
      <SyncedCallNotices onOpenCall={openCallById} />

      {tabs.length > 1 ? (
        <View style={styles.tabs} accessibilityRole="tablist" testID="call-list-tabs">
          {tabs.map((key) => {
            const count = key === 'pending' ? pendingCalls.length : key === 'scheduled' ? scheduledCalls.length : activeCalls.length;
            const selected = key === activeTab;
            return (
              <Pressable
                key={key}
                onPress={() => setTab(key)}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                accessibilityLabel={`${t(TAB_KEYS[key])} (${count})`}
                testID={`call-list-tab-${key}`}
                className={`mr-2 rounded-full px-4 py-1.5 ${selected ? 'bg-primary-600' : 'bg-background-200'}`}
              >
                <Text size="sm" className={selected ? 'font-semibold text-typography-0' : 'text-typography-700'}>
                  {`${t(TAB_KEYS[key])} (${count})`}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      <CallFiltersBar filters={filters} onChange={setFilters} priorities={priorities} />

      <FlatList
        data={visible}
        keyExtractor={(item: CallListItem) => item.CallId}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        ListEmptyComponent={emptyState}
        refreshControl={<RefreshControl refreshing={false} onRefresh={() => void refresh()} />}
        testID="call-list"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingTop: 12 },
  buttonIcon: { marginRight: 4 },
  tabs: { flexDirection: 'row', paddingHorizontal: 12, paddingTop: 8 },
  list: { paddingHorizontal: 12, paddingBottom: 24, paddingTop: 8 },
});
