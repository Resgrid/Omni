import { useSecurity } from '@resgrid/auth';
import { formatUtcInDepartmentTime } from '@resgrid/core/utils/dates';
import { useCallsStore } from '@resgrid/data';
import { CALL_LIST_REFRESH_EVENTS, callRoutes } from '@resgrid/features/calls';
import { useTranslation } from '@resgrid/i18n';
import type { CallResultData } from '@resgrid/models';
import { useRealtimeRefetch } from '@resgrid/realtime';
import { Loading, Text, ZeroState } from '@resgrid/ui';
import { type Href, useRouter } from 'expo-router';
import { CalendarClock, Send } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';

import { QueueActionButton, QueueSearch } from '../components/queue-controls';
import { PriorityCell, type QueueColumn, QueueTable, TextCell, TypeCell } from '../components/queue-table';
import { useCallDispatchNow } from '../hooks/use-call-dispatch-now';
import { matchesQueueQuery, scheduledDispatchUtc } from '../lib/queue-filters';

export interface ScheduledCallsScreenProps {
  showHeader?: boolean;
  realtime?: boolean;
}

/**
 * Calls scheduled to dispatch later (Dispatch baseline): Active with a future dispatch time. "Dispatch now" sends one
 * ahead of its time to the recipients already on it. Kept current by call pushes.
 */
export default function ScheduledCallsScreen({ showHeader = true, realtime = true }: ScheduledCallsScreenProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const { canUserCreateCalls } = useSecurity();
  const scheduledCalls = useCallsStore((state) => state.scheduledCalls);
  const isLoading = useCallsStore((state) => state.loading.scheduled === true);
  const error = useCallsStore((state) => state.errors.scheduled ?? null);
  const [query, setQuery] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { confirmDispatchNow, busyCallId, dialogs } = useCallDispatchNow();

  useEffect(() => {
    void useCallsStore.getState().fetchCallPriorities();
    void useCallsStore.getState().fetchScheduledCalls({ bypassCache: true });
  }, []);

  const refresh = useCallback(() => useCallsStore.getState().fetchScheduledCalls({ bypassCache: true }), []);
  useRealtimeRefetch(CALL_LIST_REFRESH_EVENTS, refresh, realtime);

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    void refresh().finally(() => setIsRefreshing(false));
  }, [refresh]);

  const visible = useMemo(() => scheduledCalls.filter((call) => matchesQueueQuery(call, query)), [query, scheduledCalls]);

  const columns = useMemo<QueueColumn[]>(
    () => [
      { key: 'type', titleKey: 'scheduled_calls.table_type', flex: 1, render: (call) => <TypeCell call={call} /> },
      { key: 'priority', titleKey: 'scheduled_calls.table_priority', flex: 1, render: (call) => <PriorityCell priorityId={call.Priority} /> },
      { key: 'address', titleKey: 'scheduled_calls.table_address', flex: 2, render: (call) => <TextCell value={call.Address} /> },
      { key: 'scheduled', titleKey: 'scheduled_calls.table_scheduled', flex: 1.5, render: (call) => <TextCell value={formatUtcInDepartmentTime(scheduledDispatchUtc(call), null)} tone="accent" /> },
    ],
    []
  );

  const renderActions = useCallback(
    (call: CallResultData) => (
      <QueueActionButton
        label={t('call_queues.dispatch_now')}
        icon={Send}
        isBusy={busyCallId === call.CallId}
        onPress={() => confirmDispatchNow(call.CallId)}
        accessibilityLabel={`${t('call_queues.dispatch_now')} ${call.Number || call.CallId}`}
        testID={`scheduled-call-dispatch-now-${call.CallId}`}
      />
    ),
    [busyCallId, confirmDispatchNow, t]
  );

  const renderContent = () => {
    if (isLoading && scheduledCalls.length === 0) return <Loading text={t('scheduled_calls.loading')} />;
    if (error && scheduledCalls.length === 0) return <ZeroState heading={t('common.errorOccurred')} description={t(error.messageKey)} isError />;
    if (visible.length === 0) return <ZeroState heading={t('scheduled_calls.no_scheduled_calls')} description={t('scheduled_calls.no_scheduled_calls_description')} icon={CalendarClock} />;
    return (
      <QueueTable
        calls={visible}
        columns={columns}
        onOpenCall={(call) => router.push(callRoutes.callDetail(call.CallId) as Href)}
        renderActions={canUserCreateCalls ? renderActions : undefined}
        refreshing={isRefreshing}
        onRefresh={handleRefresh}
        testID="scheduled-calls-table"
        rowTestID="scheduled-call-row"
      />
    );
  };

  return (
    <View className="flex-1 bg-background-50 px-4 pt-4" testID="scheduled-calls-screen">
      {showHeader ? <Text className="mb-3 text-lg font-bold">{t('scheduled_calls.title')}</Text> : null}
      <View className="mb-4 flex-row">
        <QueueSearch value={query} onChange={setQuery} placeholder={t('scheduled_calls.search')} testID="scheduled-calls-search" />
      </View>
      <View className="flex-1">{renderContent()}</View>
      {dialogs}
    </View>
  );
}
