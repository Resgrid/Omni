import { type FetchOptions, useShiftsStore } from '@resgrid/data';

import { type DateRange, getMonthRange, parseWallClock, toDateParam } from './shift-time';

/** The views of the Shifts screen (Responder segments). Approvals show only for supervisors. */
export type ShiftView = 'today' | 'mine' | 'signup' | 'calendar' | 'trades' | 'approvals' | 'onduty';

export const SHIFT_VIEWS: readonly ShiftView[] = ['today', 'mine', 'signup', 'calendar', 'trades', 'onduty', 'approvals'];

const todayRange = (now: Date = new Date()): DateRange => {
  const today = toDateParam(now);
  return { start: today, end: today };
};

/** One calendar month (optionally one shift): shift days plus, unfiltered, the static shift days in it. */
export async function loadShiftCalendar(range: DateRange, shiftId: string | null, options?: FetchOptions): Promise<void> {
  const store = useShiftsStore.getState();
  // A shift filter shows that shift alone; static shifts are not shifts, so they drop out.
  await Promise.all([store.fetchShiftDaysForDateRange(range.start, range.end, shiftId, options), shiftId ? Promise.resolve() : store.fetchWorkshiftDays('calendar', range, options)]);
}

/** The calendar month and shift filter the screen shows (view state, kept by the screen). */
export interface ShiftCalendarSelection {
  range: DateRange;
  shiftId: string | null;
}

/** The calendar's place in the Shifts route: `/shifts?view=calendar&month=2026-12&date=2026-12-14`. */
export interface ShiftCalendarRouteParams {
  /** `YYYY-MM` */
  month?: string;
  /** `YYYY-MM-DD`, the picked day. */
  date?: string;
}

/** Where the calendar opens and which day is picked. */
export interface ShiftCalendarStart {
  calendar: ShiftCalendarSelection;
  selectedDate: string | null;
}

const MONTH_PARAM = /^(\d{4})-(\d{2})$/;

/** `YYYY-MM` of a date (the `month` route param). */
export const toMonthParam = (date: Date): string => toDateParam(date).slice(0, 7);

const parseMonthParam = (value: string | undefined): Date | null => {
  const match = value ? MONTH_PARAM.exec(value) : null;
  const month = match ? Number(match[2]) : 0;

  return match && month >= 1 && month <= 12 ? new Date(Number(match[1]), month - 1, 1) : null;
};

/** A real `YYYY-MM-DD` day (2030-02-31 is not one), or null. */
const parseDayParam = (value: string | undefined): string | null => {
  const parsed = value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? parseWallClock(value) : null;

  return parsed && toDateParam(parsed) === value ? value : null;
};

/**
 * Where the calendar opens: the month and day in the route (the screen rebuilt after a reload or a history step), else
 * the last loaded month (kept in the store), else this month. The shift filter is the last loaded one. The picked day is
 * the route's when it lies in that month, else today when today does, else none.
 */
export function resolveShiftCalendarStart(params: ShiftCalendarRouteParams, last: { start: string; end: string; shiftId: string | null } | null, now: Date = new Date()): ShiftCalendarStart {
  const date = parseDayParam(params.date);
  const month = parseMonthParam(params.month) ?? (date ? parseWallClock(date) : null);
  const range = month ? getMonthRange(month) : last ? { start: last.start, end: last.end } : getMonthRange(now);
  const inRange = (day: string): boolean => day >= range.start && day <= range.end;
  const today = toDateParam(now);
  const selectedDate = date && inRange(date) ? date : inRange(today) ? today : null;

  return { calendar: { range, shiftId: last?.shiftId ?? null }, selectedDate };
}

/**
 * Loads what a view shows. Data loads on focus and on pull-to-refresh, not at app start (Responder). The calendar loads
 * the given selection, else the last loaded month, else the current one.
 */
export async function loadShiftView(view: ShiftView, options?: FetchOptions, calendar?: ShiftCalendarSelection): Promise<void> {
  const store = useShiftsStore.getState();
  switch (view) {
    case 'today':
      await Promise.all([store.fetchTodaysShifts(options), store.fetchWorkshiftDays('today', todayRange(), options)]);
      return;
    case 'mine':
      // Standing shifts head the list; the server's default window (today to 30 days out) is what My Shifts shows.
      await Promise.all([store.fetchMyShifts(undefined, options), store.fetchWorkshiftDays('mine', { mine: true }, options), store.shifts.length === 0 ? store.fetchAllShifts(options) : Promise.resolve()]);
      return;
    case 'signup':
      await store.fetchSignupDays(options);
      return;
    case 'calendar': {
      const range = calendar?.range ?? store.calendarRange ?? getMonthRange(new Date());
      const shiftId = calendar ? calendar.shiftId : (store.calendarRange?.shiftId ?? null);
      await Promise.all([loadShiftCalendar({ start: range.start, end: range.end }, shiftId, options), store.shifts.length === 0 ? store.fetchAllShifts(options) : Promise.resolve()]);
      return;
    }
    case 'trades':
      // My upcoming sign-ups are what an accepted trade can offer back.
      await Promise.all([store.fetchShiftTrades(options), store.fetchOpenTrades(options), store.fetchMyShifts(undefined, options)]);
      return;
    case 'approvals':
      await store.fetchPendingApprovals(options);
      return;
    case 'onduty':
      await store.fetchOnDutyPersonnel(options);
      return;
  }
}

export interface ShiftChangeTarget {
  shiftDayId?: string;
  workshift?: boolean;
  tradeId?: string;
}

/**
 * After a successful mutation the store refetches the shift-day lists it touched; this refreshes what it does not
 * know about: the open day or trade, the sign-up list, the static shift lists and the approvals badge.
 */
export async function refreshAfterShiftChange(target: ShiftChangeTarget = {}): Promise<void> {
  const store = useShiftsStore.getState();
  const loaded = (slice: string): boolean => (store.fetchedAt as Record<string, number | undefined>)[slice] !== undefined;
  const tasks: Promise<unknown>[] = [store.fetchPendingApprovals()];
  if (target.shiftDayId) tasks.push(store.fetchShiftDay(target.shiftDayId, { workshift: target.workshift === true }));
  if (target.tradeId) tasks.push(store.fetchTradeDetail(target.tradeId));
  if (loaded('signup')) tasks.push(store.fetchSignupDays());
  if (loaded('workshiftsToday')) tasks.push(store.fetchWorkshiftDays('today', todayRange()));
  if (loaded('workshiftsMine')) tasks.push(store.fetchWorkshiftDays('mine', { mine: true }));
  if (loaded('workshiftsCalendar') && store.calendarRange && !store.calendarRange.shiftId) tasks.push(store.fetchWorkshiftDays('calendar', store.calendarRange));
  await Promise.all(tasks);
}
