import { useSecurity } from '@resgrid/auth';
import { formatUtcInDepartmentTime } from '@resgrid/core/utils/dates';
import { useCallsStore } from '@resgrid/data';
import { CALL_LIST_REFRESH_EVENTS, callRoutes } from '@resgrid/features/calls';
import { useTranslation } from '@resgrid/i18n';
import type { CallResultData } from '@resgrid/models';
import { useRealtimeRefetch } from '@resgrid/realtime';
import { Loading, Text, ZeroState } from '@resgrid/ui';
import { type Href, useRouter } from 'expo-router';
import { Hourglass, Send, XCircle } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';

import { QueueActionButton, QueueSearch } from '../components/queue-controls';
import { PriorityCell, type QueueColumn, QueueTable, TextCell, TypeCell } from '../components/queue-table';
import { useCallDispatchNow } from '../hooks/use-call-dispatch-now';
import { matchesQueueQuery } from '../lib/queue-filters';

export interface PendingCallsScreenProps {
  /** In-content title row (default true; off when the shell header already titles the screen). */
  showHeader?: boolean;
  /** Subscribe to call pushes (default true). */
  realtime?: boolean;
}

/**
 * Calls saved as Pending ("to be dispatched", Dispatch baseline): numbered, nobody notified, not on the field apps. A
 * dispatcher picks one up here, chooses who to send and dispatches it, or cancels it. Kept current by call pushes.
 */
export default function PendingCallsScreen({ showHeader = true, realtime = true }: PendingCallsScreenProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const { canUserCreateCalls } = useSecurity();
  const pendingCalls = useCallsStore((state) => state.pendingCalls);
  const isLoading = useCallsStore((state) => state.loading.pending === true);
  const error = useCallsStore((state) => state.errors.pending ?? null);
  const [query, setQuery] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { openDispatchPicker, confirmCancelPending, busyCallId, dialogs } = useCallDispatchNow();

  useEffect(() => {
    void useCallsStore.getState().fetchCallPriorities();
    void useCallsStore.getState().fetchPendingCalls({ bypassCache: true });
  }, []);

  const refresh = useCallback(() => useCallsStore.getState().fetchPendingCalls({ bypassCache: true }), []);
  useRealtimeRefetch(CALL_LIST_REFRESH_EVENTS, refresh, realtime);

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    void refresh().finally(() => setIsRefreshing(false));
  }, [refresh]);

  const visible = useMemo(() => pendingCalls.filter((call) => matchesQueueQuery(call, query)), [pendingCalls, query]);

  const columns = useMemo<QueueColumn[]>(
    () => [
      { key: 'type', titleKey: 'scheduled_calls.table_type', flex: 1, render: (call) => <TypeCell call={call} /> },
      { key: 'priority', titleKey: 'scheduled_calls.table_priority', flex: 1, render: (call) => <PriorityCell priorityId={call.Priority} /> },
      { key: 'address', titleKey: 'scheduled_calls.table_address', flex: 2, render: (call) => <TextCell value={call.Address} /> },
      { key: 'received', titleKey: 'pending_calls.table_received', flex: 1.5, render: (call) => <TextCell value={formatUtcInDepartmentTime(call.LoggedOnUtc, null)} /> },
    ],
    []
  );

  const renderActions = useCallback(
    (call: CallResultData) => {
      const isBusy = busyCallId === call.CallId;
      const label = call.Number || call.CallId;
      return (
        <>
          <QueueActionButton
            label={t('call_queues.dispatch')}
            icon={Send}
            isBusy={isBusy}
            onPress={() => void openDispatchPicker(call.CallId)}
            accessibilityLabel={`${t('call_queues.dispatch')} ${label}`}
            testID={`pending-call-dispatch-${call.CallId}`}
          />
          <QueueActionButton
            label={t('pending_calls.cancel_call')}
            icon={XCircle}
            tone="negative"
            isBusy={isBusy}
            onPress={() => confirmCancelPending(call.CallId)}
            accessibilityLabel={`${t('pending_calls.cancel_call')} ${label}`}
            testID={`pending-call-cancel-${call.CallId}`}
          />
        </>
      );
    },
    [busyCallId, confirmCancelPending, openDispatchPicker, t]
  );

  const renderContent = () => {
    // Only the first load replaces the table; a refresh from a push keeps the rows on screen.
    if (isLoading && pendingCalls.length === 0) return <Loading text={t('pending_calls.loading')} />;
    if (error && pendingCalls.length === 0) return <ZeroState heading={t('common.errorOccurred')} description={t(error.messageKey)} isError />;
    if (visible.length === 0) return <ZeroState heading={t('pending_calls.no_pending_calls')} description={t('pending_calls.no_pending_calls_description')} icon={Hourglass} />;
    return (
      <QueueTable
        calls={visible}
        columns={columns}
        onOpenCall={(call) => router.push(callRoutes.callDetail(call.CallId) as Href)}
        renderActions={canUserCreateCalls ? renderActions : undefined}
        refreshing={isRefreshing}
        onRefresh={handleRefresh}
        testID="pending-calls-table"
        rowTestID="pending-call-row"
      />
    );
  };

  return (
    <View className="flex-1 bg-background-50 px-4 pt-4" testID="pending-calls-screen">
      {showHeader ? <Text className="mb-3 text-lg font-bold">{t('pending_calls.title')}</Text> : null}
      <View className="mb-4 flex-row">
        <QueueSearch value={query} onChange={setQuery} placeholder={t('pending_calls.search')} testID="pending-calls-search" />
      </View>
      <View className="flex-1">{renderContent()}</View>
      {dialogs}
    </View>
  );
}
