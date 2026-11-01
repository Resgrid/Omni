import { useTerm } from '@resgrid/auth';
import { useShiftsStore } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import type { PendingShiftSignupResultData, ShiftDayResultData, ShiftResultData, ShiftTradeResultData } from '@resgrid/models';
import { Button, ButtonText, FlatList, HStack, Input, InputField, InputIcon, InputSlot, Loading, Pressable, RefreshControl, ScrollView, Text, useThemeColors, View, VStack, ZeroState } from '@resgrid/ui';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { CalendarDays, Info, Search, X } from 'lucide-react-native';
import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View as RNView } from 'react-native';

import { ShiftActionSheet } from '../components/shift-action-sheet';
import { ShiftCalendarView } from '../components/shift-calendar-view';
import { ShiftCard } from '../components/shift-card';
import { ShiftDayCard } from '../components/shift-day-card';
import { ShiftDayDetailsSheet } from '../components/shift-day-details-sheet';
import { ShiftApprovalsList, ShiftOnDutyList, type ShiftTradesFilter, ShiftTradesList } from '../components/shift-lists';
import { type ShiftSegment, ShiftSegmentBar } from '../components/shift-segment-bar';
import { ShiftDetailsSheet, ShiftTradeDetailsSheet } from '../components/shift-sheets';
import { useShiftDayLists } from '../hooks/use-shift-day-lists';
import type { ShiftSheetAction, ShiftTradeAction } from '../lib/shift-action-types';
import { loadShiftView, SHIFT_VIEWS, type ShiftCalendarSelection, type ShiftView } from '../lib/shift-loaders';
import { matchesShiftQuery, sectionMyShiftDays } from '../lib/shift-rules';
import { formatShiftLongDate, getDateKey, getMonthRange, parseWallClock, toDateParam } from '../lib/shift-time';

type DayRow = { type: 'header'; key: string; title: string } | { type: 'day'; key: string; day: ShiftDayResultData };

const NO_SIGNUPS: PendingShiftSignupResultData[] = [];
const NO_TRADES: ShiftTradeResultData[] = [];

export interface ShiftsScreenProps {
  /** The view shown first; defaults to the `view` route param (`/shifts?view=trades`), else Today. */
  initialView?: ShiftView;
}

const isShiftView = (value: unknown): value is ShiftView => typeof value === 'string' && (SHIFT_VIEWS as readonly string[]).includes(value);

/**
 * Shifts (Responder): Today, My Shifts, Sign up, Calendar, Trades, On duty and — for supervisors — Approvals. Shift days
 * open in a sheet with sign-up, withdraw, trade and roster management; trade and approval actions confirm in a sheet.
 * Lists are persisted (own shifts and today's roster read offline); every action is online only.
 */
