import { type AppUpdateRestartGuard, checkForAppUpdate, registerAppUpdateRestartGuard, startAppUpdates } from '@resgrid/core';
import { useLiveKitStore } from '@resgrid/voice';

import type { AppInit, InitStep } from '../init/create-app-init';

/**
 * In-app updates in the init registry (docs/subsystems/app-updates.md). The updates service lives in @resgrid/core;
 * apps/omni hands it the expo-updates module. Both steps are optional and return at once, so they can neither fail nor
 * delay a phase.
 */
export const APP_UPDATES_STARTUP_STEP_ID = 'startup.updates';
export const APP_UPDATES_SESSION_STEP_ID = 'session.updates';

/**
 * Never restart into an update while a voice/PTT session is connected or connecting: the reload would drop the room
 * mid-transmission. Reads @resgrid/voice's LiveKit store (L3, below the shell).
 */
export const voiceSessionRestartGuard: AppUpdateRestartGuard = () => {
  const { isConnected, isConnecting } = useLiveKitStore.getState();
  return isConnected || isConnecting ? 'voice' : null;
};

/** Startup, right after Sentry: the voice restart guard, the launch report (emergency launches) and foreground checks. */
export function createAppUpdatesStartupStep(): InitStep {
  return {
    id: APP_UPDATES_STARTUP_STEP_ID,
    optional: true,
    run: () => {
      registerAppUpdateRestartGuard('voice', voiceSessionRestartGuard);
      startAppUpdates();
    },
  };
}

/** Last step of the signed-in bootstrap: start a check in the background and move on. */
export function createAppUpdatesSessionStep(): InitStep {
  return {
    id: APP_UPDATES_SESSION_STEP_ID,
    optional: true,
    run: () => {
      // Never awaited: the bootstrap is done; the check (and any download) finishes on its own and never rejects.
      void checkForAppUpdate('bootstrap');
    },
  };
}

/** Registers both steps (with the defaults, from configureAppShell). */
export function registerAppUpdateSteps(startup: AppInit, session: AppInit): void {
  startup.register(createAppUpdatesStartupStep(), { after: 'startup.sentry' });
  session.register(createAppUpdatesSessionStep());
}
