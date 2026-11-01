import { type CurrentSessionData, endShift, getCurrentSession, lockSession } from '../api/shared-session';
import { toMfaProblem } from '../errors/mfa-errors';
import { getAuthApiContext } from '../runtime/api-context';
import { authLogger } from '../runtime/logger';
import { authCapabilities } from '../runtime/variant';
import { refreshEngine, useAuthStore } from '../session/auth-store';
import { applySharedSessionStatus, markSharedSessionLocked, resetSharedSession, sharedLockGeneration, useSharedSessionStore } from './shared-session-store';

// ---------------------------------------------------------------------------------------------------------------------
// Following a shared-device session (passkey plan section 10.5; Unit's controller, which re-checks after an unlock), with
// Core Web's shared workstation timings: real operator input is reported at most every 30 seconds, the status is polled
// every minute (never as activity), a warning shows a minute before the idle lock and ten minutes before the shift ends.
// The server enforces every one of these; this module only keeps the screen honest. `capabilities.auth.sharedDevice`.
// ---------------------------------------------------------------------------------------------------------------------

export const ACTIVITY_INTERVAL_MS = 30_000;
export const POLL_INTERVAL_MS = 60_000;
export const IDLE_WARNING_SECONDS = 60;
export const SHIFT_NOTICE_SECONDS = 600;

/** The realtime hubs (`@resgrid/realtime`, same layer) register how to stop and resume them; a locked session receives no traffic. */
export interface RealtimeControls {
  stop: () => Promise<unknown>;
  resume: () => Promise<unknown>;
}

let realtime: RealtimeControls | null = null;
let lastActivityReport = 0;
let inFlight: Promise<CurrentSessionData | null> | null = null;

export function registerSharedSessionRealtimeControls(controls: RealtimeControls | null): void {
  realtime = controls;
}

export const sharedSessionsEnabled = (): boolean => {
  try {
    return authCapabilities().sharedDevice;
  } catch {
    return false;
  }
};

const signedIn = (): boolean => useAuthStore.getState().status === 'signedIn';

/**
 * Asks the server how this session stands. A locked or expired session answers with the 401 the HTTP client already turns
 * into the lock screen or a sign-out; anything else unreachable leaves the last known state, which the server enforces.
 */
export const checkSharedSession = (activity = false): Promise<CurrentSessionData | null> => {
  if (!sharedSessionsEnabled() || !signedIn()) {
    return Promise.resolve(null);
  }
  if (inFlight && !activity) {
    return inFlight;
  }
  const generation = sharedLockGeneration();
  const run = getCurrentSession(getAuthApiContext(), activity)
    .then((current) => {
      // Only an unlock ends a lock: an answer that left before a newer lock, or that says "unlocked" while this screen is
      // locked (a restart, or an offline lock the server has not confirmed yet), is not applied.
      const stale = sharedLockGeneration() !== generation || (useSharedSessionStore.getState().locked && !current.Locked);
      if (!stale) {
        applySharedSessionStatus(current);
      }
      return current;
    })
    .catch(() => null)
    .finally(() => {
      if (inFlight === run) {
        inFlight = null;
      }
    });
  inFlight = run;
  return run;
};

/** Real input from the operator (touch, key, pointer): reported at most once per interval; "Stay signed in" forces it. */
export const reportOperatorActivity = (force = false, now: number = Date.now()): void => {
  const state = useSharedSessionStore.getState();
  if (!state.shared || state.locked || !signedIn()) {
    return;
  }
  if (!force && now - lastActivityReport < ACTIVITY_INTERVAL_MS) {
    return;
  }
  lastActivityReport = now;
  void checkSharedSession(true);
};

const stopRealtime = async (): Promise<void> => {
  try {
    await realtime?.stop();
  } catch {
    // The hubs are best-effort here; the server refuses a locked session's traffic anyway.
  }
};

const resumeRealtime = async (): Promise<void> => {
  try {
    await realtime?.resume();
  } catch {
    // Reconnect logic in the hubs retries on its own.
  }
};

/**
 * Locks this shared session now: the Lock button, the app going to the background, or a restart. The screen locks even
 * when the server cannot be reached; the lock screen asks the server again (locking is idempotent there) before any
 * unlock, so a lock that did not reach it can never be skipped.
 */
export const lockSharedSession = async (reason: 'explicit' | 'background' | 'restart'): Promise<void> => {
  if (!sharedSessionsEnabled() || !signedIn()) {
    return;
  }
  const alreadyLocked = useSharedSessionStore.getState().locked;
  markSharedSessionLocked(null);
  void stopRealtime();
  if (alreadyLocked) {
    return;
  }
  try {
    const locked = await lockSession(getAuthApiContext());
    markSharedSessionLocked(locked.LockVersion);
    authLogger.info({ message: 'Shared session locked', context: { reason } });
  } catch (error) {
    const code = toMfaProblem(error).code;
    if (code === 'not_shared_session') {
      // A personal session has nothing to lock: the server is the authority on which sessions are shared.
      resetSharedSession();
      return;
    }
    authLogger.warn({ message: 'Shared session lock did not reach the server; the lock screen will lock it', context: { reason, errorType: code } });
  }
};

/**
 * Ends this operator's shift (or hands the device to the next operator), then drops the tokens, caches and sockets through
 * the ordinary sign-out. A shift end that cannot reach the server still signs out here; the server ends the session at its
 * shift ceiling regardless.
 */
export const endSharedShift = async (switchOperator: boolean): Promise<void> => {
  try {
    await endShift(getAuthApiContext(), switchOperator);
  } catch (error) {
    authLogger.warn({ message: 'End shift did not reach the server; signing out locally', context: { errorType: toMfaProblem(error).code } });
  }
  resetSharedSession();
  await useAuthStore.getState().logout();
};

/**
 * After an unlock: the same session resumes, so the refresh that waited for it runs now (it was left unscheduled while
 * locked) and the hubs reconnect — unless that refresh signed the operator out or the session locked again meanwhile
 * (Unit's re-check; IC resumed regardless).
 */
export const afterSharedUnlock = async (now: number = Date.now()): Promise<void> => {
  lastActivityReport = now;
  if (!refreshEngine.isScheduled()) {
    await refreshEngine.refresh();
  }
  if (!signedIn() || useSharedSessionStore.getState().locked) {
    return;
  }
  void resumeRealtime();
};

/** Test hook. */
export const resetSharedSessionControllerForTests = (): void => {
  lastActivityReport = 0;
  inFlight = null;
  realtime = null;
};
