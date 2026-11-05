import { logger } from '@resgrid/core';
import { useSyncExternalStore } from 'react';

import { type AppInit, createAppInit, type InitStatus, type InitStep, type StepPosition } from './create-app-init';

/**
 * The app's two init phases:
 * - **startup** — once per launch: Sentry → i18n → storage → device preferences → auth restore → platform packages.
 * - **session** — on every sign-in (reset on sign-out): rights → flags/terminology/data protection (+ department
 *   config) → working set → realtime hubs → hydration → voice → push registration, then per-variant steps.
 */
export type InitPhase = 'startup' | 'session';

export const startupInit: AppInit = createAppInit({ name: 'startup', logger });
export const sessionInit: AppInit = createAppInit({ name: 'session', logger });

const phases: Record<InitPhase, AppInit> = { startup: startupInit, session: sessionInit };

/**
 * Adds a step to a phase (per-variant steps: location, CallKeep, weather, map packs…). Position relative to a default
 * step id, e.g. `registerInitStep('session', step, { after: 'session.realtime' })`.
 */
export function registerInitStep(phase: InitPhase, step: InitStep, position?: StepPosition): () => void {
  return phases[phase].register(step, position);
}

export interface AppInitView {
  startup: InitStatus;
  session: InitStatus;
  /** Startup finished: the gate can decide. */
  isStartupReady: boolean;
  /** The signed-in bootstrap is on its first attempt this session (the shell's loading chip; nothing is blocked). */
  isSessionLoading: boolean;
  /**
   * The signed-in bootstrap failed and has not succeeded since, including while a retry runs, so the failure banner
   * stays put instead of flickering with every automatic retry.
   */
  isSessionFailed: boolean;
  /** Runs whichever phase failed again now. */
  retry: () => void;
}

const subscribeBoth = (listener: () => void): (() => void) => {
  const a = startupInit.subscribe(listener);
  const b = sessionInit.subscribe(listener);

  return () => {
    a();
    b();
  };
};

const retry = (): void => {
  if (startupInit.getStatus().state === 'failed') {
    void startupInit.retryNow();

    return;
  }

  if (sessionInit.getStatus().state === 'failed') {
    void sessionInit.retryNow();
  }
};

/** Init status for the shell's loading chip and failure banner ("Try again"). Neither blocks the screens. */
export function useAppInit(): AppInitView {
  const startup = useSyncExternalStore(subscribeBoth, startupInit.getStatus, startupInit.getStatus);
  const session = useSyncExternalStore(subscribeBoth, sessionInit.getStatus, sessionInit.getStatus);
  // A run after the first (attempt > 1) is an automatic retry of a run that failed; "Try again" starts over at 1.
  const isRetrying = session.state === 'running' && session.attempt > 1;

  return {
    startup,
    session,
    isStartupReady: startup.everReady,
    isSessionLoading: !session.everReady && (session.state === 'idle' || (session.state === 'running' && !isRetrying)),
    isSessionFailed: !session.everReady && (session.state === 'failed' || isRetrying),
    retry,
  };
}
