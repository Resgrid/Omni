/**
 * Ordered, idempotent init steps with a generation guard, a per-step timeout and retry backoff (omni-plan §5.4;
 * Responder's signed-in bootstrap + use-app-init-retry, Dispatch's 30 s timeout).
 *
 * - **Ordered:** steps run one after another in registry order (`register(step, { before | after })`).
 * - **Idempotent:** a step that completed in the current generation never runs again; a retry resumes at the step
 *   that failed. Concurrent `run()` calls share one run.
 * - **Generation guard:** `reset()` (sign-out) starts a new generation; a run from an older one stops at its next
 *   await and can no longer change the status, connect hubs or schedule retries.
 * - **Timeout:** each step races `timeoutMs` (default 30 s); a timeout is a failure like any other.
 * - **Retry:** a failed run retries on a backoff (5 s doubling to 60 s, 5 attempts), cancelled by `reset()`.
 * - **Optional steps** log their failure and the phase continues; a step can end the phase early with `'stop'`
 *   (the app-access gate signing a member out).
 */

export type InitPhaseState = 'idle' | 'running' | 'ready' | 'failed' | 'stopped';

export interface InitStepContext {
  readonly generation: number;
  readonly attempt: number;
  /** False once the phase was reset: stop and touch nothing. */
  isCurrent(): boolean;
}

/** Ends the phase without failing it (no retry). */
export type InitStepOutcome = 'stop';

export interface InitStep {
  id: string;
  run(context: InitStepContext): void | InitStepOutcome | Promise<void | InitStepOutcome>;
  /** Overrides the phase timeout for this step. `0` disables it. */
  timeoutMs?: number;
  /** A failure is logged and the phase carries on. */
  optional?: boolean;
  /** Skipped (and counted as done) when this returns false. Read when the step is reached. */
  enabled?: () => boolean;
}

export interface InitStatus {
  name: string;
  state: InitPhaseState;
  generation: number;
  /** Attempts in this generation (1 = first run). */
  attempt: number;
  currentStep: string | null;
  completedSteps: readonly string[];
  failedStep: string | null;
  /** The last failure. Show a generic message; never render its text. */
  error: Error | null;
  /** Epoch ms of the scheduled retry, or null. */
  nextRetryAt: number | null;
  /** This generation reached `ready` at least once (a later resume does not bring the overlay back). */
  everReady: boolean;
}

export interface RetryPolicy {
  baseDelayMs: number;
  maxDelayMs: number;
  maxAttempts: number;
}

export interface InitLogger {
  info(entry: { message: string; context?: Record<string, unknown> }): void;
  warn(entry: { message: string; context?: Record<string, unknown> }): void;
  error(entry: { message: string; context?: Record<string, unknown> }): void;
}

export interface AppInitOptions {
  name: string;
  steps?: readonly InitStep[];
  /** Per-step timeout. Default 30 s. */
  timeoutMs?: number;
  /** `false` disables automatic retries. */
  retry?: RetryPolicy | false;
  logger?: InitLogger;
  now?: () => number;
}

export interface StepPosition {
  before?: string;
  after?: string;
}

export interface AppInit {
  readonly name: string;
  /**
   * Adds a step (end of the list by default). Replaces a step with the same id. A step anchored to an id that is not
   * registered yet waits and is placed when that step is registered. Returns a remover.
   */
  register(step: InitStep, position?: StepPosition): () => void;
  getSteps(): readonly InitStep[];
  /** Runs the remaining steps of the current generation. Resolves with the status when the run ends. */
  run(): Promise<InitStatus>;
  /** Cancels a pending retry and runs now (the "Try again" button). Restores the attempt budget. */
  retryNow(): Promise<InitStatus>;
  /** New generation: forgets completed steps, cancels retries, retires any run in flight. */
  reset(): void;
  getStatus(): InitStatus;
  subscribe(listener: (status: InitStatus) => void): () => void;
}

export const DEFAULT_INIT_STEP_TIMEOUT_MS = 30_000;
export const DEFAULT_INIT_RETRY: RetryPolicy = Object.freeze({ baseDelayMs: 5_000, maxDelayMs: 60_000, maxAttempts: 5 });

/** Backoff before the retry that follows `attempt` (1-based), doubling up to the ceiling. */
export function initRetryDelay(attempt: number, policy: RetryPolicy = DEFAULT_INIT_RETRY): number {
  const exponent = Math.max(attempt - 1, 0);
  return Math.min(policy.baseDelayMs * 2 ** exponent, policy.maxDelayMs);
}

export class InitStepTimeoutError extends Error {
  constructor(
    readonly stepId: string,
    readonly timeoutMs: number
  ) {
    super(`Init step "${stepId}" did not finish within ${timeoutMs} ms`);
    this.name = 'InitStepTimeoutError';
  }
}

const toError = (value: unknown): Error => (value instanceof Error ? value : new Error(typeof value === 'string' ? value : 'Init step failed'));

const silentLogger: InitLogger = { info: () => undefined, warn: () => undefined, error: () => undefined };

