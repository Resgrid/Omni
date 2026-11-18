import { pushRoutePath } from '@resgrid/core/navigation/route-paths';
import { useRecurringCallsStore } from '@resgrid/data';
import { OptionChips } from '@resgrid/features/calls';
import { useTranslation } from '@resgrid/i18n';
import type { RecurringCallResultData } from '@resgrid/models';
import { Fab, FlatList, Loading, RefreshControl, Text, useThemeColors, ZeroState } from '@resgrid/ui';
import { useRouter } from 'expo-router';
import { CalendarDays, Plus, Repeat } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ActionButton } from '../components/action-button';
import { RecurringCallRow } from '../components/recurring-call-row';
import { useIsRecurringCallsEnabled } from '../hooks/use-recurring-calls';
import { type RecurringCallStatus, recurringCallStatus, STATUS_LABEL_KEYS } from '../lib/schedule-format';
import { recurringCallsRoutes } from '../routes';

export interface RecurringCallsScreenProps {
  /** In-content title row (default true; off when the shell header already titles the screen). */
  showHeader?: boolean;
}

type StatusFilter = 'all' | RecurringCallStatus;

const FILTERS: readonly StatusFilter[] = ['all', 'active', 'paused', 'ended'];

/**
 * The department's recurring call schedules (Dispatch): status (active, paused, ended), mode, how often, the pickup
 * facility, the next dispatch and the open alerts of each, filtered by status. New schedules and the occurrence calendar
 * open from here; creating needs call creation (`GetRecurringCallOptions.CanCreate`).
 */
export default function RecurringCallsScreen({ showHeader = true }: RecurringCallsScreenProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const colors = useThemeColors();
  const isEnabled = useIsRecurringCallsEnabled();
  const schedules = useRecurringCallsStore((state) => state.schedules);
  const isLoading = useRecurringCallsStore((state) => state.loading.list === true);
  const error = useRecurringCallsStore((state) => state.errors.list ?? null);
  const fetchedAt = useRecurringCallsStore((state) => state.fetchedAt.list ?? 0);
  const canCreate = useRecurringCallsStore((state) => state.options?.CanCreate === true);
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    if (!isEnabled) return;
    const store = useRecurringCallsStore.getState();
    void store.fetchRecurringCalls({ bypassCache: true });
    void store.fetchOptions();
  }, [isEnabled]);

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);

    return useRecurringCallsStore
      .getState()
      .fetchRecurringCalls({ bypassCache: true })
      .finally(() => setIsRefreshing(false));
  }, []);

  const visible = useMemo(() => (filter === 'all' ? schedules : schedules.filter((schedule) => recurringCallStatus(schedule) === filter)), [filter, schedules]);

  const openSchedule = useCallback((schedule: RecurringCallResultData) => pushRoutePath(router, recurringCallsRoutes.detail(schedule.RecurringCallId)), [router]);

  const renderContent = () => {
    if (!isEnabled) return <ZeroState heading={t('recurring_calls.not_available')} icon={Repeat} testID="recurring-calls-disabled" />;

    // Only the first load replaces the list; a refresh keeps the rows on screen.
    if (isLoading && schedules.length === 0 && fetchedAt === 0) return <Loading text={t('recurring_calls.loading')} />;

    if (error && schedules.length === 0) return <ZeroState heading={t('common.errorOccurred')} description={t(error.messageKey)} isError onRetry={handleRefresh} />;

    if (visible.length === 0) {
      return (
        <ZeroState
          heading={schedules.length === 0 ? t('recurring_calls.empty_title') : t('recurring_calls.empty_filtered')}
          description={schedules.length === 0 ? t('recurring_calls.empty_description') : undefined}
          icon={Repeat}
          onRetry={handleRefresh}
          testID="recurring-calls-empty"
        />
      );
    }

    return (
      <FlatList
        testID="recurring-calls-list"
        data={visible}
        renderItem={({ item }: { item: RecurringCallResultData }) => <RecurringCallRow schedule={item} onPress={openSchedule} />}
        keyExtractor={(item: RecurringCallResultData) => String(item.RecurringCallId)}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />}
        contentContainerStyle={styles.list}
      />
    );
  };

  return (
    <View className="flex-1 bg-background-50 px-4 pt-4" testID="recurring-calls-screen">
      {isEnabled ? (
        <View className="mb-3 flex-row flex-wrap items-center">
          {showHeader ? (
            <View className="mr-2 flex-1">
              <Text className="text-lg font-bold">{t('recurring_calls.title')}</Text>
              <Text className="text-xs text-typography-500">{t('recurring_calls.subtitle')}</Text>
            </View>
          ) : (
            <View className="flex-1" />
          )}
          <ActionButton label={t('recurring_calls.calendar.title')} icon={CalendarDays} tone="secondary" onPress={() => pushRoutePath(router, recurringCallsRoutes.calendar())} testID="recurring-calls-calendar" />
        </View>
      ) : null}
      {isEnabled ? (
        <OptionChips
          options={FILTERS.map((option) => ({ value: option, label: option === 'all' ? t('recurring_calls.filter_all') : t(STATUS_LABEL_KEYS[option]) }))}
          selected={[filter]}
          onToggle={setFilter}
          scroll
          accessibilityLabel={t('recurring_calls.filter_label')}
          testID="recurring-calls-filter"
        />
      ) : null}
      <View className="flex-1">{renderContent()}</View>
      {isEnabled && canCreate ? (
        <Fab size="lg" placement="bottom right" onPress={() => router.push(recurringCallsRoutes.new())} accessibilityLabel={t('recurring_calls.new_title')} testID="recurring-calls-new">
          <View>
            <Plus size={24} color={colors.textInverse} />
          </View>
        </Fab>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({ list: { paddingBottom: 24 } });
