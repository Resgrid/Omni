import { applyAppUpdate, getAppLifecycleState, getAppUpdateRestartBlocker, getLastUserActivityAt } from '@resgrid/core';
import { useEffect } from 'react';

import { decideWallAutoRestart, WALL_AUTO_RESTART_CHECK_INTERVAL_MS } from './wall-auto-restart';

/**
 * Runs the wall rule while `readyAt` is set (a downloaded update on a wall display). `applyAppUpdate` checks the restart
 * guards again, so a voice session that connects between the decision and the restart still holds it.
 */
export function useWallAutoRestart(readyAt: number | null): void {
  useEffect(() => {
    if (readyAt === null) {
      return undefined;
    }
    let attempting = false;
    const timer = setInterval(() => {
      if (attempting) return;
      const decision = decideWallAutoRestart({
        now: Date.now(),
        readyAt,
        lastActivityAt: getLastUserActivityAt(),
        isActive: getAppLifecycleState().isActive,
        restartBlocker: getAppUpdateRestartBlocker(),
      });
      if (decision !== 'restart') return;
      attempting = true;
      void applyAppUpdate('auto').then((result) => {
        if (result !== 'restarting') attempting = false;
      });
    }, WALL_AUTO_RESTART_CHECK_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [readyAt]);
}
