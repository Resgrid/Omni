import { type DataError, useCalendarStore } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import type { CalendarItemResultData } from '@resgrid/models';
import { Button, ButtonText, FlatList, HStack, Loading, Pressable, RefreshControl, Text, View, ZeroState } from '@resgrid/ui';
import { CalendarDays } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet } from 'react-native';

import { CalendarCard } from '../components/calendar-card';
import { CalendarItemDetailsSheet } from '../components/calendar-item-details-sheet';
import { MonthCalendar } from '../components/month-calendar';
import { type DateRange, isDateInRange, itemsOnDate, monthRange, normalizeItems, todayKey, todayRange, upcomingRange } from '../lib/calendar-dates';

export type CalendarTab = 'today' | 'upcoming' | 'calendar';

export interface CalendarScreenProps {
  initialTab?: CalendarTab;
}

const TABS: readonly { key: CalendarTab; labelKey: string }[] = [
  { key: 'today', labelKey: 'calendar.tabs.today' },
  { key: 'upcoming', labelKey: 'calendar.tabs.upcoming' },
  { key: 'calendar', labelKey: 'calendar.tabs.calendar' },
];

const keyExtractor = (item: CalendarItemResultData): string => item.CalendarItemId;

/**
 * The department calendar (Responder `calendar`): Today, the next seven days, and a month grid with the selected day's
 * items; tapping an item opens its details with sign-up. Items persist for offline reading (own calendar, plan §8.5);
 * times are the department's wall clock. Attendance is online only.
 */
