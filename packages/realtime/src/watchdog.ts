import { logger } from '@resgrid/core/logging/logger';

import { HUB_REPAIR_BASE_BACKOFF_MS, HUB_REPAIR_MAX_BACKOFF_MS, HUB_WATCHDOG_INTERVAL_MS, type RealtimeHubKey } from './constants';
import { getRealtimeFeatures } from './realtime-config';
import { getHubName, getWantedHubs, useRealtimeStore } from './realtime-store';
import { signalRService } from './signalr-service';

/**
 * Hub watchdog (omni-plan §7.5, BigBoard `ensureHubConnections`) for always-on screens (`realtime.hubWatchdog`): an
 * unattended wall board must not silently stop updating when the service gives up. Periodically repairs any wanted
 * hub that is lost for good or connected but not in its group; a failed repair backs off 30 s → 10 min (doubling).
 */

export class HubRepairBackoff {
  private entries = new Map<RealtimeHubKey, { failures: number; nextAttemptAt: number }>();

  canAttempt(hub: RealtimeHubKey, now: number): boolean {
    return (this.entries.get(hub)?.nextAttemptAt ?? 0) <= now;
  }

  record(hub: RealtimeHubKey, succeeded: boolean, now: number): void {
    if (succeeded) {
      this.entries.delete(hub);
      return;
    }
    const failures = (this.entries.get(hub)?.failures ?? 0) + 1;
    this.entries.set(hub, { failures, nextAttemptAt: now + HubRepairBackoff.delayFor(failures) });
  }

  /** Delay after the nth consecutive failure: 30 s, 60 s, 120 s … capped at 10 min. */
  static delayFor(failures: number): number {
    return Math.min(HUB_REPAIR_BASE_BACKOFF_MS * 2 ** Math.max(0, failures - 1), HUB_REPAIR_MAX_BACKOFF_MS);
  }

  getFailures(hub: RealtimeHubKey): number {
    return this.entries.get(hub)?.failures ?? 0;
  }

  clear(): void {
    this.entries.clear();
  }
}

const CONNECT_ACTION = {
  eventing: 'connectEventingHub',
  geolocation: 'connectGeolocationHub',
  chat: 'connectChatHub',
} as const;

/** One watchdog pass: repairs each wanted hub that needs it and whose backoff allows. */
export async function ensureHubConnections(backoff: HubRepairBackoff, now: () => number = Date.now): Promise<void> {
  for (const hub of getWantedHubs()) {
    const hubName = getHubName(hub);
    // "Not available": no connection, no automatic reconnect, no scheduled rebuild — the service has given up.
    const lost = !signalRService.isHubAvailable(hubName);
    const notInGroup = signalRService.isHubConnected(hubName) && !useRealtimeStore.getState().hubs[hub].joined;
    if (!(lost || notInGroup) || !backoff.canAttempt(hub, now())) continue;

    logger.warn({ message: `Hub watchdog: repairing ${hub} hub`, context: { lost, notInGroup } });
    await useRealtimeStore.getState()[CONNECT_ACTION[hub]]();
    backoff.record(hub, signalRService.isHubConnected(hubName) && useRealtimeStore.getState().hubs[hub].joined, now());
  }
}

export interface HubWatchdog {
  start(): void;
  stop(): void;
  isRunning(): boolean;
  /** Runs one pass now (skipped while a pass or `isBusy()` is in progress). */
  runOnce(): Promise<void>;
}

export interface HubWatchdogOptions {
  intervalMs?: number;
  /** True while lifecycle transitions own the connections (background/resume); the pass is skipped. */
  isBusy?: () => boolean;
  backoff?: HubRepairBackoff;
}

export function createHubWatchdog(options: HubWatchdogOptions = {}): HubWatchdog {
  const backoff = options.backoff ?? new HubRepairBackoff();
  let timer: ReturnType<typeof setInterval> | null = null;
  let passInFlight = false;

  const runOnce = async (): Promise<void> => {
    if (passInFlight || options.isBusy?.()) return;
    passInFlight = true;
    try {
      await ensureHubConnections(backoff);
    } catch (error) {
      logger.error({ message: 'Hub watchdog failed to repair hub connections', context: { error } });
    } finally {
      passInFlight = false;
    }
  };

  return {
    start: () => {
      if (timer) return;
      timer = setInterval(() => {
        void runOnce();
      }, options.intervalMs ?? HUB_WATCHDOG_INTERVAL_MS);
    },
    stop: () => {
      if (timer) clearInterval(timer);
      timer = null;
      backoff.clear();
    },
    isRunning: () => timer !== null,
    runOnce,
  };
}

/** Whether this app runs the watchdog (`capabilities.realtime.hubWatchdog`: BigBoard, Dispatch). */
export const isHubWatchdogEnabled = (): boolean => getRealtimeFeatures().hubWatchdog;