async function runWithTimeout<T>(stepId: string, timeoutMs: number, task: () => T | Promise<T>): Promise<T> {
  if (timeoutMs <= 0) {
    return task();
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new InitStepTimeoutError(stepId, timeoutMs)), timeoutMs);
  });
  try {
    return await Promise.race([Promise.resolve().then(task), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export function createAppInit(options: AppInitOptions): AppInit {
  const name = options.name;
  const timeoutMs = options.timeoutMs ?? DEFAULT_INIT_STEP_TIMEOUT_MS;
  const retry = options.retry === false ? null : (options.retry ?? DEFAULT_INIT_RETRY);
  const logger = options.logger ?? silentLogger;
  const now = options.now ?? Date.now;

  let steps: InitStep[] = [...(options.steps ?? [])];
  // Steps anchored (before/after) to a step that is not registered yet: variant registrations load before
  // configureAppShell registers the defaults. They are placed when the anchor arrives and never run before that.
  let waiting: { step: InitStep; position: StepPosition }[] = [];

  const place = (step: InitStep, position?: StepPosition): void => {
    const anchorId = position?.before ?? position?.after;
    const anchor = anchorId ? steps.findIndex((existing) => existing.id === anchorId) : -1;
    if (anchorId && anchor === -1) {
      waiting.push({ step, position: position ?? {} });
      return;
    }
    if (anchor === -1) {
      steps.push(step);
    } else {
      steps.splice(position?.before ? anchor : anchor + 1, 0, step);
    }
    const ready = waiting.filter((entry) => (entry.position.before ?? entry.position.after) === step.id);
    if (ready.length > 0) {
      waiting = waiting.filter((entry) => !ready.includes(entry));
      ready.forEach((entry) => place(entry.step, entry.position));
    }
  };

  let generation = 0;
  let completed = new Set<string>();
  let inFlight: Promise<InitStatus> | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  const listeners = new Set<(status: InitStatus) => void>();

  let status: InitStatus = {
    name,
    state: 'idle',
    generation,
    attempt: 0,
    currentStep: null,
    completedSteps: [],
    failedStep: null,
    error: null,
    nextRetryAt: null,
    everReady: false,
  };

  const setStatus = (patch: Partial<InitStatus>): void => {
    status = { ...status, ...patch, completedSteps: patch.completedSteps ?? status.completedSteps };
    listeners.forEach((listener) => {
      try {
        listener(status);
      } catch {
        // A listener must never break initialization.
      }
    });
  };

  const cancelRetry = (): void => {
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
  };

  const scheduleRetry = (attempt: number): number | null => {
    if (!retry || attempt >= retry.maxAttempts) {
      logger.error({ message: `App init (${name}) failed repeatedly; giving up until the next start`, context: { attempts: attempt } });
      return null;
    }
    const delay = initRetryDelay(attempt, retry);
    const scheduledGeneration = generation;
    cancelRetry();
    retryTimer = setTimeout(() => {
      retryTimer = null;
      if (scheduledGeneration === generation) {
        void run();
      }
    }, delay);
    logger.info({ message: `App init (${name}) retry scheduled`, context: { attempt, delayMs: delay } });
    return now() + delay;
  };

  const execute = async (): Promise<InitStatus> => {
    const runGeneration = generation;
    const isCurrent = (): boolean => runGeneration === generation;
    const attempt = status.attempt + 1;
    cancelRetry();
    setStatus({ state: 'running', attempt, failedStep: null, error: null, nextRetryAt: null });
    logger.info({ message: `App init (${name}) started`, context: { attempt, generation: runGeneration } });

    for (const step of [...steps]) {
      if (!isCurrent()) {
        return status;
      }
      if (completed.has(step.id)) {
        continue;
      }
      let enabled = true;
      try {
        enabled = step.enabled ? step.enabled() : true;
      } catch {
        enabled = false;
      }
      if (!enabled) {
        completed.add(step.id);
        continue;
      }

      setStatus({ currentStep: step.id });
      try {
        const outcome = await runWithTimeout(step.id, step.timeoutMs ?? timeoutMs, () => step.run({ generation: runGeneration, attempt, isCurrent }));
        if (!isCurrent()) {
          return status;
        }
        completed.add(step.id);
        setStatus({ completedSteps: [...completed] });
        if (outcome === 'stop') {
          logger.info({ message: `App init (${name}) stopped by step`, context: { step: step.id } });
          setStatus({ state: 'stopped', currentStep: null });
          return status;
        }
      } catch (caught) {
        if (!isCurrent()) {
          return status;
        }
        const error = toError(caught);
        if (step.optional) {
          logger.warn({ message: `App init (${name}) optional step failed`, context: { step: step.id, error } });
          completed.add(step.id);
          setStatus({ completedSteps: [...completed] });
          continue;
        }
        logger.warn({ message: `App init (${name}) step failed`, context: { step: step.id, attempt, error } });
        const nextRetryAt = scheduleRetry(attempt);
        setStatus({ state: 'failed', currentStep: null, failedStep: step.id, error, nextRetryAt });
        return status;
      }
    }

    if (!isCurrent()) {
      return status;
    }
    logger.info({ message: `App init (${name}) completed`, context: { attempt } });
    setStatus({ state: 'ready', currentStep: null, everReady: true });
    return status;
  };

  const run = (): Promise<InitStatus> => {
    if (status.state === 'ready' || status.state === 'stopped') {
      return Promise.resolve(status);
    }
    if (inFlight) {
      return inFlight;
    }
    const current = execute().finally(() => {
      if (inFlight === current) {
        inFlight = null;
      }
    });
    inFlight = current;
    return current;
  };

  return {
    name,
    register(step, position) {
      steps = steps.filter((existing) => existing.id !== step.id);
      waiting = waiting.filter((entry) => entry.step.id !== step.id);
      place(step, position);
      return () => {
        steps = steps.filter((existing) => existing !== step);
        waiting = waiting.filter((entry) => entry.step !== step);
      };
    },
    getSteps: () => steps,
    run,
    retryNow() {
      cancelRetry();
      if (status.state === 'failed') {
        setStatus({ attempt: 0, nextRetryAt: null });
      }
      return run();
    },
    reset() {
      generation += 1;
      cancelRetry();
      completed = new Set<string>();
      inFlight = null;
      setStatus({ state: 'idle', generation, attempt: 0, currentStep: null, completedSteps: [], failedStep: null, error: null, nextRetryAt: null, everReady: false });
    },
    getStatus: () => status,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