export default function CalendarScreen({ initialTab = 'today' }: CalendarScreenProps) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<CalendarTab>(initialTab);
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  });
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<CalendarItemResultData | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const todayRaw = useCalendarStore((state) => state.todayItems);
  const upcomingRaw = useCalendarStore((state) => state.upcomingItems);
  const rangeRaw = useCalendarStore((state) => state.rangeItems);
  const isTodayLoading = useCalendarStore((state) => state.loading.today === true);
  const isUpcomingLoading = useCalendarStore((state) => state.loading.upcoming === true);
  const isRangeLoading = useCalendarStore((state) => state.loading.range === true);
  const todayError = useCalendarStore((state) => state.errors.today ?? null);
  const upcomingError = useCalendarStore((state) => state.errors.upcoming ?? null);

  const today = todayKey();
  // The range answer can include neighbours of a multi-day item; only what falls on today counts.
  const todayItems = useMemo(() => normalizeItems(todayRaw).filter((item) => isDateInRange(today, item)), [today, todayRaw]);
  const upcomingItems = useMemo(() => normalizeItems(upcomingRaw), [upcomingRaw]);
  const monthItems = useMemo(() => normalizeItems(rangeRaw), [rangeRaw]);
  const selectedDayItems = useMemo(() => (selectedDate ? itemsOnDate(monthItems, selectedDate) : []), [monthItems, selectedDate]);

  const loadToday = useCallback((bypassCache = false) => {
    const range: DateRange = todayRange();
    return useCalendarStore.getState().fetchTodaysItems(range.start, range.end, { bypassCache });
  }, []);
  const loadUpcoming = useCallback((bypassCache = false) => {
    const range = upcomingRange();
    return useCalendarStore.getState().fetchUpcomingItems(range.start, range.end, { bypassCache });
  }, []);
  const loadMonth = useCallback((year: number, monthNumber: number, bypassCache = false) => {
    const range = monthRange(year, monthNumber);
    return useCalendarStore.getState().fetchItemsForDateRange(range.start, range.end, { bypassCache });
  }, []);

  useEffect(() => {
    void loadToday();
    void loadUpcoming();
  }, [loadToday, loadUpcoming]);

  useEffect(() => {
    if (tab === 'calendar') void loadMonth(month.year, month.month);
  }, [loadMonth, month.month, month.year, tab]);

  const handleMonthChange = useCallback((year: number, monthNumber: number) => setMonth((current) => (current.year === year && current.month === monthNumber ? current : { year, month: monthNumber })), []);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      if (tab === 'today') await loadToday(true);
      else if (tab === 'upcoming') await loadUpcoming(true);
      else await loadMonth(month.year, month.month, true);
    } finally {
      setIsRefreshing(false);
    }
  }, [loadMonth, loadToday, loadUpcoming, month.month, month.year, tab]);

  const handleAttendanceChanged = useCallback(() => {
    void loadToday(true);
    void loadUpcoming(true);
    if (tab === 'calendar') void loadMonth(month.year, month.month, true);
  }, [loadMonth, loadToday, loadUpcoming, month.month, month.year, tab]);

  const openItem = useCallback((item: CalendarItemResultData) => setSelectedItem(item), []);

  const renderList = (items: CalendarItemResultData[], isLoading: boolean, error: DataError | null, emptyTitleKey: string, emptyDescriptionKey: string, loadingKey: string, testID: string) => {
    if (isLoading && !isRefreshing && items.length === 0) return <Loading text={t(loadingKey)} />;
    if (error && items.length === 0) {
      return (
        <ZeroState heading={t('calendar.error.title')} description={t(error.messageKey)} isError testID={`${testID}-error`}>
          <Button onPress={() => void handleRefresh()} className="mt-4" testID={`${testID}-retry`}>
            <ButtonText>{t('common.retry')}</ButtonText>
          </Button>
        </ZeroState>
      );
    }
    return (
      <FlatList
        data={items}
        keyExtractor={keyExtractor}
        renderItem={({ item }) => <CalendarCard item={item} onPress={openItem} />}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => void handleRefresh()} />}
        ListEmptyComponent={<ZeroState icon={CalendarDays} heading={t(emptyTitleKey)} description={t(emptyDescriptionKey)} testID={`${testID}-empty`} />}
        testID={testID}
      />
    );
  };

  return (
    <View className="flex-1 bg-background-50" testID="calendar-screen">
      <HStack space="sm" className="p-4" accessibilityRole="tablist">
        {TABS.map(({ key, labelKey }) => (
          <Pressable
            key={key}
            onPress={() => setTab(key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === key }}
            className={`flex-1 items-center rounded-lg px-3 py-2 ${tab === key ? 'bg-primary-500' : 'border border-primary-500 bg-transparent'}`}
            testID={`calendar-tab-${key}`}
          >
            <Text className={`font-semibold ${tab === key ? 'text-typography-0' : 'text-primary-600'}`}>{t(labelKey)}</Text>
          </Pressable>
        ))}
      </HStack>

      <View style={styles.flex}>
        {tab === 'today' ? renderList(todayItems, isTodayLoading, todayError, 'calendar.today.empty.title', 'calendar.today.empty.description', 'calendar.loading.today', 'calendar-today-list') : null}
        {tab === 'upcoming'
          ? renderList(upcomingItems, isUpcomingLoading, upcomingError, 'calendar.upcoming.empty.title', 'calendar.upcoming.empty.description', 'calendar.loading.upcoming', 'calendar-upcoming-list')
          : null}
        {tab === 'calendar' ? (
          <View style={styles.flex}>
            <MonthCalendar items={monthItems} selectedDate={selectedDate} onSelectDate={setSelectedDate} onMonthChange={handleMonthChange} isLoading={isRangeLoading} />
            {selectedDate ? (
              isRangeLoading && selectedDayItems.length === 0 ? (
                <Loading text={t('calendar.loading.date')} />
              ) : selectedDayItems.length === 0 ? (
                <Text className="py-8 text-center text-typography-500" testID="calendar-day-empty">
                  {t('calendar.selectedDate.empty')}
                </Text>
              ) : (
                <FlatList
                  data={selectedDayItems}
                  keyExtractor={keyExtractor}
                  renderItem={({ item }) => <CalendarCard item={item} onPress={openItem} density="compact" />}
                  contentContainerStyle={styles.dayList}
                  testID="calendar-day-list"
                />
              )
            ) : (
              <Text className="py-8 text-center text-typography-500" testID="calendar-select-date">
                {t('calendar.selectDate')}
              </Text>
            )}
          </View>
        ) : null}
      </View>

      <CalendarItemDetailsSheet item={selectedItem} isOpen={selectedItem !== null} onClose={() => setSelectedItem(null)} onAttendanceChanged={handleAttendanceChanged} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { padding: 16 },
  dayList: { padding: 8 },
});
