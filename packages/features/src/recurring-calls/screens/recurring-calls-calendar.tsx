import { pushRoutePath } from '@resgrid/core/navigation/route-paths';
import { useRecurringCallsStore } from '@resgrid/data';
import { callRoutes, useCallDispatchNow } from '@resgrid/features/calls';
import { useTranslation } from '@resgrid/i18n';
import { type ScheduledCallCalendarEntryData, ScheduledCallCalendarEntryKind } from '@resgrid/models';
import { useRealtimeRefetch } from '@resgrid/realtime';
import { FlatList, Loading, Pressable, RefreshControl, ScreenHeader, Text, useThemeColors, ZeroState } from '@resgrid/ui';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CalendarDays, ChevronLeft, ChevronRight, Send, X } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ActionButton } from '../components/action-button';
import { OccurrenceButtons } from '../components/occurrence-buttons';
import { type PillTone, StatusPill } from '../components/status-pill';
import { useIsRecurringCallsEnabled, useOccurrenceActions } from '../hooks/use-recurring-calls';
import { addDays, AGENDA_DAYS, type AgendaDay, agendaRange, agendaWindow, entryKindLabelKey, groupAgenda, occurrenceActionsFor, startOfDay } from '../lib/calendar-agenda';
import { formatDateKey, joinParts, wallClockTime } from '../lib/schedule-format';
import { recurringCallsRoutes } from '../routes';

export interface RecurringCallsCalendarScreenProps {
  /** Clock for the first day shown (tests). */
  now?: () => Date;
}

/** Pushes that change what the calendar shows. */
const CALENDAR_REFRESH_EVENTS = ['recurringCallAlertsUpdated', 'callsUpdated', 'callAdded', 'callClosed', 'eventingHubJoined'] as const;

const KIND_TONES = new Map<number, PillTone>([
  [ScheduledCallCalendarEntryKind.Scheduled, 'info'],
  [ScheduledCallCalendarEntryKind.Dispatched, 'success'],
  [ScheduledCallCalendarEntryKind.Due, 'warning'],
  [ScheduledCallCalendarEntryKind.Missed, 'error'],
  [ScheduledCallCalendarEntryKind.Held, 'error'],
]);

const parseScheduleId = (value: string | string[] | undefined): number | null => {
  const raw = Array.isArray(value) ? value[0] : value;

  return raw && /^[1-9]\d*$/.test(raw) ? Number(raw) : null;
};

const entryKey = (entry: ScheduledCallCalendarEntryData): string => `${entry.RecurringCallId ?? 0}-${entry.OccurrenceOn ?? entry.DispatchOn}-${entry.CallId ?? 0}-${entry.KindId}`;

/**
 * The scheduled calls calendar (Dispatch) as an agenda by day, in the department's time: scheduled calls waiting to go
 * out, the calls recurring schedules created, and their occurrences still to come, skipped, due, missed or held. Two
 * weeks at a time; `?recurringCallId=` narrows it to one schedule. An occurrence without a call can be sent now, have its
 * call created first, or be skipped; a skipped one restored; a held call is sent with the dispatch picker. Acting needs
 * call creation.
 */
