import type { DurableKv } from '../kv/durable-kv';
import { type Clock, systemClock } from '../util/ids';
import { getOfflineLogger } from '../util/logger';

export const LAST_SYNC_AT_KEY = 'resgrid.offline.lastSyncAt';
export const LAST_HYDRATION_AT_KEY = 'resgrid.offline.lastHydrationAt';

export interface HydrationContext {
  /** 0..1 progress within this step. */
  reportProgress(fraction: number): void;
  /** True once the run was cancelled (sign-out, scope change): stop early, do not persist. */
  isCancelled(): boolean;
}

/**
 * One item of shift-start hydration (plan §8.4): reference data, the variant's working set, map
 * packs. Registered per variant by features (`offline.scope`).
 */
export interface HydrationStep {
  id: string;
  /** Required steps must be current for "field ready". */
  required: boolean;
  run(context: HydrationContext): Promise<void>;
  /** Whether this step's data is present and fresh enough to work offline. */
  isCurrent(): boolean | Promise<boolean>;
  /** Steps that must finish first. */
  dependsOn?: string[];
}

export type HydrationStepStatus = 'idle' | 'running' | 'done' | 'failed' | 'skipped';

export interface HydrationStepState {
  id: string;
  required: boolean;
  status: HydrationStepStatus;
  progress: number;
  error?: string;
  completedAt?: number;
}

export interface HydrationState {
  running: boolean;
  steps: HydrationStepState[];
  /** All required steps are current. */
  fieldReady: boolean;
  lastHydrationAt: number | null;
  lastSyncAt: number | null;
}

export interface HydrationResult {
  fieldReady: boolean;
  cancelled: boolean;
  failed: string[];
  completed: string[];
}

/**
 * Reconnect sequence (plan §8.4): refresh auth and grants → pull deltas → reconcile → drain outbox →
 * resume realtime. Each step is injected by the owning package (auth, data, outbox, realtime).
 */
export interface ReconnectSequence {
  refreshAuth?: () => Promise<void>;
  pullDeltas?: () => Promise<void>;
  reconcile?: () => Promise<void>;
  drainOutbox?: () => Promise<unknown>;
  resumeRealtime?: () => Promise<void>;
}

export type ReconnectStepId = keyof ReconnectSequence;

export interface ReconnectResult {
  ok: boolean;
  /** Set when refreshing auth failed: nothing else ran (no sends or hub connects with a dead token). */
  abortedAt?: 'refreshAuth';
  completed: ReconnectStepId[];
  failed: ReconnectStepId[];
}

export interface SyncOrchestratorOptions {
  kv?: DurableKv | null;
  now?: Clock;
}

const RECONNECT_ORDER: ReconnectStepId[] = ['refreshAuth', 'pullDeltas', 'reconcile', 'drainOutbox', 'resumeRealtime'];

/**
 * Minimal sync primitives: a hydration step registry with progress and "field ready", the reconnect
 * sequence, and last-sync bookkeeping. Per-variant scopes register their steps later (features).
 */
export class SyncOrchestrator {
  private readonly steps = new Map<string, HydrationStep>();
  private readonly stepStates = new Map<string, HydrationStepState>();
  private readonly listeners = new Set<(state: HydrationState) => void>();
  private readonly syncListeners = new Set<(at: number) => void>();
  private readonly now: Clock;
  private running: Promise<HydrationResult> | null = null;
  private hydrating = false;
  private generation = 0;
  private fieldReady = false;
  private reconnect: ReconnectSequence = {};
  private reconnectInFlight: Promise<ReconnectResult> | null = null;
  private memoryLastSyncAt: number | null = null;
  private memoryLastHydrationAt: number | null = null;
  private state: HydrationState;

  constructor(private readonly options: SyncOrchestratorOptions = {}) {
    this.now = options.now ?? systemClock;
    this.state = this.buildState();
  }

  // ------------------------------------------------------------ hydration steps

  registerHydrationStep(step: HydrationStep): () => void {
    this.steps.set(step.id, step);
    this.stepStates.set(step.id, { id: step.id, required: step.required, status: 'idle', progress: 0 });
    this.emit();
    return () => {
      if (this.steps.get(step.id) === step) {
        this.steps.delete(step.id);
        this.stepStates.delete(step.id);
        this.emit();
      }
    };
  }

  getHydrationSteps(): HydrationStep[] {
    return Array.from(this.steps.values());
  }

  /**
   * Run hydration: steps whose `dependsOn` are done run in waves (independent steps in parallel).
   * Single-flight; `cancel()` (sign-out, scope change) makes a running pass stop reporting.
   */
  hydrate(options: { only?: string[]; force?: boolean } = {}): Promise<HydrationResult> {
    this.running ??= this.runHydration(options).finally(() => {
      this.running = null;
      this.hydrating = false;
      this.emit();
    });
    return this.running;
  }

  cancel(): void {
    this.generation++;
  }

