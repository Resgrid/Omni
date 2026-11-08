import { useShiftsStore } from '@resgrid/data';
import type { ShiftDayResultData } from '@resgrid/models';

import { isWorkshiftDay } from '../lib/shift-time';

/**
 * The light copy of a shift day from a list already in the store (Today, My Shifts, Sign up, the calendar month), so
 * the day screen shows it at once while the full day (roster, needs) loads. Null when no list holds it (a deep link).
 */
export function useListedShiftDay(shiftDayId: string, workshift: boolean): ShiftDayResultData | null {
  return useShiftsStore((state) => {
    if (!shiftDayId) return null;

    const lists = workshift ? [state.workshiftDays.today, state.workshiftDays.mine, state.workshiftDays.calendar] : [state.todaysShiftDays, state.myShiftDays, state.calendarDays, state.signupDays];

    for (const list of lists) {
      const match = list.find((day) => day.ShiftDayId === shiftDayId && isWorkshiftDay(day) === workshift);

      if (match) return match;
    }

    return null;
  });
}
