import { formatUtcInDepartmentTime } from '@resgrid/core/utils/dates';

type Translate = (key: string, options?: Record<string, unknown>) => string;

/** Metres as "850 m" / "12.4 km" (SI symbols, not translated). Empty for a missing or non-positive value. */
export const formatDistance = (meters: number | null | undefined): string => {
  if (meters === null || meters === undefined || !Number.isFinite(meters) || meters <= 0) return '';
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`;
};

/** Seconds as "1 h 05 min" / "12 min" through translations. Empty for a missing or non-positive value. */
export const formatDuration = (seconds: number | null | undefined, t: Translate): string => {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds <= 0) return '';
  const totalMinutes = Math.max(1, Math.round(seconds / 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? t('unit_routes.duration_hours_minutes', { hours, minutes: String(minutes).padStart(2, '0') }) : t('unit_routes.duration_minutes', { minutes });
};

/** A route time (UTC on the wire) for display; empty when missing or unparseable. */
export const formatRouteTime = (utc: string | null | undefined): string => (utc ? formatUtcInDepartmentTime(utc, null) : '');

/** Arrival clock time `seconds` from `now` (device clock), for "ETA 14:32". */
export const formatArrivalTime = (seconds: number | null | undefined, now: number = Date.now()): string => {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds <= 0) return '';
  try {
    return new Date(now + seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
};