export default function ShiftsScreen({ initialView }: ShiftsScreenProps) {
  const { t, i18n } = useTranslation();
  const params = useLocalSearchParams<{ view?: string | string[] }>();
  const routeView = Array.isArray(params.view) ? params.view[0] : params.view;
  const colors = useThemeColors();
  const title = useTerm('module.shifts', t('shifts.title'));
  const lists = useShiftDayLists();
  const shifts = useShiftsStore((state) => state.shifts);
  const signupDays = useShiftsStore((state) => state.signupDays);
  const trades = useShiftsStore((state) => state.trades);
  const openTrades = useShiftsStore((state) => state.openTrades);
  const pendingApprovals = useShiftsStore((state) => state.pendingApprovals);
  const onDutyPersonnel = useShiftsStore((state) => state.onDutyPersonnel);
  const loading = useShiftsStore((state) => state.loading);
  const errors = useShiftsStore((state) => state.errors);

  const [view, setView] = useState<ShiftView>(() => initialView ?? (isShiftView(routeView) ? routeView : 'today'));
  const [query, setQuery] = useState('');
  const [signupFilter, setSignupFilter] = useState<'needed' | 'all'>('needed');
  const [tradesFilter, setTradesFilter] = useState<ShiftTradesFilter>('open');
  const [selectedDate, setSelectedDate] = useState<string | null>(() => toDateParam(new Date()));
  const [openDay, setOpenDay] = useState<ShiftDayResultData | null>(null);
  const [openShift, setOpenShift] = useState<ShiftResultData | null>(null);
  const [openTrade, setOpenTrade] = useState<ShiftTradeResultData | null>(null);
  const [sheetAction, setSheetAction] = useState<ShiftSheetAction | null>(null);
  // The calendar month and shift filter are view state: the last loaded month (persisted in the store) or this one.
  const [calendar, setCalendar] = useState<ShiftCalendarSelection>(() => {
    const last = useShiftsStore.getState().calendarRange;
    return last ? { range: { start: last.start, end: last.end }, shiftId: last.shiftId } : { range: getMonthRange(new Date()), shiftId: null };
  });

  // Approvals exist only for supervisors (the server decides via IsSupervisor); On duty is for everyone.
  const isSupervisor = pendingApprovals?.IsSupervisor === true;
  const pendingSignups = pendingApprovals?.Signups ?? NO_SIGNUPS;
  const pendingTrades = pendingApprovals?.Trades ?? NO_TRADES;
  const activeView: ShiftView = view === 'approvals' && !isSupervisor ? 'today' : view;

  // Data loads on focus and whenever the view (or the calendar month/filter) changes while focused, plus approvals to
  // learn whether this person supervises anyone and how many requests wait.
  useFocusEffect(
    useCallback(() => {
      void loadShiftView(activeView, undefined, calendar);
      if (activeView !== 'approvals') void useShiftsStore.getState().fetchPendingApprovals();
    }, [activeView, calendar])
  );

  const changeView = setView;

  const refresh = useCallback(() => {
    void loadShiftView(activeView, { bypassCache: true }, calendar);
    if (activeView !== 'approvals') void useShiftsStore.getState().fetchPendingApprovals();
  }, [activeView, calendar]);

  const segments = useMemo<ShiftSegment[]>(() => {
    const list: ShiftSegment[] = [
      { key: 'today', label: t('shifts.segments.today') },
      { key: 'mine', label: t('shifts.segments.mine') },
      { key: 'signup', label: t('shifts.segments.signup') },
      { key: 'calendar', label: t('shifts.segments.calendar') },
      { key: 'trades', label: t('shifts.segments.trades'), badge: openTrades.filter((trade) => trade.CanApply).length },
      { key: 'onduty', label: t('shifts.segments.on_duty') },
    ];
    if (isSupervisor) list.push({ key: 'approvals', label: t('shifts.segments.approvals'), badge: pendingSignups.length + pendingTrades.length });
    return list;
  }, [t, isSupervisor, openTrades, pendingSignups.length, pendingTrades.length]);

  // The day sheet, the shift sheet and the trade sheet never stack; a trade action closes the trade sheet first.
  const openDayDetails = useCallback((day: ShiftDayResultData) => {
    setOpenShift(null);
    setOpenTrade(null);
    setOpenDay(day);
  }, []);
  const openTradeDetails = useCallback((trade: ShiftTradeResultData) => {
    setOpenDay(null);
    setOpenTrade(trade);
  }, []);
  const handleTradeAction = useCallback((action: ShiftTradeAction) => {
    setOpenTrade(null);
    setSheetAction(action);
  }, []);

  const calendarMonth = useMemo(() => parseWallClock(calendar.range.start) ?? new Date(), [calendar.range.start]);
  const calendarShiftId = calendar.shiftId;
  const changeMonth = useCallback((month: Date) => {
    setSelectedDate(null);
    setCalendar((current) => ({ range: getMonthRange(month), shiftId: current.shiftId }));
  }, []);
  const filterCalendar = useCallback((shiftId: string | null) => setCalendar((current) => ({ range: current.range, shiftId })), []);
  const viewShiftInCalendar = useCallback((shiftId: string) => {
    setOpenShift(null);
    setView('calendar');
    setSelectedDate((current) => current ?? toDateParam(new Date()));
    setCalendar((current) => ({ range: current.range, shiftId }));
  }, []);

  const today = useMemo(() => lists.today.filter((day) => matchesShiftQuery(day, query)), [lists.today, query]);
  const mineRows = useMemo<DayRow[]>(
    () =>
      sectionMyShiftDays(lists.mine.filter((day) => matchesShiftQuery(day, query))).flatMap((section) => [
        { type: 'header' as const, key: `header-${section.key}`, title: t(section.titleKey) },
        ...section.items.map((day) => ({ type: 'day' as const, key: `${section.key}-${day.ShiftType}-${day.ShiftDayId}`, day })),
      ]),
    [lists.mine, query, t]
  );
  const standingShifts = useMemo(() => shifts.filter((shift) => shift.InShift), [shifts]);
  const visibleSignupDays = useMemo(() => (signupFilter === 'needed' ? signupDays.filter((day) => !day.Filled) : signupDays).filter((day) => matchesShiftQuery(day, query)), [signupDays, signupFilter, query]);
  const daysForSelectedDate = useMemo(() => (selectedDate ? lists.calendar.filter((day) => getDateKey(day.ShiftDay || day.Start) === selectedDate) : []), [lists.calendar, selectedDate]);

  const renderDay = ({ item }: { item: ShiftDayResultData }) => <ShiftDayCard shiftDay={item} onPress={openDayDetails} />;
  const dayKey = (item: ShiftDayResultData) => `${item.ShiftType}-${item.ShiftDayId}`;

  const chip = (id: string, label: string, isActive: boolean, onPress: () => void, testID: string) => (
    <Pressable
      key={id}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: isActive }}
      testID={testID}
      className={`mr-2 rounded-full border px-3 py-1.5 ${isActive ? 'border-primary-600 bg-primary-100' : 'border-outline-300 bg-background-0'}`}
    >
      <Text size="xs" className={`font-medium ${isActive ? 'text-primary-700' : 'text-typography-700'}`}>
        {label}
      </Text>
    </Pressable>
  );

  const stateFor = (slice: string, isEmpty: boolean): 'loading' | 'error' | null => {
    if (!isEmpty) return null;
    if ((loading as Record<string, boolean | undefined>)[slice] === true) return 'loading';
    return (errors as Record<string, unknown>)[slice] ? 'error' : null;
  };

  const errorState = (
    <ZeroState isError heading={t('shifts.load_error')} description={t('errors.data.unknown')} testID="shifts-error">
      <Button onPress={refresh} className="mt-4" testID="shifts-retry">
        <ButtonText>{t('common.retry')}</ButtonText>
      </Button>
    </ZeroState>
  );

  const content = () => {
    switch (activeView) {
      case 'mine': {
        const state = stateFor('mine', lists.mine.length === 0);
        if (state === 'loading') return <Loading text={t('shifts.loading')} />;
        if (state === 'error') return errorState;
        return (
          <FlatList
            data={mineRows}
            keyExtractor={(row: DayRow) => row.key}
            renderItem={({ item: row }: { item: DayRow }) =>
              row.type === 'header' ? (
                <Text size="sm" className="mb-2 mt-2 font-semibold uppercase text-typography-500" accessibilityRole="header">
                  {row.title}
                </Text>
              ) : (
                <ShiftDayCard shiftDay={row.day} onPress={openDayDetails} />
              )
            }
            contentContainerStyle={styles.list}
            refreshControl={<RefreshControl refreshing={false} onRefresh={refresh} />}
            ListHeaderComponent={
              standingShifts.length > 0 ? (
                <VStack className="mb-2">
                  <Text size="sm" className="mb-2 font-semibold uppercase text-typography-500" accessibilityRole="header">
                    {t('shifts.my_standing_shifts')}
                  </Text>
                  {standingShifts.map((shift) => (
                    <ShiftCard key={shift.ShiftId} shift={shift} onPress={setOpenShift} />
                  ))}
                </VStack>
              ) : null
            }
            ListEmptyComponent={<ZeroState icon={CalendarDays} heading={t('shifts.empty.mine_title')} description={t('shifts.empty.mine_description')} testID="shifts-mine-empty" />}
            testID="shifts-mine-list"
          />
        );
      }
      case 'signup': {
        const state = stateFor('signup', signupDays.length === 0);
        if (state === 'loading') return <Loading text={t('shifts.loading')} />;
        if (state === 'error') return errorState;
        return (
          <FlatList
            data={visibleSignupDays}
            keyExtractor={dayKey}
            renderItem={renderDay}
            contentContainerStyle={styles.list}
            refreshControl={<RefreshControl refreshing={false} onRefresh={refresh} />}
            ListHeaderComponent={
              <VStack space="xs" className="mb-2">
                <Text size="sm" className="text-typography-600">
                  {t('shifts.signup_view.description')}
                </Text>
                <HStack className="pt-1" accessibilityRole="tablist">
                  {chip('needed', t('shifts.signup_view.filter_needed'), signupFilter === 'needed', () => setSignupFilter('needed'), 'shifts-signup-filter-needed')}
                  {chip('all', t('shifts.signup_view.filter_all'), signupFilter === 'all', () => setSignupFilter('all'), 'shifts-signup-filter-all')}
                </HStack>
              </VStack>
            }
            ListEmptyComponent={<ZeroState icon={CalendarDays} heading={t('shifts.empty.signup_title')} description={t('shifts.empty.signup_description')} testID="shifts-signup-empty" />}
            testID="shifts-signup-list"
          />
        );
      }
      case 'calendar':
        return (
          <FlatList
            data={daysForSelectedDate}
            keyExtractor={dayKey}
            renderItem={({ item }: { item: ShiftDayResultData }) => (
              <View className="px-4">
                <ShiftDayCard shiftDay={item} onPress={openDayDetails} />
              </View>
            )}
            contentContainerStyle={styles.calendar}
            refreshControl={<RefreshControl refreshing={false} onRefresh={refresh} />}
            ListHeaderComponent={
              <VStack space="sm">
                <HStack className="items-center pr-4">
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} accessibilityLabel={t('shifts.calendar_view.filter_a11y')}>
                    {chip('all', t('shifts.all_shifts'), calendarShiftId === null, () => filterCalendar(null), 'shifts-calendar-filter-all')}
                    {shifts.map((shift) => chip(shift.ShiftId, shift.Name, calendarShiftId === shift.ShiftId, () => filterCalendar(shift.ShiftId), `shifts-calendar-filter-${shift.ShiftId}`))}
                  </ScrollView>
                  {calendarShiftId ? (
                    <Pressable
                      onPress={() => setOpenShift(shifts.find((shift) => shift.ShiftId === calendarShiftId) ?? null)}
                      accessibilityRole="button"
                      accessibilityLabel={t('shifts.calendar_view.shift_info')}
                      testID="shifts-calendar-shift-info"
                      className="p-2"
                    >
                      <RNView>
                        <Info size={20} color={colors.primary} />
                      </RNView>
                    </Pressable>
                  ) : null}
                </HStack>
                <ShiftCalendarView month={calendarMonth} days={lists.calendar} selectedDate={selectedDate} isLoading={loading.calendar === true} onMonthChange={changeMonth} onSelectDate={setSelectedDate} />
                {selectedDate ? (
                  <Text className="px-4 font-semibold text-typography-900" accessibilityRole="header">
                    {formatShiftLongDate(selectedDate, i18n.language)}
                  </Text>
                ) : null}
              </VStack>
            }
            ListEmptyComponent={
              <Text className="px-4 py-6 text-center text-typography-500" testID="shifts-calendar-empty">
                {selectedDate ? t('shifts.empty.calendar_day') : t('shifts.calendar_view.select_day')}
              </Text>
            }
            testID="shifts-calendar-list"
          />
        );
      case 'trades':
        return trades.length === 0 && openTrades.length === 0 && (loading.trades === true || loading.openTrades === true) ? (
          <Loading text={t('shifts.loading')} />
        ) : (
          <ShiftTradesList
            trades={trades}
            openTrades={openTrades}
            filter={tradesFilter}
            onFilterChange={setTradesFilter}
            isLoading={false}
            onRefresh={refresh}
            onAction={handleTradeAction}
            onOpenDetails={openTradeDetails}
          />
        );
      case 'approvals':
        return <ShiftApprovalsList signups={pendingSignups} trades={pendingTrades} isLoading={false} onRefresh={refresh} onAction={setSheetAction} onOpenTradeDetails={openTradeDetails} />;
      case 'onduty':
        return onDutyPersonnel.length === 0 && loading.onDuty === true ? <Loading text={t('shifts.loading')} /> : <ShiftOnDutyList personnel={onDutyPersonnel} isLoading={false} onRefresh={refresh} />;
      case 'today':
      default: {
        const state = stateFor('today', lists.today.length === 0);
        if (state === 'loading') return <Loading text={t('shifts.loading')} />;
        if (state === 'error') return errorState;
        return (
          <FlatList
            data={today}
            keyExtractor={dayKey}
            renderItem={renderDay}
            contentContainerStyle={styles.list}
            refreshControl={<RefreshControl refreshing={false} onRefresh={refresh} />}
            ListEmptyComponent={<ZeroState icon={CalendarDays} heading={t('shifts.no_shifts_today')} description={t('shifts.no_shifts_today_description')} testID="shifts-today-empty" />}
            testID="shifts-today-list"
          />
        );
      }
    }
  };

  const showSearch = activeView === 'today' || activeView === 'mine' || activeView === 'signup';

  return (
    <View className="flex-1 bg-background-50" testID="shifts-screen" accessibilityLabel={title}>
      <ShiftSegmentBar segments={segments} active={activeView} onChange={changeView} />
      {showSearch ? (
        <View className="px-4 pb-1 pt-3">
          <Input variant="outline" size="md" className="bg-background-0">
            <InputSlot className="pl-3">
              <InputIcon as={Search} />
            </InputSlot>
            <InputField placeholder={t('shifts.search_placeholder')} value={query} onChangeText={setQuery} accessibilityLabel={t('shifts.search_placeholder')} testID="shifts-search-input" />
            {query ? (
              <InputSlot className="pr-3" onPress={() => setQuery('')} accessibilityRole="button" accessibilityLabel={t('common.clear_search')} testID="shifts-clear-search">
                <InputIcon as={X} />
              </InputSlot>
            ) : null}
          </Input>
        </View>
      ) : null}
      <View className="flex-1 pt-2">{content()}</View>

      <ShiftDetailsSheet shift={openShift} onClose={() => setOpenShift(null)} onViewCalendar={viewShiftInCalendar} onOpenDay={openDayDetails} />
      <ShiftDayDetailsSheet shiftDay={openDay} onClose={() => setOpenDay(null)} />
      <ShiftTradeDetailsSheet trade={openTrade} onClose={() => setOpenTrade(null)} onAction={handleTradeAction} />
      <ShiftActionSheet action={sheetAction} onClose={() => setSheetAction(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: 16, paddingBottom: 24 },
  calendar: { paddingBottom: 24 },
  chips: { paddingLeft: 16, paddingRight: 8, paddingVertical: 4 },
});
