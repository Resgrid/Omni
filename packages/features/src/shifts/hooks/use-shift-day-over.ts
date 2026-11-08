import type { ShiftDayResultData } from '@resgrid/models';
import { useEffect, useReducer } from 'react';

import { getShiftDayEndMs, isShiftDayOver } from '../lib/shift-rules';

/** setTimeout's ceiling (about 24.8 days); a day ending later than that is checked again on a later render. */
const MAX_TIMER_MS = 2_147_483_647;

/** A moment past the end, so the re-check never lands a tick early. */
const END_MARGIN_MS = 1_000;

/**
 * Whether the day is over, checked again when it ends: a day left open on screen past its end drops its sign-up, trade
 * and roster actions without a reload.
 */
export function useShiftDayOver(day: Pick<ShiftDayResultData, 'End' | 'EndUtc' | 'IsActive'> | null | undefined): boolean {
  const [, recheck] = useReducer((count: number) => count + 1, 0);
  const isOver = day ? isShiftDayOver(day) : false;
  const endMs = day ? getShiftDayEndMs(day) : null;

  useEffect(() => {
    if (isOver || endMs === null) return undefined;

    const wait = endMs - Date.now();

    if (wait > MAX_TIMER_MS) return undefined;

    const timer = setTimeout(recheck, Math.max(0, wait) + END_MARGIN_MS);

    return () => clearTimeout(timer);
  }, [isOver, endMs]);

  return isOver;
}
