import { type AppLifecycleState, getAppLifecycleState, startAppLifecycle, subscribeAppLifecycle } from '@resgrid/core/lifecycle/app-lifecycle';
import { logger } from '@resgrid/core/logging/logger';
import { isWeb } from '@resgrid/core/platform/platform';

import { BACKGROUND_DISCONNECT_GRACE_MS, RESUME_RECONNECT_DELAY_MS } from './constants';
import { useRealtimeStore } from './realtime-store';
import { createHubWatchdog, type HubWatchdog, isHubWatchdogEnabled } from './watchdog';

/**
 * Realtime lifecycle (omni-plan §7.5): hubs connect while signed in and in the foreground. On native they close after
 * a 2 s background grace (quick app switches keep them) and reconnect on resume — the geolocation hub only when the
 * realtime-geolocation preference allows (Responder). On web and Electron they never close because a tab is hidden
 * or a window minimised: core's lifecycle pins web to "active" and this controller ignores app state on web too
 * (Unit/IC desktop dropped every hub on minimise).
 */

export interface RealtimeSession {
  /** Signed in with a usable session. */
  isSignedIn: boolean;
  /** The department config (EventingUrl) and rights are loaded. */
  isReady: boolean;
}

export interface RealtimeLifecycleController {
  start(): void;
  stop(): void;
  setSession(session: RealtimeSession): void;
  /** True while a background disconnect or resume reconnect is running. */
  isProcessing(): boolean;
}

export interface RealtimeLifecycleOptions {
  /** Defaults to a watchdog when the variant has `realtime.hubWatchdog`; null disables it. */
  watchdog?: HubWatchdog | null;
  backgroundGraceMs?: number;
  resumeDelayMs?: number;
}

const isBackgroundState = (state: AppLifecycleState): boolean => !state.isActive && (state.appState === 'background' || state.appState === 'inactive');

export function createRealtimeLifecycle(options: RealtimeLifecycleOptions = {}): RealtimeLifecycleController {
  const backgroundGraceMs = options.backgroundGraceMs ?? BACKGROUND_DISCONNECT_GRACE_MS;
  const resumeDelayMs = options.resumeDelayMs ?? RESUME_RECONNECT_DELAY_MS;

  let session: RealtimeSession = { isSignedIn: false, isReady: false };
  let unsubscribeAppState: (() => void) | null = null;
  let lastAppState: AppLifecycleState = getAppLifecycleState();
  let backgroundTimer: ReturnType<typeof setTimeout> | null = null;
  let resumeTimer: ReturnType<typeof setTimeout> | null = null;
  let processing = 0;

  const watchdog: HubWatchdog | null = options.watchdog !== undefined ? options.watchdog : isHubWatchdogEnabled() ? createHubWatchdog({ isBusy: () => processing > 0 }) : null;

  const canRun = (): boolean => session.isSignedIn && session.isReady;
  const isForeground = (): boolean => isWeb() || getAppLifecycleState().isActive;

  const clearTimers = (): void => {
    if (backgroundTimer) clearTimeout(backgroundTimer);
    if (resumeTimer) clearTimeout(resumeTimer);
    backgroundTimer = null;
    resumeTimer = null;
  };

  const syncWatchdog = (): void => {
    if (!watchdog) return;
    if (canRun() && isForeground()) watchdog.start();
    else watchdog.stop();
  };

  // Lifecycle operations run one after another: a resume that lands while the background disconnect is still closing
  // sockets must reconnect after it, not race it.
  let queue: Promise<void> = Promise.resolve();
  const run = (label: string, task: () => Promise<void>): Promise<void> => {
    processing += 1;
    queue = queue
      .then(task)
      .catch((error: unknown) => {
        logger.error({ message: `Realtime lifecycle: ${label} failed`, context: { error } });
      })
      .finally(() => {
        processing -= 1;
      });
    return queue;
  };

  const connect = (reason: string): Promise<void> =>
    run(`connect (${reason})`, async () => {
      logger.info({ message: 'Connecting realtime hubs', context: { reason } });
      // connectAll applies the realtime-geolocation preference (else the variant default) to the geolocation hub.
      await useRealtimeStore.getState().connectAll();
    });

  const disconnect = (reason: string, options: { clearLiveLocations?: boolean } = {}): Promise<void> =>
    run(`disconnect (${reason})`, async () => {
      logger.info({ message: 'Disconnecting realtime hubs', context: { reason } });
      await useRealtimeStore.getState().disconnectAll();
      if (options.clearLiveLocations) useRealtimeStore.getState().clearLiveLocations();
    });

  const handleAppState = (): void => {
    const next = getAppLifecycleState();
    const previous = lastAppState;
    lastAppState = next;
    if (isWeb() || !canRun()) {
      syncWatchdog();
      return;
    }

    if (isBackgroundState(next)) {
      if (resumeTimer) clearTimeout(resumeTimer);
      resumeTimer = null;
      if (backgroundTimer) return;
      backgroundTimer = setTimeout(() => {
        backgroundTimer = null;
        // Re-check: a navigation-triggered inactive blip or a quick app switch keeps the hubs.
        if (!isBackgroundState(getAppLifecycleState()) || !canRun()) return;
        void disconnect('background');
      }, backgroundGraceMs);
    } else if (next.isActive && !previous.isActive) {
      if (backgroundTimer) clearTimeout(backgroundTimer);
      backgroundTimer = null;
      if (resumeTimer) clearTimeout(resumeTimer);
      resumeTimer = setTimeout(() => {
        resumeTimer = null;
        if (!getAppLifecycleState().isActive || !canRun()) return;
        void connect('resume');
      }, resumeDelayMs);
    }
    syncWatchdog();
  };

  return {
    start: () => {
      if (unsubscribeAppState) return;
      startAppLifecycle();
      lastAppState = getAppLifecycleState();
      unsubscribeAppState = subscribeAppLifecycle(handleAppState);
      syncWatchdog();
    },
    stop: () => {
      unsubscribeAppState?.();
      unsubscribeAppState = null;
      clearTimers();
      watchdog?.stop();
    },
    setSession: (nextSession) => {
      const wasRunning = canRun();
      session = { ...nextSession };
      const running = canRun();
      if (running && !wasRunning) {
        // Signed in while backgrounded (native): the resume connects instead.
        if (isForeground()) void connect('sign-in');
      } else if (!running && wasRunning) {
        // Signed out (or config lost): close every hub so the outgoing user's group memberships end with the session.
        clearTimers();
        void disconnect('sign-out', { clearLiveLocations: true });
      }
      syncWatchdog();
    },
    isProcessing: () => processing > 0,
  };
}
