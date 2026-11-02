/**
 * Wall displays (BigBoard on a TV, `useFormFactor()` = wall) run for days and nobody taps "Restart". Once an update is
 * downloaded they restart on their own after the screen has been left alone this long — counted from the later of the
 * download and the last touch, so the "Update ready" notice is up for at least this long first.
 */
export const WALL_AUTO_RESTART_IDLE_MS = 5 * 60_000;
/** How often the wall rule is evaluated while an update waits. */
export const WALL_AUTO_RESTART_CHECK_INTERVAL_MS = 30_000;

export type WallAutoRestartDecision = 'restart' | 'wait-for-idle' | 'wait-for-foreground' | 'held';

export interface WallAutoRestartInput {
  now: number;
  /** When the update finished downloading (epoch ms). */
  readyAt: number;
  /** The last touch on the shell (epoch ms). */
  lastActivityAt: number;
  isActive: boolean;
  /** A restart guard's reason (a connected voice session), or null. */
  restartBlocker: string | null;
  idleMs?: number;
}

/** Pure wall rule: idle long enough, in the foreground, and no guard holding the restart. */
export function decideWallAutoRestart({ now, readyAt, lastActivityAt, isActive, restartBlocker, idleMs = WALL_AUTO_RESTART_IDLE_MS }: WallAutoRestartInput): WallAutoRestartDecision {
  if (now - Math.max(readyAt, lastActivityAt) < idleMs) return 'wait-for-idle';
  if (!isActive) return 'wait-for-foreground';
  if (restartBlocker) return 'held';
  return 'restart';
}
