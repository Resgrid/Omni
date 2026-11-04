import { type AlertColors, alertColors, formatElapsed, type UnitStatusTimerSchedule, type UnitStatusTimerView } from '@resgrid/features/unit-status-alerts';
import type { LocalNotification } from '@resgrid/notifications';

export type UnitTimerTone = 'neutral' | 'approaching' | 'warn' | 'alert';

export interface UnitTimerText {
  /** What the crew needs to know now ("Status timer warning in 25s", "Status timer exceeded: Dispatched for 9m"). */
  headline: string;
  /** What comes next, or how long the unit has been in the status; null when nothing more applies. */
  detail: string | null;
  tone: UnitTimerTone;
}

/** The `t` of `useTranslation` (every value these strings interpolate is already text). */
type Translate = (key: string, options?: Record<string, string>) => string;

/**
 * The words for the unit's own status timer (Unit's console card and banner): within it, the time in status and when it
 * warns; close to it, a countdown; past it, how far over and what fires next. `status` is the department's status name.
 */
export function unitTimerText(t: Translate, timer: Pick<UnitStatusTimerView, 'alert' | 'next' | 'approaching'>, status: string): UnitTimerText {
  const elapsed = formatElapsed(timer.alert.secondsInStatus);
  const { next } = timer;
  const countdown = next ? formatElapsed(next.inSeconds) : '';

  if (timer.alert.level === 'alert') return { headline: t('unit_status.timer_exceeded', { status, elapsed }), detail: null, tone: 'alert' };

  if (timer.alert.level === 'warn') {
    return { headline: t('unit_status.timer_warning', { status, elapsed }), detail: next ? t('unit_status.timer_alert_in', { time: countdown }) : null, tone: 'warn' };
  }

  const inStatus = t('unit_status.timer_in_status', { status, elapsed });

  if (next && timer.approaching) return { headline: t(next.level === 'warn' ? 'unit_status.timer_warn_in' : 'unit_status.timer_alert_in', { time: countdown }), detail: inStatus, tone: 'approaching' };

  return { headline: inStatus, detail: next ? t(next.level === 'warn' ? 'unit_status.timer_warn_at' : 'unit_status.timer_alert_at', { time: formatElapsed(next.atSeconds) }) : null, tone: 'neutral' };
}

/** The edge and wash per tone: within the timer it stays neutral; close to it, an amber edge only. */
export const timerToneColors = (tone: UnitTimerTone, isDark: boolean): AlertColors => {
  if (tone === 'alert' || tone === 'warn') return alertColors(tone, isDark);

  return { edge: tone === 'approaching' ? alertColors('warn', isDark).edge : undefined, background: undefined };
};

/**
 * The notifications the device shows for the unit's own timer while the app is in the background: one when it warns and
 * one when it fires, worded like the strip under the app bar at the moment each one shows. `unit` and `status` are the
 * unit's and the department's status names.
 */
export function unitTimerNotifications(t: Translate, schedule: UnitStatusTimerSchedule, names: { unit: string; status: string }): LocalNotification[] {
  const body = t('unit_status.timer_notification_body', { unit: names.unit });

  return schedule.firings.map((firing) => ({
    key: firing.level,
    at: firing.at,
    title: t(firing.level === 'alert' ? 'unit_status.timer_exceeded' : 'unit_status.timer_warning', { status: names.status, elapsed: formatElapsed(firing.atSeconds) }),
    body,
  }));
}
