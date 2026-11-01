import { parseDateISOString, parseUtcMs } from '@resgrid/core/utils/dates';

/** Compact elapsed time for a wall board: "45s", "4m", "1h 12m". Empty when unknown. */
export const formatElapsed = (seconds: number | null | undefined): string => {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds < 0) return '';
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
};

export type ElapsedUnit = 'just_now' | 'minutes' | 'hours' | 'days';

export interface ElapsedSince {
  unit: ElapsedUnit;
  count: number;
}

/** "Time ago" bucket since an instant (epoch ms); null when unknown. */
export const elapsedFromMs = (at: number | null, now: number): ElapsedSince | null => {
  if (at === null || !Number.isFinite(at)) return null;
  const minutes = Math.max(0, Math.floor((now - at) / 60000));
  if (minutes < 1) return { unit: 'just_now', count: 0 };
  if (minutes < 60) return { unit: 'minutes', count: minutes };
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return { unit: 'hours', count: hours };
  return { unit: 'days', count: Math.floor(hours / 24) };
};

/** "Time ago" since a UTC wire value (shared parser: some `*Utc` fields arrive without "Z"). */
export const elapsedSince = (utc: string | null | undefined, now: number): ElapsedSince | null => elapsedFromMs(parseUtcMs(utc), now);

/**
 * "Time ago" since a department-local wall-clock value (personnel `StatusTimestamp`, which Core converts to the
 * department's zone). Read in device-local time: a wall board runs in the department it shows.
 */
export const elapsedSinceLocal = (local: string | null | undefined, now: number): ElapsedSince | null => elapsedFromMs(parseDateISOString(local)?.getTime() ?? null, now);

export const ELAPSED_KEYS: Readonly<Record<ElapsedUnit, string>> = {
  just_now: 'dashboard.time.just_now',
  minutes: 'dashboard.time.minutes_ago',
  hours: 'dashboard.time.hours_ago',
  days: 'dashboard.time.days_ago',
};

const LEGACY_LABEL_COLORS: Readonly<Record<string, string>> = {
  'label-default': '#777777',
  'label-warning': '#F0AD4E',
  'label-danger': '#FF0000',
  'label-info': '#5BC0DE',
  'label-success': '#5CB85C',
  'label-inverse': '#000000',
};

/**
 * A status/priority colour usable as a CSS colour. Values arrive with or without '#' (BigBoard once prefixed a second
 * one, "##5CB85C", and every status drew near-black), and old rows can still hold a bootstrap label class.
 */
export const normalizeColor = (color: string | null | undefined, fallback = '#888888'): string => {
  const raw = (color ?? '').trim();
  if (!raw) return fallback;
  if (/^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(raw)) return raw;
  const legacy = LEGACY_LABEL_COLORS[raw];
  if (legacy) return legacy;
  if (/^[0-9a-f]{3}([0-9a-f]{3})?$/i.test(raw)) return `#${raw}`;
  return fallback;
};

/** Wall-clock text for the time widget, in the device's locale and zone. */
export const formatClock = (date: Date, options: { format24Hour: boolean; showSeconds: boolean }, locale?: string): string => {
  try {
    return date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', ...(options.showSeconds ? { second: '2-digit' } : {}), hour12: !options.format24Hour });
  } catch {
    return date.toISOString().slice(11, options.showSeconds ? 19 : 16);
  }
};

export const formatClockDate = (date: Date, locale?: string): string => {
  try {
    return date.toLocaleDateString(locale, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  } catch {
    return date.toISOString().slice(0, 10);
  }
};
