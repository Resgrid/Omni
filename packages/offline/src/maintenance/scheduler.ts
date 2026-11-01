import type { DurableKv } from '../kv/durable-kv';
import { type Clock, systemClock } from '../util/ids';
import type { MaintenanceReason, MaintenanceResult } from './run-maintenance';

export const LAST_MAINTENANCE_AT_KEY = 'resgrid.offline.maintenance.lastRunAt';

export interface MaintenanceSchedulerOptions {
  run: (reason: MaintenanceReason) => Promise<MaintenanceResult>;
  /** Where the last run time is remembered across launches. */
  kv?: DurableKv | null;
  now?: Clock;
  /** Foreground runs only when the last run is older than this (plan: 24 h). */
  minIntervalMs?: number;
  /** Delay after first render before the startup run. */
  startupDelayMs?: number;
  /** e.g. `InteractionManager.runAfterInteractions` — waits for animations before the startup run. */
  defer?: (task: () => void) => void;
  timers?: { setTimeout: (fn: () => void, ms: number) => unknown; clearTimeout: (handle: unknown) => void };
}

export interface MaintenanceScheduler {
  /** Call once from the root layout after the first render. */
  afterFirstRender(): void;
  /** Call when the app returns to the foreground. Runs only if the last run is older than the interval. */
  onForeground(): Promise<MaintenanceResult | null>;
  /** Call after each successful sync. */
  afterSync(): Promise<MaintenanceResult | null>;
  runNow(reason?: MaintenanceReason): Promise<MaintenanceResult>;
  getLastRunAt(): number | null;
  dispose(): void;
}

/** Scheduling helpers for the maintenance job (plan §8.2a); single-flight across all triggers. */
export function createMaintenanceScheduler(options: MaintenanceSchedulerOptions): MaintenanceScheduler {
  const now = options.now ?? systemClock;
  const minIntervalMs = options.minIntervalMs ?? 24 * 60 * 60 * 1000;
  const timers = options.timers ?? { setTimeout: (fn: () => void, ms: number): unknown => setTimeout(fn, ms), clearTimeout: (handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>) };
  let inFlight: Promise<MaintenanceResult> | null = null;
  let startupScheduled = false;
  let startupTimer: unknown = null;
  let memoryLastRunAt: number | null = null;

  const getLastRunAt = (): number | null => options.kv?.getNumber(LAST_MAINTENANCE_AT_KEY) ?? memoryLastRunAt;

  const runNow = (reason: MaintenanceReason = 'manual'): Promise<MaintenanceResult> => {
    inFlight ??= options
      .run(reason)
      .then((result) => {
        memoryLastRunAt = result.finishedAt;
        options.kv?.set(LAST_MAINTENANCE_AT_KEY, result.finishedAt);
        return result;
      })
      .finally(() => {
        inFlight = null;
      });
    return inFlight;
  };

  return {
    afterFirstRender() {
      if (startupScheduled) return;
      startupScheduled = true;
      const start = (): void => {
        startupTimer = timers.setTimeout(() => {
          startupTimer = null;
          void runNow('startup').catch(() => undefined);
        }, options.startupDelayMs ?? 5_000);
      };
      if (options.defer) options.defer(start);
      else start();
    },
    async onForeground() {
      const last = getLastRunAt();
      if (last !== null && now() - last < minIntervalMs) return null;
      return runNow('foreground');
    },
    afterSync: () => runNow('after-sync'),
    runNow,
    getLastRunAt,
    dispose() {
      if (startupTimer !== null) timers.clearTimeout(startupTimer);
      startupTimer = null;
    },
  };
}
