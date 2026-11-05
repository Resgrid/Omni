import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Clock, type LucideIcon } from 'lucide-react-native';
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { NativeModal } from '../native-modal';
import { Text } from '../text';
import { useThemeColors } from '../theme/use-theme-colors';
import { useTranslation } from '../utils/i18n';
import { parsePickerValue, pickerDate, type PickerMode, pickerTime, serializePickerValue } from './date-time-picker';

export type { PickerMode };

export interface DateTimeFieldProps {
  value: string;
  onChange: (value: string) => void;
  label: string;
  mode?: PickerMode;
  disabled?: boolean;
  clearable?: boolean;
  testID?: string;
}

const LONG_DATE: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' };
const LONG_DATE_TIME: Intl.DateTimeFormatOptions = { ...LONG_DATE, hour: '2-digit', minute: '2-digit' };

// One picker for native and web. No keyboard entry; cancel never commits the draft.
// Date-only and clock-only values keep their calendar day/clock across time zones.
// The dialog is a raised card (lighter surface, strong border, shadow) over a heavy scrim, with a primary-coloured
// header that shows the pending choice, so it never reads as part of the page beneath it, in dark mode above all.
export const DateTimeField = ({ value, onChange, label, mode = 'date', disabled = false, clearable = true, testID = 'date-time-field' }: DateTimeFieldProps) => {
  const { t, i18n } = useTranslation();
  const colors = useThemeColors();
  const locale = i18n?.language ?? 'en';
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(() => parsePickerValue(value, mode));
  const [month, setMonth] = useState(draft.getMonth());
  const [year, setYear] = useState(draft.getFullYear());
  const [view, setView] = useState<'days' | 'months' | 'years'>('days');
  const [yearPage, setYearPage] = useState(year - 11);
  const selected = parsePickerValue(value, mode);
  const display = !value ? label : mode === 'time' ? pickerTime(selected) : mode === 'date' ? selected.toLocaleDateString(locale) : selected.toLocaleString(locale);
  const draftText = mode === 'time' ? pickerTime(draft) : mode === 'date' ? draft.toLocaleDateString(locale, LONG_DATE) : draft.toLocaleString(locale, LONG_DATE_TIME);
  const today = new Date();
  const todayKey = pickerDate(today);
  const FieldIcon = mode === 'time' ? Clock : CalendarDays;

  const show = () => {
    if (disabled) return;
    const next = parsePickerValue(value, mode);
    setDraft(next);
    setMonth(next.getMonth());
    setYear(next.getFullYear());
    setYearPage(Math.max(1, Math.min(9976, next.getFullYear() - 11)));
    setView('days');
    setOpen(true);
  };

  const commit = (next: string) => {
    if (!disabled) onChange(next);
    setOpen(false);
  };

  const calendarDate = (day: number) => {
    const date = new Date(draft);
    date.setDate(1);
    date.setFullYear(year, month, day);

    return date;
  };

  const monthEnd = calendarDate(1);
  monthEnd.setMonth(month + 1, 0);

  // The selection follows the calendar: Done never commits a day from a month or year no longer shown. The day is
  // kept where the new month has it (Jan 31 -> Feb 28/29), and so is the time of day.
  const showPeriod = (nextYear: number, nextMonth: number) => {
    const next = new Date(draft);
    next.setDate(1);
    next.setFullYear(nextYear, nextMonth + 1, 0);
    next.setDate(Math.min(draft.getDate(), next.getDate()));
    setDraft(next);
    setMonth(nextMonth);
    setYear(nextYear);
  };

  const move = (direction: number) => {
    if (view === 'years') {
      setYearPage((page) => Math.max(1, Math.min(9976, page + direction * 24)));

      return;
    }

    const next = calendarDate(1);
    next.setMonth(month + direction);

    if (next.getFullYear() < 1 || next.getFullYear() > 9999) return;
    showPeriod(next.getFullYear(), next.getMonth());
  };

  // Today moves the draft (keeping its time of day) and the calendar; like every other choice it waits for Done.
  const goToday = () => {
    const next = new Date(draft);
    next.setDate(1);
    next.setFullYear(today.getFullYear(), today.getMonth(), today.getDate());
    setDraft(next);
    setMonth(today.getMonth());
    setYear(today.getFullYear());
    setYearPage(Math.max(1, Math.min(9976, today.getFullYear() - 11)));
    setView('days');
  };

  const showYears = () => {
    setYearPage(Math.max(1, Math.min(9976, year - 11)));
    setView(view === 'years' ? 'days' : 'years');
  };

  // A month, year or clock cell: filled when chosen, ringed when it holds today.
  const choice = (text: string, id: string, onPress: () => void, chosen = false, current = false) => (
    <Pressable
      key={id}
      testID={`${testID}-${id}`}
      accessibilityRole="button"
      accessibilityLabel={text}
      accessibilityState={{ selected: chosen }}
      onPress={onPress}
      className={
        chosen
          ? 'min-h-11 items-center justify-center rounded-lg bg-primary-600 px-2 py-3'
          : current
            ? 'min-h-11 items-center justify-center rounded-lg border border-primary-600 px-2 py-3'
            : 'min-h-11 items-center justify-center rounded-lg px-2 py-3'
      }
    >
      <Text className={chosen ? 'text-center font-semibold text-typography-0' : current ? 'text-center font-semibold text-primary-600' : 'text-center text-typography-900'}>{text}</Text>
    </Pressable>
  );

  const arrow = (id: 'previous' | 'next', Icon: LucideIcon, accessibilityLabel: string) => (
    <Pressable
      testID={`${testID}-${id}`}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={() => move(id === 'next' ? 1 : -1)}
      className="h-11 w-11 items-center justify-center rounded-full border border-outline-200 bg-background-0"
    >
      <View>
        <Icon size={20} color={colors.icon} />
      </View>
    </Pressable>
  );

  // The month and year headings open their grids; the chevron says they are menus and which one is open.
  const period = (text: string, id: 'month' | 'year', expanded: boolean, onPress: () => void) => {
    const Chevron = expanded ? ChevronUp : ChevronDown;

    return (
      <Pressable
        testID={`${testID}-${id}`}
        accessibilityRole="button"
        accessibilityLabel={text}
        accessibilityState={{ expanded }}
        onPress={onPress}
        className={expanded ? 'mx-0.5 min-h-11 flex-row items-center rounded-full bg-background-200 px-3' : 'mx-0.5 min-h-11 flex-row items-center rounded-full px-3'}
      >
        <Text className="text-base font-semibold text-typography-900">{text}</Text>
        <View className="ml-1">
          <Chevron size={16} color={colors.icon} />
        </View>
      </Pressable>
    );
  };

  const clockColumn = (part: 'hour' | 'minute', count: number, current: number) => (
    <View className="flex-1 rounded-xl border border-outline-200 bg-background-0 p-1">
      <Text className="py-1 text-center text-xs font-semibold text-typography-500">{t(`dateTimePicker.${part}`, { defaultValue: part === 'hour' ? 'Hour' : 'Minute' })}</Text>
      <ScrollView nestedScrollEnabled style={styles.clockColumn} contentOffset={{ x: 0, y: current * 48 }}>
        {Array.from({ length: count }, (_, number) =>
          choice(
            String(number).padStart(2, '0'),
            `${part}-${number}`,
            () => {
              const next = new Date(draft);

              if (part === 'hour') next.setHours(number, next.getMinutes(), 0, 0);
              else next.setMinutes(number, 0, 0);
              setDraft(next);
            },
            current === number
          )
        )}
      </ScrollView>
    </View>
  );

  return (
    <View>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityValue={{ text: value }}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={show}
        className="min-h-11 flex-row items-center rounded border border-outline-300 bg-background-0 px-3 py-2"
      >
        <View className="flex-1">
          {value ? <Text className="text-xs text-typography-500">{label}</Text> : null}
          {/* Empty, the label stands in as a placeholder, so it must not read as a value. */}
          <Text className={disabled || !value ? 'text-typography-500' : 'text-typography-900'}>{display}</Text>
        </View>
        <View className="ml-2">
          <FieldIcon size={18} color={disabled ? colors.textSubtle : colors.icon} />
        </View>
      </Pressable>
      {open && !disabled ? (
        <NativeModal visible transparent animationType="fade" onRequestClose={() => setOpen(false)}>
          {/* The scrim dims the page and, like Cancel, closes without committing. SafeAreaView is a third-party view
              that NativeWind does not style, so its layout is a plain style. */}
          <Pressable
            testID={`${testID}-backdrop`}
            accessibilityRole="button"
            accessibilityLabel={t('common.cancel', { defaultValue: 'Cancel' })}
            onPress={() => setOpen(false)}
            style={StyleSheet.flatten([styles.backdrop, { backgroundColor: colors.backdrop }])}
          />
          <SafeAreaView pointerEvents="box-none" style={styles.center}>
            <View accessibilityViewIsModal testID={`${testID}-dialog`} className="max-h-[95%] w-full max-w-md self-center overflow-hidden rounded-2xl border border-outline-300 bg-background-50" style={styles.card}>
              <View className="bg-primary-600 px-5 pb-4 pt-4">
                <View className="min-h-11 flex-row items-center">
                  <View>
                    <FieldIcon size={18} color={colors.textInverse} />
                  </View>
                  <Text accessibilityRole="header" numberOfLines={1} className="ml-2 flex-1 text-sm font-semibold text-typography-0">
                    {label}
                  </Text>
                  {mode !== 'time' ? (
                    <Pressable
                      testID={`${testID}-today`}
                      accessibilityRole="button"
                      accessibilityLabel={t('dateTimePicker.today', { defaultValue: 'Today' })}
                      onPress={goToday}
                      className="ml-2 min-h-9 justify-center rounded-full border border-typography-0 px-3"
                    >
                      <Text className="text-sm font-semibold text-typography-0">{t('dateTimePicker.today', { defaultValue: 'Today' })}</Text>
                    </Pressable>
                  ) : null}
                </View>
                {/* The pending choice, before Done commits it. */}
                <Text testID={`${testID}-selection`} accessibilityLiveRegion="polite" className="mt-1 text-2xl font-bold text-typography-0">
                  {draftText}
                </Text>
              </View>
              <ScrollView contentContainerClassName="p-3">
                {mode !== 'time' ? (
                  <View>
                    <View className="mb-2 flex-row items-center">
                      {arrow('previous', ChevronLeft, t('common.previous', { defaultValue: 'Previous' }))}
                      <View className="flex-1 flex-row flex-wrap items-center justify-center">
                        {period(calendarDate(1).toLocaleDateString(locale, { month: 'long' }), 'month', view === 'months', () => setView(view === 'months' ? 'days' : 'months'))}
                        {period(String(year), 'year', view === 'years', showYears)}
                      </View>
                      {arrow('next', ChevronRight, t('common.next', { defaultValue: 'Next' }))}
                    </View>
                    {view === 'years' ? (
                      <View className="flex-row flex-wrap">
                        {Array.from({ length: 24 }, (_, index) => yearPage + index).map((number) => (
                          <View key={number} style={styles.yearCell}>
                            {choice(
                              String(number),
                              `year-${number}`,
                              () => {
                                showPeriod(number, month);
                                setView('days');
                              },
                              year === number,
                              today.getFullYear() === number
                            )}
                          </View>
                        ))}
                      </View>
                    ) : view === 'months' ? (
                      <View className="flex-row flex-wrap">
                        {Array.from({ length: 12 }, (_, number) => (
                          <View key={number} style={styles.monthCell}>
                            {choice(
                              new Date(2024, number, 1).toLocaleDateString(locale, { month: 'short' }),
                              `month-${number}`,
                              () => {
                                showPeriod(year, number);
                                setView('days');
                              },
                              month === number,
                              today.getFullYear() === year && today.getMonth() === number
                            )}
                          </View>
                        ))}
                      </View>
                    ) : (
                      <View className="flex-row flex-wrap">
                        {Array.from({ length: 7 }, (_, day) => (
                          <View key={`weekday-${day}`} style={styles.dayCell}>
                            <Text className="py-2 text-center text-xs font-semibold text-typography-500">{new Date(2024, 0, 7 + day).toLocaleDateString(locale, { weekday: 'short' })}</Text>
                          </View>
                        ))}
                        {Array.from({ length: calendarDate(1).getDay() }, (_, index) => (
                          <View key={`blank-${index}`} style={styles.dayCell} />
                        ))}
                        {Array.from({ length: monthEnd.getDate() }, (_, index) => index + 1).map((day) => {
                          const date = calendarDate(day);
                          const chosen = pickerDate(date) === pickerDate(draft);
                          const isToday = pickerDate(date) === todayKey;

                          return (
                            <View key={day} style={styles.dayCell}>
                              <Pressable
                                testID={`${testID}-day-${day}`}
                                accessibilityRole="button"
                                accessibilityLabel={date.toLocaleDateString(locale, { dateStyle: 'full' })}
                                accessibilityState={{ selected: chosen }}
                                onPress={() => setDraft(date)}
                                className="min-h-11 items-center justify-center"
                              >
                                <View
                                  className={
                                    chosen
                                      ? 'h-10 w-10 items-center justify-center rounded-full bg-primary-600'
                                      : isToday
                                        ? 'h-10 w-10 items-center justify-center rounded-full border-2 border-primary-600'
                                        : 'h-10 w-10 items-center justify-center rounded-full'
                                  }
                                >
                                  <Text className={chosen ? 'font-bold text-typography-0' : isToday ? 'font-semibold text-primary-600' : 'text-typography-900'}>{String(day)}</Text>
                                </View>
                              </Pressable>
                            </View>
                          );
                        })}
                      </View>
                    )}
                  </View>
                ) : null}
                {mode !== 'date' ? (
                  <View className={mode === 'datetime' ? 'mt-3 flex-row' : 'flex-row'}>
                    {clockColumn('hour', 24, draft.getHours())}
                    <View style={styles.clockGap} />
                    {clockColumn('minute', 60, draft.getMinutes())}
                  </View>
                ) : null}
              </ScrollView>
              <View className="flex-row items-center border-t border-outline-200 px-4 py-3">
                {clearable ? (
                  <Pressable
                    testID={`${testID}-clear`}
                    accessibilityRole="button"
                    accessibilityLabel={t('dateTimePicker.clear', { defaultValue: 'Clear' })}
                    onPress={() => commit('')}
                    className="min-h-11 justify-center rounded-lg px-3"
                  >
                    <Text className="font-medium text-typography-700">{t('dateTimePicker.clear', { defaultValue: 'Clear' })}</Text>
                  </Pressable>
                ) : null}
                <View className="flex-1" />
                <Pressable
                  testID={`${testID}-cancel`}
                  accessibilityRole="button"
                  accessibilityLabel={t('common.cancel', { defaultValue: 'Cancel' })}
                  onPress={() => setOpen(false)}
                  className="min-h-11 justify-center rounded-lg border border-outline-300 bg-background-0 px-4"
                >
                  <Text className="font-medium text-typography-900">{t('common.cancel', { defaultValue: 'Cancel' })}</Text>
                </Pressable>
                <Pressable
                  testID={`${testID}-done`}
                  accessibilityRole="button"
                  accessibilityLabel={t('common.done', { defaultValue: 'Done' })}
                  onPress={() => commit(serializePickerValue(draft, mode))}
                  className="ml-2 min-h-11 justify-center rounded-lg bg-primary-600 px-5"
                >
                  <Text className="font-semibold text-typography-0">{t('common.done', { defaultValue: 'Done' })}</Text>
                </Pressable>
              </View>
            </View>
          </SafeAreaView>
        </NativeModal>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  // Lifts the dialog off the dimmed page; the border and surface carry it where a shadow cannot show (dark mode).
  backdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  center: { flex: 1, justifyContent: 'center', padding: 16 },
  card: { elevation: 24, shadowColor: '#000000', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.45, shadowRadius: 24 },
  clockColumn: { height: 192 },
  clockGap: { width: 12 },
  yearCell: { width: '25%', padding: 2 },
  monthCell: { width: '33.333%', padding: 2 },
  dayCell: { width: '14.2857%' },
});
