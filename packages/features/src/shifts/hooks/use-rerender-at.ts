import { useDepartmentTimeZone } from '@resgrid/features/department-config';
import { useEffect, useReducer } from 'react';

import { wallClockToUtcMs } from '../lib/shift-time';

/** setTimeout's ceiling (about 24.8 days): a later moment is reached in steps of at most this. */
const MAX_TIMER_MS = 2_147_483_647;

/** A moment past the target, so the re-render never lands a tick early. */
const MARGIN_MS = 1_000;

/**
 * Renders the caller again just after `atMs` (epoch ms), so what it decides from the clock (a shift that has ended)
 * changes on screen without a reload. Nothing is scheduled for null or for a moment already behind the margin, so a
 * moment that has passed never re-renders again.
 */
export function useRerenderAt(atMs: number | null): void {
  const [step, rerender] = useReducer((count: number) => count + 1, 0);

  useEffect(() => {
    if (atMs === null) return undefined;

    const wait = atMs - Date.now() + MARGIN_MS;

    if (wait <= 0) return undefined;

    // A step short of the target (beyond the ceiling) re-renders, and this runs again for the rest.
    const timer = setTimeout(rerender, Math.min(wait, MAX_TIMER_MS));

    return () => clearTimeout(timer);
  }, [atMs, step]);
}

/** Renders the caller again when a trade's or pending sign-up's shift ends (its wall-clock `End`, department time). */
export function useRerenderAtShiftEnd(end: string | null | undefined): void {
  const timeZone = useDepartmentTimeZone();

  useRerenderAt(wallClockToUtcMs(end, timeZone));
}
