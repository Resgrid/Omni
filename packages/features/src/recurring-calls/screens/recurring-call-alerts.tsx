import { pushRoutePath } from '@resgrid/core/navigation/route-paths';
import { recurringAlertKey, useRecurringCallAlertsStore, useRecurringCallsStore } from '@resgrid/data';
import { callRoutes, useCallDispatchNow } from '@resgrid/features/calls';
import { useTranslation } from '@resgrid/i18n';
import type { RecurringCallAlertResultData } from '@resgrid/models';
import { FlatList, HStack, Loading, Pressable, RefreshControl, Spinner, Text, useThemeColors, useToast, VStack, ZeroState } from '@resgrid/ui';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { BellRing, RefreshCw } from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { DismissAlertDialog } from '../components/dismiss-alert-dialog';
import { RecurringCallAlertCard } from '../components/recurring-call-alert-card';
import { useIsRecurringCallsEnabled, useOccurrenceActions } from '../hooks/use-recurring-calls';
import { recurringCallsRoutes } from '../routes';

export interface RecurringCallAlertsScreenProps {
  /** In-content title row (default true; off when the shell header already titles the screen). */
  showHeader?: boolean;
}

/**
 * The open recurring call alerts (Dispatch): what happened to which occurrence of which schedule, in the department's time,
 * the call and the resources left off it. A dispatcher sends the occurrence now (Dispatched, or Held when nobody could be
 * sent), creates its call to change it first, skips it, sends a held call with the dispatch picker, opens the call,
 * acknowledges or dismisses the alert. New alerts stay highlighted until the dispatcher leaves the screen; a push tap
 * (`?alertId=`) highlights its alert. Kept current by the `recurringCallAlertsUpdated` push.
 */
