import { RECURRING_CALL_LAST_WEEK, RecurringCallCreationMode, RecurringCallFrequency, type RecurringCallResultData } from '@resgrid/models';

/** The translate function the pure helpers take (`t` from `useTranslation`). */
export type Translate = (key: string, options?: Record<string, string | number>) => string;

/** Where a schedule stands: running, paused by a person, or past its end date. */
export type RecurringCallStatus = 'active' | 'paused' | 'ended';

export const recurringCallStatus = (schedule: Pick<RecurringCallResultData, 'IsActive' | 'HasEnded'>): RecurringCallStatus => (schedule.HasEnded ? 'ended' : schedule.IsActive ? 'active' : 'paused');

export const STATUS_LABEL_KEYS: Record<RecurringCallStatus, string> = {
  active: 'recurring_calls.status_active',
  paused: 'recurring_calls.status_paused',
  ended: 'recurring_calls.status_ended',
};

export const isDispatcherMode = (schedule: Pick<RecurringCallResultData, 'CreationMode'>): boolean => schedule.CreationMode === RecurringCallCreationMode.Dispatcher;

/** Sunday to Saturday, as `System.DayOfWeek` numbers them. */
export const WEEKDAYS: readonly number[] = [0, 1, 2, 3, 4, 5, 6];

/** A weekday's name in the user's language (0 = Sunday), from a known Sunday (1 January 2023). */
export const weekdayName = (day: number, locale: string, style: 'short' | 'long' = 'short'): string => new Date(2023, 0, 1 + day, 12).toLocaleDateString(locale, { weekday: style });

/** "first", "second", … "last" for monthly-by-weekday schedules, in the order the form offers them. */
export const WEEK_ORDINAL_KEYS = new Map<number, string>([
  [1, 'recurring_calls.week_first'],
  [2, 'recurring_calls.week_second'],
  [3, 'recurring_calls.week_third'],
  [4, 'recurring_calls.week_fourth'],
  [RECURRING_CALL_LAST_WEEK, 'recurring_calls.week_last'],
]);

const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A department calendar day ("yyyy-MM-dd") for display, never shifted into another zone; the text as given when unreadable. */
export function formatDateKey(value: string | null | undefined, locale: string, style: 'short' | 'long' = 'short'): string {
  const match = DATE_KEY.exec((value ?? '').slice(0, 10));

  if (!match) return value ?? '';
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);

  return style === 'long'
    ? date.toLocaleDateString(locale, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
    : date.toLocaleDateString(locale, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
}

/** The "HH:mm" of a department wall clock ("2026-11-18T08:00:00"); '' when there is none. */
export const wallClockTime = (value: string | null | undefined): string => (value && value.length >= 16 ? value.slice(11, 16) : '');

/** The calendar day of a department wall clock ("2026-11-18T08:00:00" → "2026-11-18"). */
export const wallClockDay = (value: string | null | undefined): string => (value ?? '').slice(0, 10);

/** A department wall clock for display: its day and time. */
export const formatWallClock = (value: string | null | undefined, locale: string): string => {
  const day = wallClockDay(value);
  const time = wallClockTime(value);

  return day ? `${formatDateKey(day, locale)} ${time}`.trim() : '';
};

/** A number of minutes the way the form and summaries show it: whole days, else whole hours, else minutes. */
export function formatMinutes(minutes: number, t: Translate): string {
  if (minutes > 0 && minutes % 1440 === 0) return t('recurring_calls.duration_days', { count: minutes / 1440 });

  if (minutes > 0 && minutes % 60 === 0) return t('recurring_calls.duration_hours', { count: minutes / 60 });

  return t('recurring_calls.duration_minutes', { count: minutes });
}

/** When the dispatcher hears about an occurrence ("15 min before", or at the time). */
export const formatAlertLead = (minutes: number, t: Translate): string => (minutes > 0 ? t('recurring_calls.alert_before', { duration: formatMinutes(minutes, t) }) : t('recurring_calls.alert_at_time'));

type PatternFields = Pick<RecurringCallResultData, 'Frequency' | 'RepeatInterval' | 'Days' | 'MonthlyDay' | 'MonthlyWeek' | 'MonthlyWeekday'>;

/** How often it repeats, in words: "Every 2 weeks on Tue, Thu", "Every month on the last Friday". */
export function describePattern(schedule: PatternFields, t: Translate, locale: string): string {
  const interval = Math.max(1, schedule.RepeatInterval || 1);
  const every = interval > 1 ? '_interval' : '';

  if (schedule.Frequency === RecurringCallFrequency.Daily) return t(`recurring_calls.pattern_daily${every}`, { count: interval });

  if (schedule.Frequency === RecurringCallFrequency.Monthly) {
    if (schedule.MonthlyWeek > 0) {
      const week = t(WEEK_ORDINAL_KEYS.get(schedule.MonthlyWeek) ?? 'recurring_calls.week_first');

      return t(`recurring_calls.pattern_monthly_weekday${every}`, { count: interval, week, weekday: weekdayName(schedule.MonthlyWeekday, locale, 'long') });
    }

    return t(`recurring_calls.pattern_monthly_day${every}`, { count: interval, day: schedule.MonthlyDay });
  }

  const days = [...(schedule.Days ?? [])]
    .sort((a, b) => a - b)
    .map((day) => weekdayName(day, locale))
    .join(', ');

  return t(`recurring_calls.pattern_weekly${every}`, { count: interval, days });
}

/** The whole schedule in one line: pattern, times of day, and the dates it runs between. */
export function describeSchedule(schedule: PatternFields & Pick<RecurringCallResultData, 'Times' | 'StartsOn' | 'EndsOn'>, t: Translate, locale: string): string {
  const pattern = describePattern(schedule, t, locale);
  const times = (schedule.Times ?? []).join(', ');
  const when = times ? t('recurring_calls.pattern_at', { pattern, times }) : pattern;
  const start = formatDateKey(schedule.StartsOn, locale);
  const range = schedule.EndsOn ? t('recurring_calls.range_between', { start, end: formatDateKey(schedule.EndsOn, locale) }) : t('recurring_calls.range_from', { start });

  return `${when}. ${range}`;
}

/** How the calls are made: created ahead and sent automatically, or a dispatcher alerted to send each one. */
export function describeMode(schedule: Pick<RecurringCallResultData, 'CreationMode' | 'LeadTimeMinutes' | 'ManualAlertMinutes'>, t: Translate): string {
  if (isDispatcherMode(schedule)) {
    return schedule.ManualAlertMinutes > 0 ? t('recurring_calls.mode_dispatcher_summary', { lead: formatMinutes(schedule.ManualAlertMinutes, t) }) : t('recurring_calls.mode_dispatcher_summary_at_time');
  }

  return t('recurring_calls.mode_automatic_summary', { lead: formatMinutes(schedule.LeadTimeMinutes, t) });
}

/** The label of the mode chip. */
export const modeLabelKey = (schedule: Pick<RecurringCallResultData, 'CreationMode'>): string => (isDispatcherMode(schedule) ? 'recurring_calls.mode_dispatcher' : 'recurring_calls.mode_automatic');

/** Non-blank parts joined with " · ". */
export const joinParts = (parts: readonly (string | null | undefined)[]): string => parts.filter((part): part is string => !!part && part.trim().length > 0).join(' · ');

/** A schedule's name, or its number when it has none. */
export const scheduleName = (schedule: Pick<RecurringCallResultData, 'RecurringCallId' | 'Name'>): string => schedule.Name?.trim() || `#${schedule.RecurringCallId}`;
