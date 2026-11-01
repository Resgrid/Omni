import { useSecurity } from '@resgrid/auth';
import { useCallsStore, useCheckInTimersStore } from '@resgrid/data';
import { resolvePriority } from '@resgrid/features/calls';
import { checkInSeverity } from '@resgrid/features/check-in';
import { useTranslation } from '@resgrid/i18n';
import type { CallResultData, DispatchedEventResultData } from '@resgrid/models';
import { FlatList, Text } from '@resgrid/ui';
import { AlertTriangle, Plus, RefreshCw } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { selectCardCollapsed, useDashboardViewStore } from '../hooks/use-dashboard-view-store';
import { filterConsoleCalls } from '../lib/console-filters';
import { ConsoleCallCard } from './console-call-card';
import { PanelFrame, PanelIconButton } from './panel-frame';
import { PanelSearch } from './panel-search';

/** How often check-in timers are re-read while the panel is open (the overdue badges). */
export const CHECK_IN_POLL_MS = 30 * 1000;

const NO_DISPATCHES: DispatchedEventResultData[] = [];

export interface ActiveCallsPanelProps {
  selectedCallId: string | null;
  isFilterActive: boolean;
  onSelectCall: (callId: string) => void;
  onOpenCall: (callId: string) => void;
  onNewCall?: () => void;
  onAddResources?: (call: CallResultData) => void;
  flex?: number;
  maxHeight?: number;
  /** Clock (tests). */
  now?: () => number;
}

/**
 * The console's active calls (Dispatch baseline): searchable priority-coloured cards with their dispatched resources
 * (the calls store keeps each call's dispatches with a TTL) and blinking-red overdue check-ins. Pressing a card filters
 * the whole console to the call.
 */
export const ActiveCallsPanel: React.FC<ActiveCallsPanelProps> = ({ selectedCallId, isFilterActive, onSelectCall, onOpenCall, onNewCall, onAddResources, flex, maxHeight, now = Date.now }) => {
  const { t } = useTranslation();
  const { canUserCreateCalls } = useSecurity();
  const calls = useCallsStore((state) => state.calls);
  const callPriorities = useCallsStore((state) => state.callPriorities);
  const callDispatches = useCallsStore((state) => state.callDispatches);
  const isLoading = useCallsStore((state) => state.loading.calls === true);
  const hasError = useCallsStore((state) => !!state.errors.calls);
  const timerStatuses = useCheckInTimersStore((state) => state.statusesByCall);
  const isCollapsed = useDashboardViewStore(selectCardCollapsed('active-calls'));
  const [query, setQuery] = useState('');

  const visible = useMemo(() => filterConsoleCalls(calls, query, now()), [calls, now, query]);
  const idsKey = visible.map((call) => call.CallId).join(',');
  const timerIdsKey = visible
    .filter((call) => call.CheckInTimersEnabled)
    .map((call) => call.CallId)
    .join(',');

  useEffect(() => {
    if (idsKey) void useCallsStore.getState().fetchCallDispatches(idsKey.split(','));
  }, [idsKey]);

  // The overdue badges are this panel's use of the timers, so it polls them while expanded.
  useEffect(() => {
    if (isCollapsed || !timerIdsKey) return undefined;
    const ids = timerIdsKey.split(',').map(Number).filter(Number.isFinite);
    const poll = () => void useCheckInTimersStore.getState().fetchTimerStatusesForCalls(ids, { silent: true });
    poll();
    const timer = setInterval(poll, CHECK_IN_POLL_MS);
    return () => clearInterval(timer);
  }, [isCollapsed, timerIdsKey]);

  const refresh = useCallback(() => {
    const store = useCallsStore.getState();
    void store.fetchCalls({ bypassCache: true });
    void store.fetchCallPriorities({ bypassCache: true });
    if (idsKey) void store.fetchCallDispatches(idsKey.split(','), { bypassCache: true });
  }, [idsKey]);

  const renderItem = useCallback(
    ({ item }: { item: CallResultData }) => {
      const dispatches = callDispatches[item.CallId] ?? NO_DISPATCHES;
      const overdueIds = new Set((timerStatuses[item.CallId] ?? []).filter((timer) => checkInSeverity(timer.Status) === 'critical').map((timer) => timer.TargetEntityId));
      const overdueNames = overdueIds.size > 0 ? dispatches.filter((dispatch) => overdueIds.has(dispatch.Id)).map((dispatch) => dispatch.Name) : [];
      return (
        <ConsoleCallCard
          call={item}
          priorityColor={resolvePriority(callPriorities, item.Priority)?.color || '#6b7280'}
          dispatches={dispatches}
          overdueNames={overdueNames}
          isSelected={isFilterActive ? selectedCallId === item.CallId : false}
          now={now()}
          onSelect={onSelectCall}
          onOpenDetails={onOpenCall}
          onAddResources={canUserCreateCalls ? onAddResources : undefined}
        />
      );
    },
    [callDispatches, callPriorities, canUserCreateCalls, isFilterActive, now, onAddResources, onOpenCall, onSelectCall, selectedCallId, timerStatuses]
  );

  return (
    <PanelFrame
      title={t('dispatch.active_calls')}
      icon={AlertTriangle}
      iconColor="#ef4444"
      cardKey="active-calls"
      count={visible.length}
      flex={flex}
      maxHeight={maxHeight}
      testID="active-calls-panel"
      right={
        <>
          <PanelIconButton icon={RefreshCw} onPress={refresh} accessibilityLabel={t('common.refresh')} testID="active-calls-refresh" />
          {canUserCreateCalls && onNewCall ? <PanelIconButton icon={Plus} color="#6366f1" onPress={onNewCall} accessibilityLabel={t('dispatch.new_call')} testID="active-calls-new" /> : null}
        </>
      }
    >
      <PanelSearch value={query} onChange={setQuery} placeholder={t('dispatch.search_calls_placeholder')} testID="active-calls-search" />
      {hasError && calls.length === 0 ? (
        <View style={styles.empty}>
          <Text className="text-center text-sm text-error-600">{t('dispatch_console.calls_load_failed')}</Text>
        </View>
      ) : (
        <FlatList
          testID="active-calls-list"
          data={visible}
          renderItem={renderItem}
          keyExtractor={(item: CallResultData) => item.CallId}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text className="text-center text-sm text-typography-500">{isLoading ? t('common.loading') : t('dispatch.no_active_calls')}</Text>
            </View>
          }
        />
      )}
    </PanelFrame>
  );
};

const styles = StyleSheet.create({
  list: { padding: 8 },
  empty: { padding: 24, alignItems: 'center' },
});
