import { useDepartmentTimeZone } from '@resgrid/features/department-config';
import type { ShiftDayResultData } from '@resgrid/models';

import { getShiftDayOverAtMs } from '../lib/shift-rules';
import { useRerenderAt } from './use-rerender-at';

/**
 * Whether the day is over, checked again when it ends: a day left open on screen past its end drops its sign-up, trade
 * and roster actions without a reload.
 */
export function useShiftDayOver(day: Pick<ShiftDayResultData, 'End' | 'EndUtc' | 'IsActive'> | null | undefined): boolean {
  const timeZone = useDepartmentTimeZone();
  const overAt = day ? getShiftDayOverAtMs(day, timeZone) : null;

  useRerenderAt(overAt);

  return overAt !== null && overAt <= Date.now();
}
