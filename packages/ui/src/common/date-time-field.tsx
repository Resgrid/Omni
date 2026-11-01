import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { NativeModal } from '../native-modal';
import { Text } from '../text';
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

// One picker for native and web. No keyboard entry; cancel never commits the draft.
// Date-only and clock-only values keep their calendar day/clock across time zones.
export const DateTimeField = ({ value, onChange, label, mode = 'date', disabled = false, clearable = true, testID = 'date-time-field' }: DateTimeFieldProps) => {
  const { t, i18n } = useTranslation();
  const locale = i18n?.language ?? 'en';
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(() => parsePickerValue(value, mode));
  const [month, setMonth] = useState(draft.getMonth());
  const [year, setYear] = useState(draft.getFullYear());
  const [view, setView] = useState<'days' | 'months' | 'years'>('days');
  const [yearPage, setYearPage] = useState(year - 11);
  const selected = parsePickerValue(value, mode);
  const display = !value ? label : mode === 'time' ? pickerTime(selected) : mode === 'date' ? selected.toLocaleDateString(locale) : selected.toLocaleString(locale);
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
  const choice = (text: string, id: string, onPress: () => void, chosen = false, accessibilityLabel = text) => (
    <Pressable
      key={id}
      testID={`${testID}-${id}`}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected: chosen }}
      onPress={onPress}
      className={chosen ? 'min-h-11 items-center justify-center rounded bg-primary-600 px-2 py-3 dark:bg-primary-400' : 'min-h-11 items-center justify-center rounded px-2 py-3'}
    >
      <Text className={chosen ? 'text-center text-white' : 'text-center text-typography-900'}>{text}</Text>
    </Pressable>
  );
  const clockColumn = (part: 'hour' | 'minute', count: number, current: number) => (
    <View className="flex-1">
      <Text className="text-center font-semibold">{t(`dateTimePicker.${part}`, { defaultValue: part === 'hour' ? 'Hour' : 'Minute' })}</Text>
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
        className="min-h-11 justify-center rounded border border-outline-300 bg-background-0 px-3 py-2"
      >
        {value ? <Text className="text-xs text-typography-500">{label}</Text> : null}
        <Text className={disabled ? 'text-typography-500' : 'text-typography-900'}>{display}</Text>
      </Pressable>
      {open && !disabled ? (
        <NativeModal visible transparent animationType="fade" onRequestClose={() => setOpen(false)}>
          <SafeAreaView className="flex-1 justify-center bg-black/50 p-4">
            <View accessibilityViewIsModal className="max-h-[95%] w-full max-w-lg self-center rounded-xl bg-background-0 p-4">
              <Text accessibilityRole="header" className="mb-2 text-lg font-bold">
                {label}
              </Text>
              <ScrollView>
                {mode !== 'time' ? (
                  <View>
                    <View className="flex-row items-center justify-between">
                      {choice('‹', 'previous', () => move(-1), false, t('common.previous', { defaultValue: 'Previous' }))}
                      {choice(calendarDate(1).toLocaleDateString(locale, { month: 'long' }), 'month', () => setView(view === 'months' ? 'days' : 'months'))}
                      {choice(String(year), 'year', () => setView(view === 'years' ? 'days' : 'years'))}
                      {choice('›', 'next', () => move(1), false, t('common.next', { defaultValue: 'Next' }))}
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
                              year === number
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
                              month === number
                            )}
                          </View>
                        ))}
                      </View>
                    ) : (
                      <View className="flex-row flex-wrap">
                        {Array.from({ length: 7 }, (_, day) => (
                          <View key={`weekday-${day}`} style={styles.dayCell}>
                            <Text className="py-2 text-center text-xs text-typography-500">{new Date(2024, 0, 7 + day).toLocaleDateString(locale, { weekday: 'short' })}</Text>
                          </View>
                        ))}
                        {Array.from({ length: calendarDate(1).getDay() }, (_, index) => (
                          <View key={`blank-${index}`} style={styles.dayCell} />
                        ))}
                        {Array.from({ length: monthEnd.getDate() }, (_, index) => index + 1).map((day) => {
                          const date = calendarDate(day);
                          return (
                            <View key={day} style={styles.dayCell}>
                              {choice(String(day), `day-${day}`, () => setDraft(date), pickerDate(date) === pickerDate(draft), date.toLocaleDateString(locale, { dateStyle: 'full' }))}
                            </View>
                          );
                        })}
                      </View>
                    )}
                  </View>
                ) : null}
                {mode !== 'date' ? (
                  <View className="mt-3 flex-row">
                    {clockColumn('hour', 24, draft.getHours())}
                    <View style={styles.clockGap} />
                    {clockColumn('minute', 60, draft.getMinutes())}
                  </View>
                ) : null}
              </ScrollView>
              <View className="mt-3 flex-row justify-between">
                {clearable ? choice(t('dateTimePicker.clear', { defaultValue: 'Clear' }), 'clear', () => commit('')) : <View />}
                {choice(t('common.cancel', { defaultValue: 'Cancel' }), 'cancel', () => setOpen(false))}
                {choice(t('common.done', { defaultValue: 'Done' }), 'done', () => commit(serializePickerValue(draft, mode)), true)}
              </View>
            </View>
          </SafeAreaView>
        </NativeModal>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  clockColumn: { height: 192 },
  clockGap: { width: 16 },
  yearCell: { width: '25%' },
  monthCell: { width: '33.333%' },
  dayCell: { width: '14.2857%' },
});
