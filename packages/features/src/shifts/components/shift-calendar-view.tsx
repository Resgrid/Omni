import { useTranslation } from '@resgrid/i18n';
import type { ShiftDayResultData } from '@resgrid/models';
import { HStack, Pressable, Spinner, Text, useThemeColors, VStack } from '@resgrid/ui';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { summarizeShiftDaysByDate } from '../lib/shift-rules';
import { addMonths, formatMonthLabel, formatShiftLongDate, monthGrid, toDateParam } from '../lib/shift-time';

export interface ShiftCalendarViewProps {
  month: Date;
  days: readonly ShiftDayResultData[];
  selectedDate: string | null;
  isLoading: boolean;
  onMonthChange: (month: Date) => void;
  onSelectDate: (date: string) => void;
}

const WEEKDAY_SAMPLE = Array.from({ length: 7 }, (_, index) => new Date(2026, 1, index + 1)); // 1 Feb 2026 is a Sunday.

const weekdayLabels = (locale?: string): string[] =>
  WEEKDAY_SAMPLE.map((date) => {
    try {
      return new Intl.DateTimeFormat(locale, { weekday: 'narrow' }).format(date);
    } catch {
      return String(date.getDay());
    }
  });

/** Month grid with a dot per day: green = I am on, amber = open slots, grey = fully staffed. */
export const ShiftCalendarView: React.FC<ShiftCalendarViewProps> = ({ month, days, selectedDate, isLoading, onMonthChange, onSelectDate }) => {
  const { t, i18n } = useTranslation();
  const colors = useThemeColors();
  const locale = i18n.language;
  const grid = useMemo(() => monthGrid(month), [month]);
  const summaries = useMemo(() => summarizeShiftDaysByDate(days), [days]);
  const weekdays = useMemo(() => weekdayLabels(locale), [locale]);
  const todayKey = toDateParam(new Date());

  return (
    <VStack space="sm" className="px-4 pb-2" testID="shift-calendar-view">
      <HStack className="items-center justify-between">
        <Pressable onPress={() => onMonthChange(addMonths(month, -1))} accessibilityRole="button" accessibilityLabel={t('shifts.calendar_view.previous_month')} testID="shift-calendar-previous" className="rounded-md p-2">
          <View>
            <ChevronLeft size={20} color={colors.icon} />
          </View>
        </Pressable>
        <HStack space="sm" className="items-center">
          <Text className="text-lg font-semibold text-typography-900" accessibilityRole="header" testID="shift-calendar-month">
            {formatMonthLabel(month, locale)}
          </Text>
          {isLoading ? <Spinner size="small" testID="shift-calendar-loading" /> : null}
        </HStack>
        <Pressable onPress={() => onMonthChange(addMonths(month, 1))} accessibilityRole="button" accessibilityLabel={t('shifts.calendar_view.next_month')} testID="shift-calendar-next" className="rounded-md p-2">
          <View>
            <ChevronRight size={20} color={colors.icon} />
          </View>
        </Pressable>
      </HStack>

      <View style={styles.grid}>
        {weekdays.map((label, index) => (
          <View key={`weekday-${index}`} style={styles.headerCell}>
            <Text size="xs" className="font-semibold text-typography-500">
              {label}
            </Text>
          </View>
        ))}
        {Array.from({ length: grid.leadingBlanks }, (_, index) => (
          <View key={`blank-${index}`} style={styles.cell} />
        ))}
        {grid.days.map(({ key, day }) => {
          const summary = summaries.get(key);
          const isSelected = selectedDate === key;
          const isToday = key === todayKey;
          return (
            <View key={key} style={styles.cell}>
              <Pressable
                onPress={() => onSelectDate(key)}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={t('shifts.calendar_view.day_a11y', { date: formatShiftLongDate(key, locale), count: summary?.count ?? 0, open: summary?.openSlots ?? 0 })}
                testID={`shift-calendar-day-${key}`}
                className={`m-0.5 flex-1 items-center justify-center rounded-md ${isSelected ? 'bg-primary-600' : isToday ? 'bg-primary-50' : 'bg-background-0'}`}
              >
                <Text size="sm" className={`font-medium ${isSelected ? 'text-typography-0' : isToday ? 'text-primary-700' : 'text-typography-900'}`}>
                  {String(day)}
                </Text>
                {summary ? (
                  <View style={styles.dots}>
                    {summary.hasMine ? <View style={StyleSheet.flatten([styles.dot, { backgroundColor: colors.success }])} testID={`shift-calendar-mine-${key}`} /> : null}
                    {summary.openSlots > 0 ? <View style={StyleSheet.flatten([styles.dot, { backgroundColor: colors.warning }])} testID={`shift-calendar-open-${key}`} /> : null}
                    {summary.allFilled ? <View style={StyleSheet.flatten([styles.dot, { backgroundColor: colors.textSubtle }])} /> : null}
                  </View>
                ) : null}
              </Pressable>
            </View>
          );
        })}
      </View>

      <HStack space="md" className="flex-wrap justify-center">
        {[
          { key: 'mine', color: colors.success, label: t('shifts.calendar_view.legend_mine') },
          { key: 'open', color: colors.warning, label: t('shifts.calendar_view.legend_open') },
          { key: 'filled', color: colors.textSubtle, label: t('shifts.calendar_view.legend_filled') },
        ].map((item) => (
          <HStack key={item.key} space="xs" className="items-center">
            <View style={StyleSheet.flatten([styles.legendDot, { backgroundColor: item.color }])} />
            <Text size="xs" className="text-typography-600">
              {item.label}
            </Text>
          </HStack>
        ))}
      </HStack>
    </VStack>
  );
};

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  headerCell: { width: `${100 / 7}%`, alignItems: 'center', paddingVertical: 4 },
  cell: { width: `${100 / 7}%`, height: 52 },
  dots: { flexDirection: 'row', marginTop: 4 },
  dot: { width: 6, height: 6, borderRadius: 3, marginHorizontal: 1 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
});
