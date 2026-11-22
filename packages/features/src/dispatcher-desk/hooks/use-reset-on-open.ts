import { useEffect, useRef } from 'react';

/**
 * Runs `reset` when a sheet opens (closed → open) and not again while it stays open. The board behind an open sheet is
 * read again on every heartbeat and desk ping, which hands the sheet new `me` / item objects: resetting on those would
 * undo what the member just picked.
 */
export function useResetOnOpen(isOpen: boolean, reset: () => void): void {
  const wasOpen = useRef(false);
  const latestReset = useRef(reset);

  useEffect(() => {
    latestReset.current = reset;
  });

  useEffect(() => {
    if (isOpen && !wasOpen.current) latestReset.current();
    wasOpen.current = isOpen;
  }, [isOpen]);
}