export default function RecurringCallAlertsScreen({ showHeader = true }: RecurringCallAlertsScreenProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const toast = useToast();
  const colors = useThemeColors();
  const isEnabled = useIsRecurringCallsEnabled();
  const params = useLocalSearchParams<{ alertId?: string | string[] }>();
  const focusId = Array.isArray(params.alertId) ? params.alertId[0] : params.alertId;
  const alerts = useRecurringCallAlertsStore((state) => state.alerts);
  const newAlertIds = useRecurringCallAlertsStore((state) => state.newAlertIds);
  const isLoading = useRecurringCallAlertsStore((state) => state.loading.alerts === true);
  const error = useRecurringCallAlertsStore((state) => state.errors.alerts ?? null);
  const fetchedAt = useRecurringCallAlertsStore((state) => state.fetchedAt.alerts ?? 0);
  const alertBusyKey = useRecurringCallAlertsStore((state) => state.busyKey);
  const occurrenceActions = useOccurrenceActions();
  const dispatchNow = useCallDispatchNow({ onDispatched: () => void useRecurringCallAlertsStore.getState().fetchAlerts({ bypassCache: true }) });
  const [dismissTarget, setDismissTarget] = useState<RecurringCallAlertResultData | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    if (!isEnabled) return undefined;
    void useRecurringCallAlertsStore.getState().fetchAlerts({ bypassCache: true });

    // Looking at the list is seeing the new alerts: they stop being highlighted once the dispatcher leaves it.
    return () => useRecurringCallAlertsStore.getState().markAlertsSeen();
  }, [isEnabled]);

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);

    return useRecurringCallAlertsStore
      .getState()
      .fetchAlerts({ bypassCache: true })
      .finally(() => setIsRefreshing(false));
  }, []);

  const acknowledge = useCallback(
    async (alert: RecurringCallAlertResultData) => {
      const outcome = await useRecurringCallAlertsStore.getState().acknowledgeAlert(alert.AlertId);

      if (outcome.ok) toast.success(outcome.message || t('recurring_calls.alerts.acknowledge_success'));
      else toast.error(outcome.message || t('recurring_calls.alerts.acknowledge_error'));
    },
    [t, toast]
  );

  const confirmDismiss = useCallback(
    async (note: string) => {
      if (!dismissTarget) return;
      const outcome = await useRecurringCallAlertsStore.getState().dismissAlert(dismissTarget.AlertId, note);

      if (outcome.ok) {
        toast.success(outcome.message || t('recurring_calls.alerts.dismiss_success'));
        setDismissTarget(null);
        void useRecurringCallsStore.getState().fetchRecurringCalls({ bypassCache: true });
      } else {
        toast.error(outcome.message || t('recurring_calls.alerts.dismiss_error'));
      }
    },
    [dismissTarget, t, toast]
  );

  const renderAlert = useCallback(
    ({ item }: { item: RecurringCallAlertResultData }) => (
      <RecurringCallAlertCard
        alert={item}
        isNew={newAlertIds.includes(item.AlertId) || item.AlertId === focusId}
        alertBusyKey={alertBusyKey}
        occurrenceBusyKey={occurrenceActions.busyKey}
        onOccurrenceAction={occurrenceActions.request}
        onAcknowledge={(alert) => void acknowledge(alert)}
        onDismiss={setDismissTarget}
        onOpenCall={(callId) => pushRoutePath(router, callRoutes.callDetail(String(callId)))}
        onDispatchHeld={(callId) => void dispatchNow.openDispatchPicker(String(callId))}
        onOpenSchedule={(recurringCallId) => pushRoutePath(router, recurringCallsRoutes.detail(recurringCallId))}
      />
    ),
    [acknowledge, alertBusyKey, dispatchNow, focusId, newAlertIds, occurrenceActions.busyKey, occurrenceActions.request, router]
  );

  const renderContent = () => {
    if (!isEnabled) return <ZeroState heading={t('recurring_calls.not_available')} icon={BellRing} testID="recurring-call-alerts-disabled" />;

    // Only the first load replaces the list; a refresh from a push keeps the cards on screen.
    if (isLoading && alerts.length === 0 && fetchedAt === 0) return <Loading text={t('recurring_calls.alerts.loading')} />;

    if (error && alerts.length === 0) return <ZeroState heading={t('common.errorOccurred')} description={t(error.messageKey)} isError onRetry={handleRefresh} />;

    if (alerts.length === 0) return <ZeroState heading={t('recurring_calls.alerts.empty_title')} description={t('recurring_calls.alerts.empty_description')} icon={BellRing} onRetry={handleRefresh} />;

    return (
      <FlatList
        testID="recurring-call-alerts-list"
        data={alerts}
        renderItem={renderAlert}
        keyExtractor={(item: RecurringCallAlertResultData) => item.AlertId}
        extraData={[newAlertIds, alertBusyKey, occurrenceActions.busyKey]}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />}
        contentContainerStyle={styles.list}
      />
    );
  };

  return (
    <View className="flex-1 bg-background-50 px-4 pt-4" testID="recurring-call-alerts-screen">
      {isEnabled && showHeader ? (
        <HStack className="mb-3 items-center justify-between">
          <VStack className="flex-1">
            <Text className="text-lg font-bold">{t('recurring_calls.alerts.title')}</Text>
            <Text className="text-xs text-typography-500">{t('recurring_calls.alerts.subtitle')}</Text>
          </VStack>
          <Pressable onPress={() => void handleRefresh()} accessibilityRole="button" accessibilityLabel={t('common.refresh')} testID="recurring-call-alerts-refresh">
            {isRefreshing ? (
              <Spinner size="small" />
            ) : (
              <View>
                <RefreshCw size={18} color={colors.icon} />
              </View>
            )}
          </Pressable>
        </HStack>
      ) : null}
      <View className="flex-1">{renderContent()}</View>
      <DismissAlertDialog
        isOpen={dismissTarget !== null}
        isSubmitting={dismissTarget !== null ? alertBusyKey === recurringAlertKey(dismissTarget.AlertId) : false}
        onConfirm={(note) => void confirmDismiss(note)}
        onClose={() => setDismissTarget(null)}
      />
      {occurrenceActions.dialogs}
      {dispatchNow.dialogs}
    </View>
  );
}

const styles = StyleSheet.create({ list: { paddingBottom: 24 } });
