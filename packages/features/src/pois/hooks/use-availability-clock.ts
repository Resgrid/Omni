import type { PoiResultData } from '@resgrid/models';
import { useEffect, useMemo, useState } from 'react';

import { nextAvailabilityLapse } from '../lib/poi-availability';

/** The longest one wait runs before the clock is read again (a timer cannot wait much longer than 24 days). */
const MAX_WAIT_MS = 60 * 60 * 1000;

/** A little past the lapse, so the clock read then is past it. */
const LAPSE_MARGIN_MS = 50;

/**
 * The time a screen of destinations judges availability at: read when the list arrives, and again when the next report
 * among them lapses. A lapsed report then reads as Open without a reload, and every row, count and filter judged with this
 * one clock agrees.
 */
export function useAvailabilityClock(pois: readonly PoiResultData[]): number {
  const [tick, setTick] = useState(0);
  // Read again for a new list or a lapse: the list and the tick are what move it on, not values the read uses.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const now = useMemo(() => Date.now(), [pois, tick]);

  useEffect(() => {
    const lapse = nextAvailabilityLapse(pois, now);

    if (lapse === null) return undefined;
    const timer = setTimeout(() => setTick((value) => value + 1), Math.min(Math.max(lapse - Date.now(), 0) + LAPSE_MARGIN_MS, MAX_WAIT_MS));

    return () => clearTimeout(timer);
  }, [now, pois]);

  return now;
}
