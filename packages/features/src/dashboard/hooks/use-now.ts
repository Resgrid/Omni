import { useEffect, useState } from 'react';

/**
 * The current time, re-read every `intervalMs` (wall boards tick: elapsed times, status timers and clocks move on their
 * own, without anything arriving from the server). `enabled = false` freezes it (nothing on screen depends on time).
 */
export function useNow(intervalMs: number, enabled: boolean = true): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return undefined;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), Math.max(250, intervalMs));
    return () => clearInterval(timer);
  }, [intervalMs, enabled]);
  return now;
}