export default function RecurringCallsCalendarScreen({ now = () => new Date() }: RecurringCallsCalendarScreenProps) {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const isEnabled = useIsRecurringCallsEnabled();
  const params = useLocalSearchParams<{ recurringCallId?: string | string[] }>();
  const [filterId, setFilterId] = useState<number | null>(() => parseScheduleId(params.recurringCallId));
  const [from, setFrom] = useState(() => startOfDay(now()));
  const [isRefreshing, setIsRefreshing] = useState(false);
  const window = useMemo(() => agendaWindow(from), [from]);
  const entries = useRecurringCallsStore((state) => state.calendar);
  const storeWindow = useRecurringCallsStore((state) => state.calendarWindow);
  const isLoading = useRecurringCallsStore((state) => state.loading.calendar === true);
  const error = useRecurringCallsStore((state) => state.errors.calendar ?? null);
  const canCreate = useRecurringCallsStore((state) => state.options?.CanCreate === true);
  const filterName = useRecurringCallsStore((state) => (filterId ? (state.schedules.find((schedule) => schedule.RecurringCallId === filterId)?.Name ?? null) : null));
  const occurrenceActions = useOccurrenceActions();
  const dispatchNow = useCallDispatchNow();
  const colors = useThemeColors();
  const locale = i18n?.language ?? 'en';

  const refresh = useCallback(() => useRecurringCallsStore.getState().fetchCalendar(window, { bypassCache: true }), [window]);

  useEffect(() => {
    if (!isEnabled) return;
    void refresh();
  }, [isEnabled, refresh]);

  useEffect(() => {
    if (!isEnabled) return;
    void useRecurringCallsStore.getState().fetchOptions();
  }, [isEnabled]);

  useRealtimeRefetch(CALENDAR_REFRESH_EVENTS, refresh, isEnabled);

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);

    return refresh().finally(() => setIsRefreshing(false));
  }, [refresh]);

  const isCurrentWindow = storeWindow?.start === window.start && storeWindow?.end === window.end;
  const days = useMemo(() => (isCurrentWindow ? groupAgenda(entries, filterId) : []), [entries, filterId, isCurrentWindow]);
  const range = agendaRange(from);
  const rangeLabel = t('recurring_calls.calendar.range', { start: formatDateKey(range.first, locale), end: formatDateKey(range.last, locale) });

  const renderEntry = (entry: ScheduledCallCalendarEntryData) => {
    const key = entryKey(entry);
    const label = joinParts([wallClockTime(entry.DispatchOnLocal), entry.ScheduleName ?? entry.Name]);
    const occurrence = entry.RecurringCallId && entry.OccurrenceOn ? { RecurringCallId: entry.RecurringCallId, OccurrenceOn: entry.OccurrenceOn } : null;
    const actions = canCreate ? occurrenceActionsFor(entry) : [];
    const isHeld = entry.KindId === ScheduledCallCalendarEntryKind.Held && !!entry.CallId;

    const open = () => {
      if (entry.CallId) pushRoutePath(router, callRoutes.callDetail(String(entry.CallId)));
      else if (entry.RecurringCallId) pushRoutePath(router, recurringCallsRoutes.detail(entry.RecurringCallId));
    };

    return (
      <View key={key} className="border-t border-outline-100 py-2" testID={`calendar-entry-${key}`}>
        <Pressable onPress={open} accessibilityRole="button" accessibilityLabel={joinParts([label, t(entryKindLabelKey(entry)), entry.CallNumber])} className="flex-row">
          <Text className="mr-3 w-12 font-semibold text-typography-900">{wallClockTime(entry.DispatchOnLocal)}</Text>
          <View className="flex-1">
            <Text className="font-semibold text-typography-900" numberOfLines={1}>
              {entry.ScheduleName || entry.Name || t('recurring_calls.calendar.scheduled_call')}
            </Text>
            {entry.ScheduleName && entry.Name && entry.Name !== entry.ScheduleName ? (
              <Text size="sm" className="text-typography-700" numberOfLines={1}>
                {entry.Name}
              </Text>
            ) : null}
            <View className="mt-1 flex-row flex-wrap items-center">
              <StatusPill label={t(entryKindLabelKey(entry))} tone={KIND_TONES.get(entry.KindId) ?? 'muted'} testID={`calendar-entry-${key}-kind`} />
              {entry.CallNumber ? (
                <Text size="xs" className="mb-1 text-typography-500">
                  {t('recurring_calls.alerts.call_number', { call: entry.CallNumber })}
                </Text>
              ) : null}
            </View>
            {entry.Address ? (
              <Text size="xs" className="text-typography-500" numberOfLines={1}>
                {entry.Address}
              </Text>
            ) : null}
          </View>
        </Pressable>
        {occurrence ? (
          <OccurrenceButtons occurrence={occurrence} actions={actions} busyKey={occurrenceActions.busyKey} onAction={occurrenceActions.request} label={label} testID={`calendar-entry-${key}-actions`} />
        ) : null}
        {isHeld && canCreate ? (
          <View className="mt-2 flex-row justify-end">
            <ActionButton
              label={t('recurring_calls.alerts.send_held')}
              icon={Send}
              isBusy={dispatchNow.busyCallId === String(entry.CallId)}
              onPress={() => void dispatchNow.openDispatchPicker(String(entry.CallId))}
              testID={`calendar-entry-${key}-send-held`}
            />
          </View>
        ) : null}
      </View>
    );
  };

  const renderDay = ({ item }: { item: AgendaDay }) => (
    <View style={styles.card} className="bg-background-0" testID={`calendar-day-${item.day}`}>
      <Text className="mb-1 font-bold text-typography-900" accessibilityRole="header">
        {formatDateKey(item.day, locale, 'long')}
      </Text>
      {item.entries.map(renderEntry)}
    </View>
  );

  const renderContent = () => {
    if (!isEnabled) return <ZeroState heading={t('recurring_calls.not_available')} icon={CalendarDays} testID="recurring-calls-calendar-disabled" />;

    if (isLoading && days.length === 0) return <Loading text={t('recurring_calls.calendar.loading')} />;

    if (error && days.length === 0) return <ZeroState heading={t('common.errorOccurred')} description={t(error.messageKey)} isError onRetry={handleRefresh} />;

    if (days.length === 0)
      return (
        <ZeroState heading={t('recurring_calls.calendar.empty_title')} description={t('recurring_calls.calendar.empty_description')} icon={CalendarDays} onRetry={handleRefresh} testID="recurring-calls-calendar-empty" />
      );

    return (
      <FlatList
        testID="recurring-calls-calendar-list"
        data={days}
        renderItem={renderDay}
        keyExtractor={(item: AgendaDay) => item.day}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />}
        contentContainerStyle={styles.list}
      />
    );
  };

  return (
    <View style={styles.screen} className="bg-background-50" testID="recurring-calls-calendar-screen">
      <ScreenHeader title={t('recurring_calls.calendar.title')} onBack={() => router.back()} />
      {isEnabled ? (
        <View className="flex-row flex-wrap items-center px-3 pt-3">
          <Pressable onPress={() => setFrom((current) => addDays(current, -AGENDA_DAYS))} accessibilityRole="button" accessibilityLabel={t('recurring_calls.calendar.previous')} className="p-2" testID="calendar-previous">
            <View>
              <ChevronLeft size={20} color={colors.icon} />
            </View>
          </Pressable>
          <Text className="flex-1 text-center font-semibold text-typography-800" testID="calendar-range">
            {rangeLabel}
          </Text>
          <Pressable onPress={() => setFrom((current) => addDays(current, AGENDA_DAYS))} accessibilityRole="button" accessibilityLabel={t('recurring_calls.calendar.next')} className="p-2" testID="calendar-next">
            <View>
              <ChevronRight size={20} color={colors.icon} />
            </View>
          </Pressable>
          <ActionButton label={t('recurring_calls.calendar.today')} icon={CalendarDays} tone="secondary" onPress={() => setFrom(startOfDay(now()))} testID="calendar-today" />
        </View>
      ) : null}
      {isEnabled && filterId ? (
        <View className="flex-row items-center px-4 pt-2" testID="calendar-filter">
          <Text size="sm" className="flex-1 text-typography-700">
            {t('recurring_calls.calendar.only_schedule', { schedule: filterName ?? `#${filterId}` })}
          </Text>
          <ActionButton label={t('recurring_calls.calendar.show_all')} icon={X} tone="secondary" onPress={() => setFilterId(null)} testID="calendar-filter-clear" />
        </View>
      ) : null}
      <View className="flex-1 px-3 pt-3">{renderContent()}</View>
      {occurrenceActions.dialogs}
      {dispatchNow.dialogs}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  list: { paddingBottom: 24 },
  card: { borderRadius: 12, padding: 12, marginBottom: 12 },
});
