import { getAppLifecycleState, startAppLifecycle, subscribeAppLifecycle } from '../lifecycle/app-lifecycle';
import { logger } from '../logging/logger';
import { isWeb } from '../platform/platform';
import type { AppUpdateApplyResult, AppUpdateApplyTrigger, AppUpdateCheckTrigger, AppUpdateRestartGuard, AppUpdatesState, CurrentAppUpdate, PendingAppUpdate, UpdatesModule } from './types';

/**
 * In-app OTA updates (omni-plan D18). The build side publishes to the `production`, `staging` and `internal` channels;
 * this service checks, downloads and applies those updates while the app runs, so MDT tablets and wall displays that
 * stay open for days still pick them up.
 *
 * - **Check:** `checkForUpdateAsync`, then `fetchUpdateAsync` when the server has a newer update (or a roll-back).
 *   Single-flight: callers that arrive while a check runs share it.
 * - **Apply:** a downloaded update applies on the next cold start (expo's default); `applyAppUpdate` restarts now with
 *   `reloadAsync`. Restart guards (the app shell registers one for connected voice sessions) hold only automatic restarts:
 *   a person who taps restart has decided, voice session or not.
 * - **No-op** without an injected module (web, Electron, development builds) or when `isEnabled` is false (Expo Go,
 *   builds without an update URL).
 * - **Never throws** into callers. Logs codes and ids only — no messages from the update server, no personal data.
 *
 * Sentry already tags every event with the update id, channel and runtime version and reports emergency launches as
 * warning events (`@sentry/react-native`'s default ExpoContext integration); this service adds a warning log line,
 * which the logger forwards to Sentry as a breadcrumb.
 */

/** Foreground checks run at most this often (any check counts: a bootstrap check also resets the window). */
export const APP_UPDATE_FOREGROUND_INTERVAL_MS = 30 * 60_000;

const DISABLED_STATE: AppUpdatesState = { enabled: false, status: 'idle', lastCheckAt: null, current: null, pending: null, errorCode: null };

let updates: UpdatesModule | null = null;
let state: AppUpdatesState = DISABLED_STATE;
const listeners = new Set<() => void>();
const guards = new Map<string, AppUpdateRestartGuard>();
let inFlight: Promise<AppUpdatesState> | null = null;
let restarting = false;
let launchReported = false;
let stopForeground: (() => void) | null = null;

const setState = (patch: Partial<AppUpdatesState>): void => {
  state = { ...state, ...patch };
  for (const listener of [...listeners]) {
    try {
      listener();
    } catch {
      // A listener must never break the service.
    }
  }
};

/** An error's code (expo's CodedError) or name — never its message, which can carry server text. */
const errorCode = (error: unknown): string => {
  if (error && typeof error === 'object') {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string' && code) return code;
    const name = (error as { name?: unknown }).name;
    if (typeof name === 'string' && name) return name;
  }
  return 'unknown';
};

const isModuleEnabled = (module: UpdatesModule | null): module is UpdatesModule => {
  // Web and Electron: expo-updates' web stub reports isEnabled, but redeploys and the Electron updater cover them.
  if (!module || isWeb()) return false;
  try {
    return module.isEnabled === true;
  } catch {
    return false;
  }
};

const readCurrent = (module: UpdatesModule): CurrentAppUpdate | null => {
  try {
    const createdAt = module.createdAt instanceof Date && !Number.isNaN(module.createdAt.getTime()) ? module.createdAt : null;
    return {
      updateId: module.updateId ?? null,
      channel: module.channel ?? null,
      runtimeVersion: module.runtimeVersion ?? null,
      createdAt,
      isEmbeddedLaunch: module.isEmbeddedLaunch === true,
      isEmergencyLaunch: module.isEmergencyLaunch === true,
      emergencyLaunchReason: module.emergencyLaunchReason ?? null,
    };
  } catch {
    return null;
  }
};

export interface AppUpdatesOptions {
  /** The `expo-updates` module on iOS/Android; null (or omitted) on web, Electron and in development. */
  module?: UpdatesModule | null;
}

/**
 * Hands the service its module (apps/omni, before the shell starts). Reads the running update; logs nothing (Sentry is
 * not up yet — `startAppUpdates` reports the launch). Calling it again replaces the module and resets the state.
 */
export function configureAppUpdates(options: AppUpdatesOptions): void {
  const module = options.module ?? null;
  updates = isModuleEnabled(module) ? module : null;
  inFlight = null;
  restarting = false;
  launchReported = false;
  state = updates ? { ...DISABLED_STATE, enabled: true, current: readCurrent(updates) } : DISABLED_STATE;
  setState({});
}

export function getAppUpdatesState(): AppUpdatesState {
  return state;
}

