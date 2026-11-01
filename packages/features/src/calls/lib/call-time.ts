import { parseUtcMs } from '@resgrid/core/utils/dates';
import type { CallResultData } from '@resgrid/models';

/** Core CallStates (resgrid-domain). Pending (8) is saved but not dispatched and never counts as active. */
export const CallState = {
  Active: 0,
  Closed: 1,
  Cancelled: 2,
  Unfounded: 3,
  Founded: 4,
  Minor: 5,
  Transferred: 6,
  FalseAlarm: 7,
  Pending: 8,
} as const;

export type TimeAgoUnit = 'just_now' | 'minutes' | 'hours' | 'days';

export interface TimeAgo {
  unit: TimeAgoUnit;
  count: number;
}

/** Elapsed time since a UTC wire value (shared parser: some `*Utc` fields arrive without "Z"); null when unparseable. */
export function timeAgo(utc: string | null | undefined, now: number): TimeAgo | null {
  const at = parseUtcMs(utc);
  if (at === null) return null;
  const minutes = Math.max(0, Math.floor((now - at) / 60000));
  if (minutes < 1) return { unit: 'just_now', count: 0 };
  if (minutes < 60) return { unit: 'minutes', count: minutes };
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return { unit: 'hours', count: hours };
  return { unit: 'days', count: Math.floor(hours / 24) };
}

export const TIME_AGO_KEYS: Record<TimeAgoUnit, string> = {
  just_now: 'calls.time.just_now',
  minutes: 'calls.time.minutes_ago',
  hours: 'calls.time.hours_ago',
  days: 'calls.time.days_ago',
};

/** A scheduled call is Active with a dispatch time still in the future. */
export function isScheduledCall(call: Pick<CallResultData, 'State' | 'DispatchedOnUtc' | 'ScheduledOnUtc'>, now: number): boolean {
  if (call.State !== CallState.Active) return false;
  const dispatchAt = parseUtcMs(call.DispatchedOnUtc) ?? parseUtcMs(call.ScheduledOnUtc);
  return dispatchAt !== null && dispatchAt > now;
}

export const isPendingCall = (call: Pick<CallResultData, 'State'>): boolean => call.State === CallState.Pending;
