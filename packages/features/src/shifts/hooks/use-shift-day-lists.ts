import { useShiftsStore } from '@resgrid/data';
import type { ShiftDayResultData } from '@resgrid/models';
import { useMemo } from 'react';

import { mergeShiftDays } from '../lib/shift-time';

export interface ShiftDayLists {
  today: ShiftDayResultData[];
  mine: ShiftDayResultData[];
  calendar: ShiftDayResultData[];
}

/** Today, My Shifts and the calendar month with the static shift (workshift) days of the same list merged in, in start order. */
export function useShiftDayLists(): ShiftDayLists {
  const todaysShiftDays = useShiftsStore((state) => state.todaysShiftDays);
  const myShiftDays = useShiftsStore((state) => state.myShiftDays);
  const calendarDays = useShiftsStore((state) => state.calendarDays);
  const calendarShiftId = useShiftsStore((state) => state.calendarRange?.shiftId ?? null);
  const workshiftDays = useShiftsStore((state) => state.workshiftDays);

  return useMemo(
    () => ({
      today: mergeShiftDays(todaysShiftDays, workshiftDays.today),
      mine: mergeShiftDays(myShiftDays, workshiftDays.mine),
      calendar: mergeShiftDays(calendarDays, calendarShiftId ? [] : workshiftDays.calendar),
    }),
    [todaysShiftDays, myShiftDays, calendarDays, calendarShiftId, workshiftDays]
  );
}