/** Subscribes to state changes. Returns the unsubscribe function. */
export function subscribeAppUpdates(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Checks for an update and downloads it when there is one. Resolves with the new state; never rejects. A no-op (the
 * current state) where updates are disabled. While a check runs, every caller gets that check's promise.
 */
export function checkForAppUpdate(trigger: AppUpdateCheckTrigger = 'manual'): Promise<AppUpdatesState> {
  const module = updates;
  if (!module || !state.enabled) {
    return Promise.resolve(state);
  }
  if (inFlight) {
    return inFlight;
  }
  const run = runCheck(module, trigger).finally(() => {
    if (inFlight === run) inFlight = null;
  });
  inFlight = run;
  return run;
}

async function runCheck(module: UpdatesModule, trigger: AppUpdateCheckTrigger): Promise<AppUpdatesState> {
  // A downloaded update stays ready until the app restarts, whatever later checks find.
  const settled = (): AppUpdatesState['status'] => (state.pending ? 'ready' : 'idle');
  setState({ status: 'checking', lastCheckAt: Date.now(), errorCode: null });
  try {
    const check = await module.checkForUpdateAsync();
    if (updates !== module) return state;
    if (!check.isAvailable && !check.isRollBackToEmbedded) {
      setState({ status: settled() });
      logger.info({ message: 'App update check: up to date', context: { trigger } });
      return state;
    }
    setState({ status: 'downloading' });
    const fetched = await module.fetchUpdateAsync();
    if (updates !== module) return state;
    if (fetched.isNew || fetched.isRollBackToEmbedded) {
      const pending: PendingAppUpdate = { updateId: fetched.manifest?.id ?? check.manifest?.id ?? null, isRollBackToEmbedded: fetched.isRollBackToEmbedded === true, downloadedAt: Date.now() };
      setState({ status: 'ready', pending });
      logger.info({ message: 'App update downloaded', context: { trigger, updateId: pending.updateId, rollBack: pending.isRollBackToEmbedded } });
    } else {
      setState({ status: settled() });
      logger.info({ message: 'App update check: nothing new to download', context: { trigger } });
    }
  } catch (error) {
    if (updates !== module) return state;
    const code = errorCode(error);
    setState({ status: state.pending ? 'ready' : 'error', errorCode: code });
    logger.warn({ message: 'App update check failed', context: { trigger, code } });
  }
  return state;
}

/** Registers a restart guard (id replaces an earlier one). Returns the remover. */
export function registerAppUpdateRestartGuard(id: string, guard: AppUpdateRestartGuard): () => void {
  guards.set(id, guard);
  return () => {
    if (guards.get(id) === guard) guards.delete(id);
  };
}

/** The first guard's reason to hold a restart, or null. A guard that throws holds it (never restart on doubt). */
export function getAppUpdateRestartBlocker(): string | null {
  for (const [id, guard] of guards) {
    try {
      const reason = guard();
      if (reason) return reason;
    } catch {
      return id;
    }
  }
  return null;
}

/** Restarts into the downloaded update now (`reloadAsync`); an automatic restart waits while a guard objects. Never rejects. */
export async function applyAppUpdate(trigger: AppUpdateApplyTrigger = 'user'): Promise<AppUpdateApplyResult> {
  const module = updates;
  if (!module || !state.enabled) return 'disabled';
  if (!state.pending) return 'nothing-pending';
  if (restarting) return 'restarting';
  const blocker = trigger === 'auto' ? getAppUpdateRestartBlocker() : null;
  if (blocker) {
    logger.info({ message: 'App update restart held', context: { trigger, reason: blocker } });
    return 'blocked';
  }
  restarting = true;
  try {
    logger.info({ message: 'Restarting to apply the app update', context: { trigger, updateId: state.pending.updateId } });
    await module.reloadAsync();
    return 'restarting';
  } catch (error) {
    restarting = false;
    logger.warn({ message: 'App update restart failed; it applies on the next start', context: { trigger, code: errorCode(error) } });
    return 'failed';
  }
}

/** Pure foreground-throttle rule: check when never checked, or when the last check is at least `intervalMs` old. */
export function isForegroundCheckDue(lastCheckAt: number | null, now: number, intervalMs: number = APP_UPDATE_FOREGROUND_INTERVAL_MS): boolean {
  return lastCheckAt === null || now - lastCheckAt >= intervalMs;
}

/**
 * Checks when the app comes back to the foreground, at most every 30 minutes, through the shared lifecycle helper.
 * Idempotent; returns the stop function.
 */
export function startAppUpdateForegroundChecks(intervalMs: number = APP_UPDATE_FOREGROUND_INTERVAL_MS): () => void {
  if (stopForeground) {
    return stopForeground;
  }
  startAppLifecycle();
  let wasActive = getAppLifecycleState().isActive;
  const unsubscribe = subscribeAppLifecycle(() => {
    const isActive = getAppLifecycleState().isActive;
    if (isActive && !wasActive && state.enabled && isForegroundCheckDue(state.lastCheckAt, Date.now(), intervalMs)) {
      void checkForAppUpdate('foreground');
    }
    wasActive = isActive;
  });
  const stop = (): void => {
    unsubscribe();
    if (stopForeground === stop) stopForeground = null;
  };
  stopForeground = stop;
  return stop;
}

/**
 * Startup (after Sentry): reports how this launch started — a warning for an emergency launch — and starts the
 * foreground checks. Once per launch; a no-op where updates are disabled.
 */
export function startAppUpdates(): void {
  if (!updates || !state.enabled) {
    return;
  }
  if (!launchReported) {
    launchReported = true;
    const current = state.current;
    if (current?.isEmergencyLaunch) {
      logger.warn({
        message: 'Emergency launch: a downloaded app update failed to start, so the embedded build is running',
        context: { reason: current.emergencyLaunchReason, updateId: current.updateId, channel: current.channel, runtimeVersion: current.runtimeVersion },
      });
    } else {
      logger.info({ message: 'App update launch', context: { updateId: current?.updateId ?? null, channel: current?.channel ?? null, embedded: current?.isEmbeddedLaunch ?? null } });
    }
  }
  startAppUpdateForegroundChecks();
}

/** Test helper: no module, no guards, no listeners. Not for app code. */
export function resetAppUpdatesForTests(): void {
  stopForeground?.();
  stopForeground = null;
  updates = null;
  state = DISABLED_STATE;
  inFlight = null;
  restarting = false;
  launchReported = false;
  guards.clear();
  listeners.clear();
}