  private async runHydration(options: { only?: string[]; force?: boolean }): Promise<HydrationResult> {
    this.hydrating = true;
    const generation = ++this.generation;
    const isCancelled = (): boolean => generation !== this.generation;
    const logger = getOfflineLogger();
    const selected = Array.from(this.steps.values()).filter((step) => !options.only || options.only.includes(step.id));
    const completed: string[] = [];
    const failed: string[] = [];
    const settled = new Set<string>();

    for (const step of selected) {
      this.patchStep(step.id, { status: 'idle', progress: 0, error: undefined });
    }
    this.emit();

    let remaining = [...selected];
    while (remaining.length > 0 && !isCancelled()) {
      const ready = remaining.filter((step) => (step.dependsOn ?? []).every((dependency) => settled.has(dependency) || !this.steps.has(dependency) || !selected.some((s) => s.id === dependency)));
      if (ready.length === 0) {
        // Dependency cycle or a dependency that failed: mark the rest skipped.
        remaining.forEach((step) => this.patchStep(step.id, { status: 'skipped' }));
        break;
      }
      await Promise.all(
        ready.map(async (step) => {
          const blockedBy = (step.dependsOn ?? []).filter((dependency) => failed.includes(dependency));
          if (blockedBy.length > 0) {
            this.patchStep(step.id, { status: 'skipped' });
            failed.push(step.id);
            settled.add(step.id);
            return;
          }
          if (!options.force && (await Promise.resolve(step.isCurrent()).catch(() => false))) {
            this.patchStep(step.id, { status: 'done', progress: 1 });
            completed.push(step.id);
            settled.add(step.id);
            return;
          }
          this.patchStep(step.id, { status: 'running', progress: 0 });
          this.emit();
          try {
            await step.run({
              reportProgress: (fraction) => {
                if (isCancelled()) return;
                this.patchStep(step.id, { progress: Math.max(0, Math.min(1, fraction)) });
                this.emit();
              },
              isCancelled,
            });
            if (isCancelled()) return;
            this.patchStep(step.id, { status: 'done', progress: 1, completedAt: this.now() });
            completed.push(step.id);
          } catch (error) {
            if (isCancelled()) return;
            this.patchStep(step.id, { status: 'failed', error: error instanceof Error ? error.name : 'Error' });
            failed.push(step.id);
            logger.warn({ message: 'Hydration step failed', context: { step: step.id, required: step.required } });
          }
          settled.add(step.id);
          this.emit();
        })
      );
      remaining = remaining.filter((step) => !settled.has(step.id));
    }

    const cancelled = isCancelled();
    if (!cancelled) {
      await this.refreshFieldReady();
      if (failed.length === 0) {
        this.memoryLastHydrationAt = this.now();
        this.options.kv?.set(LAST_HYDRATION_AT_KEY, this.memoryLastHydrationAt);
      }
    }
    this.emit();
    return { fieldReady: this.fieldReady, cancelled, failed, completed };
  }

  /** Re-evaluate "field ready": every required step reports current. */
  async refreshFieldReady(): Promise<boolean> {
    const required = Array.from(this.steps.values()).filter((step) => step.required);
    const results = await Promise.all(required.map((step) => Promise.resolve(step.isCurrent()).catch(() => false)));
    this.fieldReady = results.every(Boolean);
    this.emit();
    return this.fieldReady;
  }

  isFieldReady(): boolean {
    return this.fieldReady;
  }

  // ------------------------------------------------------------ reconnect

  setReconnectSequence(sequence: ReconnectSequence): void {
    this.reconnect = { ...this.reconnect, ...sequence };
  }

  /**
   * Run the reconnect sequence once (concurrent calls share it). A failed auth refresh aborts the
   * rest; any other failed step is recorded and the sequence continues — queued writes still drain
   * if the delta pull fails. A clean run records the last sync time.
   */
  onReconnect(): Promise<ReconnectResult> {
    this.reconnectInFlight ??= this.runReconnect().finally(() => {
      this.reconnectInFlight = null;
    });
    return this.reconnectInFlight;
  }

  private async runReconnect(): Promise<ReconnectResult> {
    const logger = getOfflineLogger();
    const completed: ReconnectStepId[] = [];
    const failed: ReconnectStepId[] = [];
    for (const stepId of RECONNECT_ORDER) {
      const step = this.reconnect[stepId];
      if (!step) continue;
      try {
        await step();
        completed.push(stepId);
      } catch (error) {
        failed.push(stepId);
        logger.warn({ message: 'Reconnect step failed', context: { step: stepId, error: error instanceof Error ? error.name : typeof error } });
        if (stepId === 'refreshAuth') {
          return { ok: false, abortedAt: 'refreshAuth', completed, failed };
        }
      }
    }
    if (failed.length === 0) this.recordSyncCompleted();
    return { ok: failed.length === 0, completed, failed };
  }

  // ------------------------------------------------------------ bookkeeping

  recordSyncCompleted(at: number = this.now()): void {
    this.memoryLastSyncAt = at;
    this.options.kv?.set(LAST_SYNC_AT_KEY, at);
    this.syncListeners.forEach((listener) => listener(at));
    this.emit();
  }

  /** e.g. run maintenance after each successful sync. */
  onSyncCompleted(listener: (at: number) => void): () => void {
    this.syncListeners.add(listener);
    return () => this.syncListeners.delete(listener);
  }

  getLastSyncAt(): number | null {
    return this.options.kv?.getNumber(LAST_SYNC_AT_KEY) ?? this.memoryLastSyncAt;
  }

  getLastHydrationAt(): number | null {
    return this.options.kv?.getNumber(LAST_HYDRATION_AT_KEY) ?? this.memoryLastHydrationAt;
  }

  getState(): HydrationState {
    return this.state;
  }

  subscribe(listener: (state: HydrationState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private patchStep(id: string, patch: Partial<HydrationStepState>): void {
    const current = this.stepStates.get(id);
    if (current) this.stepStates.set(id, { ...current, ...patch });
  }

  private buildState(): HydrationState {
    return {
      running: this.hydrating,
      steps: Array.from(this.stepStates.values()).map((step) => ({ ...step })),
      fieldReady: this.fieldReady,
      lastHydrationAt: this.getLastHydrationAt(),
      lastSyncAt: this.getLastSyncAt(),
    };
  }

  private emit(): void {
    this.state = this.buildState();
    this.listeners.forEach((listener) => listener(this.state));
  }
}

export function createSyncOrchestrator(options: SyncOrchestratorOptions = {}): SyncOrchestrator {
  return new SyncOrchestrator(options);
}
