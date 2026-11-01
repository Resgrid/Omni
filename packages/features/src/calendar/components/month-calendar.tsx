import { useTerm } from '@resgrid/auth';
import { useTranslation } from '@resgrid/i18n';
import type { CalendarItemResultData } from '@resgrid/models';
import { Button, ButtonText, Heading, HStack, Text, useThemeColors, VStack } from '@resgrid/ui';
import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { Calendar, type CalendarProps, type DateData } from 'react-native-calendars';

import { formatDayKey, itemDays, itemsOnDate, todayKey } from '../lib/calendar-dates';

type MarkedDates = NonNullable<CalendarProps['markedDates']>;

export interface MonthCalendarProps {
  /** The visible month's items (department wall clock). */
  items: readonly CalendarItemResultData[];
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
  /** A different month came into view (`month` 1–12). */
  onMonthChange: (year: number, month: number) => void;
  isLoading?: boolean;
  testID?: string;
}

const DEFAULT_DOT = '#3B82F6';

/** Marks every day an item covers (multi-day and all-day included) with a dot in the item's type colour. */
export function buildMarkedDates(items: readonly CalendarItemResultData[], selectedDate: string | null, selectedColor: string): MarkedDates {
  const marked: MarkedDates = {};
  for (const item of items) {
    const dot = { key: item.CalendarItemId, color: item.TypeColor || DEFAULT_DOT };
    for (const day of itemDays(item)) {
      const entry = marked[day] ?? { marked: true, dots: [] };
      marked[day] = { ...entry, marked: true, dots: [...(entry.dots ?? []), dot] };
    }
  }
  if (selectedDate) marked[selectedDate] = { ...(marked[selectedDate] ?? {}), selected: true, selectedColor };
  return marked;
}

/**
 * The month grid (react-native-calendars, Responder's EnhancedCalendarView): dots per item in its type colour on every
 * day it covers, the selected day, swipe or arrows between months, and a Today button. Themed from the design tokens.
 */
export const MonthCalendar: React.FC<MonthCalendarProps> = ({ items, selectedDate, onSelectDate, onMonthChange, isLoading = false, testID = 'month-calendar' }) => {
  const { t, i18n } = useTranslation();
  const colors = useThemeColors();
  const title = useTerm('module.calendar', t('calendar.title'));
  const [visibleMonth, setVisibleMonth] = useState(() => `${todayKey().slice(0, 7)}-01`);
  // react-native-calendars reads `current` only when it mounts: "Today" from another month remounts the grid on it.
  const [gridKey, setGridKey] = useState(0);
  const markedDates = useMemo(() => buildMarkedDates(items, selectedDate, colors.primary), [colors.primary, items, selectedDate]);
  const dayCount = useMemo(() => (selectedDate ? itemsOnDate(items, selectedDate).length : 0), [items, selectedDate]);

  const theme = useMemo<CalendarProps['theme']>(
    () => ({
      backgroundColor: colors.surface,
      calendarBackground: colors.surface,
      textSectionTitleColor: colors.textMuted,
      textSectionTitleDisabledColor: colors.textSubtle,
      selectedDayBackgroundColor: colors.primary,
      selectedDayTextColor: colors.textInverse,
      todayTextColor: colors.primary,
      dayTextColor: colors.text,
      textDisabledColor: colors.textSubtle,
      dotColor: colors.warning,
      selectedDotColor: colors.textInverse,
      arrowColor: colors.textMuted,
      disabledArrowColor: colors.textSubtle,
      monthTextColor: colors.text,
      indicatorColor: colors.primary,
      textDayFontWeight: '400',
      textMonthFontWeight: '600',
      textDayHeaderFontWeight: '500',
      textDayFontSize: 16,
      textMonthFontSize: 18,
      textDayHeaderFontSize: 14,
    }),
    [colors]
  );

  const handleMonthChange = (month: DateData) => {
    setVisibleMonth(`${month.year}-${String(month.month).padStart(2, '0')}-01`);
    onMonthChange(month.year, month.month);
  };

  const goToToday = () => {
    const today = todayKey();
    const month = `${today.slice(0, 7)}-01`;
    if (month !== visibleMonth) {
      setVisibleMonth(month);
      setGridKey((key) => key + 1);
      onMonthChange(Number(today.slice(0, 4)), Number(today.slice(5, 7)));
    }
    onSelectDate(today);
  };

  return (
    <VStack className="bg-background-50" testID={testID}>
      <HStack className="items-center justify-between border-b border-outline-100 px-4 py-3">
        <Heading size="md">{title}</Heading>
        <Button variant="outline" size="sm" onPress={goToToday} testID={`${testID}-today`}>
          <ButtonText>{t('calendar.todayButton')}</ButtonText>
        </Button>
      </HStack>
      <View className="px-4 py-2">
        <Calendar
          key={gridKey}
          testID={`${testID}-grid`}
          current={visibleMonth}
          onDayPress={(day: DateData) => onSelectDate(day.dateString)}
          onMonthChange={handleMonthChange}
          markedDates={markedDates}
          markingType="multi-dot"
          theme={theme}
          firstDay={0}
          hideExtraDays
          enableSwipeMonths
          displayLoadingIndicator={isLoading}
        />
      </View>
      {selectedDate ? (
        <VStack className="border-t border-outline-100 px-4 py-3" testID={`${testID}-selected`}>
          <Text className="text-sm font-medium text-typography-900">{t('calendar.selectedDate.title', { date: formatDayKey(selectedDate, i18n?.language, 'long') })}</Text>
          <Text className="mt-1 text-xs text-typography-500">{dayCount > 0 ? t('calendar.eventsCount', { count: dayCount }) : t('calendar.noEvents')}</Text>
        </VStack>
      ) : null}
    </VStack>
  );
};
