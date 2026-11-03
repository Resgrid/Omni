import { parseApiUtcDate } from '@resgrid/core/utils/dates';

/**
 * Scheduled dispatch ("dispatch on") rules for the call form (Dispatch `call-schedule`): the API takes and sends it as a
 * UTC instant (`DispatchOnUtc` on save and edit, `DispatchedOnUtc` on the call) and the picker works in the same ISO form.
 */

/**
 * A scheduled dispatch must be at least this far ahead, the same rule as the web form. Anything sooner is a dispatch
 * now, which the dispatcher should do without a schedule.
 */
export const MIN_DISPATCH_LEAD_MINUTES = 15;

const MIN_DISPATCH_LEAD_MS = MIN_DISPATCH_LEAD_MINUTES * 60 * 1000;

/** The `DispatchOnUtc` wire value for a picked time, or undefined when none was picked (send nothing). */
export const toDispatchOnUtc = (value: string | null | undefined): string | undefined => parseApiUtcDate(value)?.toISOString();

/** True when a picked dispatch time is less than {@link MIN_DISPATCH_LEAD_MINUTES} away (or already past). */
export const isDispatchTimeTooSoon = (value: string | null | undefined, now: number = Date.now()): boolean => {
  const time = parseApiUtcDate(value);

  return !!time && time.getTime() < now + MIN_DISPATCH_LEAD_MS;
};

/**
 * What the edit form's dispatch time starts as: the call's stored dispatch time while it is still ahead (a scheduled
 * call), otherwise empty — a call that already went out has nothing to reschedule.
 */
export const getScheduledDispatchPrefill = (dispatchedOnUtc: string | null | undefined, now: number = Date.now()): string => {
  const time = parseApiUtcDate(dispatchedOnUtc);

  return time && time.getTime() > now ? time.toISOString() : '';
};
