import { useEffect, useRef, useState } from 'react';

export interface SettledFlagOptions {
  /** How long `active` must stay true before it shows. */
  delayMs: number;
  /** Once shown, the least time it stays, so a state that ends just after the delay does not blink. */
  minVisibleMs?: number;
}

/**
 * `active` as the user should see it: true only once it has held for `delayMs`, so routine background work (a queued
 * write that sends a moment later, a connectivity blip, a quick refresh) never flashes on screen. Ending hides it at
 * once, or after `minVisibleMs` when it showed only briefly.
 */
export function useSettledFlag(active: boolean, { delayMs, minVisibleMs = 0 }: SettledFlagOptions): boolean {
  const [isVisible, setIsVisible] = useState(false);
  const shownAt = useRef(0);

  useEffect(() => {
    if (active === isVisible) {
      return;
    }

    const wait = active ? delayMs : minVisibleMs - (Date.now() - shownAt.current);

    const apply = (): void => {
      if (active) {
        shownAt.current = Date.now();
      }

      setIsVisible(active);
    };

    if (wait <= 0) {
      apply();

      return;
    }

    const timer = setTimeout(apply, wait);

    return () => clearTimeout(timer);
  }, [active, delayMs, isVisible, minVisibleMs]);

  // Without a minimum, ending hides it in the same render: the effect above would leave one stale frame painted.
  return isVisible && (active || minVisibleMs > 0);
}
