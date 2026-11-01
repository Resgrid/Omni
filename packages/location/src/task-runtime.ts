import { AppState } from 'react-native';

import { BOOTSTRAP_TIMEOUT_MS } from './constants';
import { extractTaskFixes, newestFix } from './geo';
import { describeError, getLocationLogger } from './logger';
import { settleWithin, TIMED_OUT } from './timeouts';
import type { LocationFix } from './types';

/**
 * Runtime behind the background location task (defined in `background-task.ts`, imported first by the app entry).
 *
 * When the OS relaunches a killed app to deliver a location — Android restarting the foreground service, iOS waking it
 * for a deferred batch — it evaluates the bundle WITHOUT mounting a route: the root layout never runs, so nothing has
 * called `setActiveVariant`, `initOffline` or `configureLocation`. Unit defined its task from a route-loaded module and
 * dropped those fixes; Responder defined it from the entry. Omni defines it from the entry AND gives the app a hook to
 * bring the transmitter up headlessly:
 *
 * 1. a consumer is attached (`configureLocation` ran) → it handles the batch;
 * 2. otherwise the registered bootstrap (`registerBackgroundLocationBootstrap`) runs once — it should set the variant,
 *    open offline storage, restore the persisted session and call `configureLocation` — and then the consumer handles it;
 * 3. otherwise the newest fix is held in memory and handed over as soon as a consumer attaches.
 */
export interface LocationTaskContext {
  /** AppState when the batch arrived ('active' only when the app is in the foreground). */
  appState: string;
}

export interface LocationTaskConsumer {
  handleTaskLocations(fixes: LocationFix[], context: LocationTaskContext): Promise<void>;
}

export interface LocationTaskBody {
  data: unknown;
  error: { code?: string | number; message?: string } | null;
}

let consumer: LocationTaskConsumer | null = null;
let bootstrap: (() => Promise<void>) | null = null;
let bootstrapRun: Promise<void> | null = null;
let heldFix: { fix: LocationFix; context: LocationTaskContext } | null = null;

const currentAppState = (): string => {
  try {
    return typeof AppState.currentState === 'string' ? AppState.currentState : 'unknown';
  } catch {
    return 'unknown';
  }
};

const deliverHeld = (target: LocationTaskConsumer): void => {
  const held = heldFix;
  heldFix = null;
  if (!held) return;
  getLocationLogger().info({ message: 'Handing a location fix held from a headless launch to the transmitter' });
  void target.handleTaskLocations([held.fix], held.context).catch((error: unknown) => {
    getLocationLogger().warn({ message: 'Held location fix could not be processed', context: { error: describeError(error) } });
  });
};

/** Attach (or detach with null) the transmitter that processes task batches. A fix held from a headless launch is delivered now. */
export function setLocationTaskConsumer(next: LocationTaskConsumer | null): void {
  consumer = next;
  if (next) deliverHeld(next);
}

export function getLocationTaskConsumer(): LocationTaskConsumer | null {
  return consumer;
}

/**
 * Registers the app's headless bootstrap (call it from the app entry right after importing the task module). It runs at
 * most once per process, only when a batch arrives before the shell configured the transmitter.
 */
export function registerBackgroundLocationBootstrap(fn: (() => Promise<void>) | null): void {
  bootstrap = fn;
  bootstrapRun = null;
}

const runBootstrap = async (): Promise<void> => {
  if (!bootstrap) return;
  bootstrapRun ??= bootstrap().catch((error: unknown) => {
    // Let a later batch try again (e.g. storage was briefly unavailable).
    bootstrapRun = null;
    getLocationLogger().error({ message: 'Background location bootstrap failed', context: { error: describeError(error) } });
  });
  const outcome = await settleWithin(bootstrapRun, BOOTSTRAP_TIMEOUT_MS);
  if (outcome === TIMED_OUT) getLocationLogger().warn({ message: 'Background location bootstrap did not finish in time' });
};

/** The task executor (exported for tests; `background-task.ts` passes it to `TaskManager.defineTask`). */
export async function handleLocationTaskEvent(body: LocationTaskBody): Promise<void> {
  const logger = getLocationLogger();
  if (body.error) {
    logger.error({ message: 'Location task error', context: { code: body.error.code } });
    return;
  }
  const fixes = extractTaskFixes(body.data);
  if (fixes.length === 0) return;
  const context: LocationTaskContext = { appState: currentAppState() };

  if (!consumer) await runBootstrap();
  const target = consumer;
  if (!target) {
    const newest = newestFix(fixes);
    if (newest && (!heldFix || newest.timestamp >= heldFix.fix.timestamp)) heldFix = { fix: newest, context };
    logger.warn({ message: 'Location fix arrived before the transmitter was configured; holding the newest', context: { batchSize: fixes.length } });
    return;
  }

  try {
    await target.handleTaskLocations(fixes, context);
  } catch (error) {
    logger.error({ message: 'Location task batch could not be processed', context: { error: describeError(error), batchSize: fixes.length } });
  }
}

/** Test helper: forget the consumer, bootstrap and held fix. */
export function resetLocationTaskRuntimeForTests(): void {
  consumer = null;
  bootstrap = null;
  bootstrapRun = null;
  heldFix = null;
}

/** Test/diagnostic helper: the fix held from a headless launch, if any. */
export function getHeldLocationFix(): LocationFix | null {
  return heldFix?.fix ?? null;
}
