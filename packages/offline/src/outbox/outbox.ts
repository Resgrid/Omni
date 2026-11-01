import { applySchema } from '../db/schema';
import type { DbOps, DbRow, DurableDb } from '../db/types';
import { type Clock, generateUuid, type IdGenerator, systemClock } from '../util/ids';
import { getOfflineLogger } from '../util/logger';
import { Mutex } from '../util/mutex';
import { isSameSession, normalizeServer, type OfflineScope } from '../util/scope';
import type { PayloadCipher } from './cipher';
import { toOutboxError } from './classify';
import type { ConnectivitySource } from './connectivity';
import { defaultOutboxHandlerRegistry, type OutboxHandlerRegistry } from './registry';
import { OUTBOX_DROPPED_TABLE, OUTBOX_TABLE, outboxSchemaModule } from './schema';
import type {
  DrainOptions,
  DrainResult,
  DrainStatus,
  DropReason,
  EnqueueInput,
  EnqueueResult,
  OutboxCounts,
  OutboxDropRecord,
  OutboxError,
  OutboxErrorClass,
  OutboxEvent,
  OutboxHandler,
  OutboxItemView,
  OutboxSnapshot,
  OutboxState,
  RetryPolicy,
  RollbackReason,
} from './types';

interface MetaRow extends DbRow {
  id: string;
  type: string;
  scopeServer: string;
  scopeDepartmentId: number;
  scopeUserId: string;
  scopeUnitId: number | null;
  createdAt: number;
  seq: number;
  dependsOn: string | null;
  coalesceKey: string | null;
  coalesceAt: number | null;
  orderKey: string | null;
  attempts: number;
  retryFailures: number;
  state: string;
  lastError: string | null;
  requiresOnlineAuth: number;
  confirmedAt: number | null;
  nextAttemptAt: number | null;
  updatedAt: number;
  stateChangedAt: number;
}

interface OutboxRow extends MetaRow {
  payload: string;
  payloadEncoding: string;
}

const META_COLUMNS = [
  'id',
  'type',
  'scopeServer',
  'scopeDepartmentId',
  'scopeUserId',
  'scopeUnitId',
  'createdAt',
  'seq',
  'dependsOn',
  'coalesceKey',
  'coalesceAt',
  'orderKey',
  'attempts',
  'retryFailures',
  'state',
  'lastError',
  'requiresOnlineAuth',
  'confirmedAt',
  'nextAttemptAt',
  'updatedAt',
  'stateChangedAt',
];

const UNDELIVERED: OutboxState[] = ['pending', 'processing', 'failed'];
const DAY_MS = 24 * 60 * 60 * 1000;

export const DEFAULT_RETRY_POLICY: RetryPolicy = { maxAttempts: 8, baseDelayMs: 2_000, maxDelayMs: 5 * 60_000 };
/** Plan §8.3: events of another user/server are held this long, then dropped with a visible record. */
export const FOREIGN_HOLD_MS = 7 * DAY_MS;
/** Processing longer than this is reported stuck; pending/failed older than `stuckAfterMs` too. */
const PROCESSING_STUCK_MS = 5 * 60_000;

export class OutboxNoSessionError extends Error {
  constructor() {
    super('Cannot queue a write without a signed-in session scope.');
    this.name = 'OutboxNoSessionError';
  }
}

export class OutboxUnknownTypeError extends Error {
  constructor(type: string) {
    super(`No outbox handler is registered for "${type}".`);
    this.name = 'OutboxUnknownTypeError';
  }
}

export class ProtectedPayloadError extends Error {
  constructor() {
    super('A protected payload can only be queued when a payload cipher is configured.');
    this.name = 'ProtectedPayloadError';
  }
}

export class ConfirmationRequiredError extends Error {
  constructor(action: string) {
    super(`${action} needs an explicit user confirmation ({ confirmed: true }).`);
    this.name = 'ConfirmationRequiredError';
  }
}

export interface OutboxOptions {
  db: DurableDb;
  /** The signed-in session (server + department + user + unit), or null while signed out. */
  getScope: () => OfflineScope | null;
  registry?: OutboxHandlerRegistry;
  connectivity?: ConnectivitySource;
  cipher?: PayloadCipher | null;
  /** With a cipher: encrypt every payload (default) or only `protected` ones. */
  encryptPayloads?: 'all' | 'protected-only';
  retry?: Partial<RetryPolicy>;
  foreignHoldMs?: number;
  /** Pending/failed items older than this are flagged stuck in the Pending sync screen (default 1 h). */
  stuckAfterMs?: number;
  now?: Clock;
  generateId?: IdGenerator;
  /** A send got 401: refresh auth, then drain again. */
  onAuthRequired?: () => void;
  timers?: { setTimeout: (fn: () => void, ms: number) => unknown; clearTimeout: (handle: unknown) => void };
}

type SendOutcome = 'sent' | 'failed' | 'dead' | 'superseded' | 'stop-auth' | 'stop-network';

const parseJson = <T>(raw: string | null): T | undefined => {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
};

const rowScope = (row: Pick<MetaRow, 'scopeServer' | 'scopeDepartmentId' | 'scopeUserId' | 'scopeUnitId'>): OfflineScope => ({
  server: row.scopeServer,
  departmentId: Number(row.scopeDepartmentId),
  userId: row.scopeUserId,
  ...(row.scopeUnitId !== null && row.scopeUnitId !== undefined ? { unitId: Number(row.scopeUnitId) } : {}),
});

const emptyCounts = (): OutboxCounts => ({ pending: 0, processing: 0, failed: 0, dead: 0, awaitingConfirmation: 0, stuck: 0, unsent: 0, held: 0, total: 0 });

/**
 * The durable outbox (plan §8.3). Baselines merged: Unit's drainer (ordered, one pass at a time,
 * newest-fix-only coalescing, 4xx permanent, recover "processing" after a kill), IC's ordering rule
 * generalized to `dependsOn`, Responder's session scoping (never replay another user's or server's
 * events; hold 7 days, then drop with a record) and encrypted payloads.
 */
export class Outbox {
  private readonly db: DurableDb;
  private readonly registry: OutboxHandlerRegistry;
  private readonly retryPolicy: RetryPolicy;
  private readonly now: Clock;
  private readonly generateId: IdGenerator;
  private readonly foreignHoldMs: number;
  private readonly stuckAfterMs: number;
  private readonly passMutex = new Mutex();
  private queuedDrain: Promise<DrainResult> | null = null;
  private initPromise: Promise<void> | null = null;
  private isDraining = false;
  private lastDrainAt: number | null = null;
  private lastDrainStatus: DrainStatus | null = null;
  private snapshot: OutboxSnapshot;
  private readonly listeners = new Set<(snapshot: OutboxSnapshot) => void>();
  private triggersActive = false;
  private triggerIntervalMs = 10_000;
  private timer: unknown = null;
  private unsubscribeConnectivity: (() => void) | null = null;

  constructor(private readonly options: OutboxOptions) {
    this.db = options.db;
    this.registry = options.registry ?? defaultOutboxHandlerRegistry;
    this.retryPolicy = { ...DEFAULT_RETRY_POLICY, ...options.retry };
    this.now = options.now ?? systemClock;
    this.generateId = options.generateId ?? generateUuid;
    this.foreignHoldMs = options.foreignHoldMs ?? FOREIGN_HOLD_MS;
    this.stuckAfterMs = options.stuckAfterMs ?? 60 * 60_000;
    this.snapshot = { counts: emptyCounts(), items: [], isDraining: false, lastDrainAt: null, lastDrainStatus: null, recentlyDropped: [], updatedAt: 0 };
  }

  // ---------------------------------------------------------------- lifecycle

  /** Creates/migrates the tables and recovers events left "processing" by a killed app (Unit). Idempotent. */
  init(): Promise<void> {
    this.initPromise ??= (async () => {
      await applySchema(this.db, [outboxSchemaModule], { now: this.now });
      const recovered = await this.db.update(OUTBOX_TABLE, { state: 'processing' }, { state: 'pending', updatedAt: this.now() });
      if (recovered > 0) {
        getOfflineLogger().warn({ message: 'Recovered outbox events interrupted mid-send', context: { count: recovered } });
      }
      await this.refresh();
    })().catch((error: unknown) => {
      this.initPromise = null;
      throw error;
    });
    return this.initPromise;
  }

  // ---------------------------------------------------------------- enqueue

  async enqueue<P>(input: EnqueueInput<P>): Promise<EnqueueResult> {
    await this.init();
    const logger = getOfflineLogger();
    const scope = input.scope ?? this.options.getScope();
    if (!scope) throw new OutboxNoSessionError();
    const handler = this.registry.get(input.type);
    if (!handler) throw new OutboxUnknownTypeError(input.type);

    const id = input.id ?? this.generateId();
    const createdAt = input.createdAt ?? this.now();
    const coalesceAt = input.coalesceKey ? (input.coalesceAt ?? createdAt) : null;
    const serialized = JSON.stringify(input.payload);
    if (serialized === undefined) throw new TypeError('Outbox payload must be JSON-serializable.');
    const { payload, payloadEncoding } = await this.encode(serialized, Boolean(input.protected));
    const server = normalizeServer(scope.server);
    const storedScope: OfflineScope = { ...scope, server };

    const result = await this.db.transaction(async (tx): Promise<EnqueueResult> => {
      const replaced: string[] = [];
      if (input.coalesceKey) {
        const sameKey = (await tx.select<MetaRow>(OUTBOX_TABLE, { where: { coalesceKey: input.coalesceKey }, columns: META_COLUMNS })).filter((row) => isSameSession(rowScope(row), storedScope));
        const newer = sameKey.find((row) => UNDELIVERED.includes(row.state as OutboxState) && row.coalesceAt !== null && coalesceAt !== null && Number(row.coalesceAt) > coalesceAt);
        if (newer) {
          return { id: newer.id, status: 'coalesced', replaced };
        }
        for (const row of sameKey) {
          // A replay in flight is left alone; if it fails it is dropped as superseded (Unit).
          if (row.state !== 'processing') {
            await tx.delete(OUTBOX_TABLE, { id: row.id });
            replaced.push(row.id);
          }
        }
      }

      const last = await tx.select<{ seq: number }>(OUTBOX_TABLE, { columns: ['seq'], orderBy: [{ column: 'seq', direction: 'desc' }], limit: 1 });
      const seq = (last[0] ? Number(last[0].seq) : 0) + 1;
      const now = this.now();
      const row: OutboxRow = {
        id,
        type: input.type,
        payload,
        payloadEncoding,
        scopeServer: server,
        scopeDepartmentId: scope.departmentId,
        scopeUserId: scope.userId,
        scopeUnitId: scope.unitId ?? null,
        createdAt,
        seq,
        dependsOn: input.dependsOn && input.dependsOn.length > 0 ? JSON.stringify(input.dependsOn) : null,
        coalesceKey: input.coalesceKey ?? null,
        coalesceAt,
        orderKey: input.orderKey ?? null,
        attempts: 0,
        retryFailures: 0,
        state: 'pending',
        lastError: null,
        requiresOnlineAuth: input.requiresOnlineAuth ? 1 : 0,
        confirmedAt: null,
        nextAttemptAt: null,
        updatedAt: now,
        stateChangedAt: now,
      };
      const written = await tx.insert(OUTBOX_TABLE, row, { onConflict: 'ignore' });
      return { id, status: written === 0 ? 'duplicate' : 'queued', replaced };
    });

    if (result.status === 'queued') {
      logger.info({ message: 'Outbox event queued', context: { id, type: input.type, replaced: result.replaced.length } });
      if (handler.optimisticApply) {
        const event: OutboxEvent<P> = {
          id,
          type: input.type,
          payload: input.payload,
          scope: storedScope,
          createdAt,
          dependsOn: input.dependsOn,
          coalesceKey: input.coalesceKey,
          orderKey: input.orderKey,
          attempts: 0,
          state: 'pending',
          requiresOnlineAuth: input.requiresOnlineAuth,
        };
        try {
          await handler.optimisticApply(event);
        } catch (error) {
          logger.error({ message: 'Optimistic apply failed; the write stays queued', context: { id, type: input.type, error: error instanceof Error ? error.name : typeof error } });
        }
      }
    } else if (result.status === 'coalesced') {
      logger.debug({ message: 'Outbox event superseded by a newer queued one, not queued', context: { type: input.type, newerId: result.id } });
    }

    await this.refresh();
    this.wake();
    return result;
  }

  // ---------------------------------------------------------------- drain

  /**
   * Deliver queued events: one pass at a time, in queue order, honouring dependencies, order keys,
   * backoff and confirmation holds. Calls made while a pass runs share one follow-up pass.
   */
  drain(options: DrainOptions = {}): Promise<DrainResult> {
    if (!options.filter && !options.ignoreConnectivity) {
      if (this.queuedDrain) return this.queuedDrain;
      const queued: Promise<DrainResult> = this.passMutex.run(() => {
        if (this.queuedDrain === queued) this.queuedDrain = null;
        return this.runPass(options);
      });
      this.queuedDrain = queued;
      return queued;
    }
    return this.passMutex.run(() => this.runPass(options));
  }

  private async runPass(options: DrainOptions): Promise<DrainResult> {
    await this.init();
    const result: DrainResult = { status: 'completed', sent: [], failed: [], dead: [], superseded: [], droppedForeign: [], held: 0, waiting: 0 };
    if (!options.ignoreConnectivity && this.options.connectivity && !this.options.connectivity.isOnline()) {
      return this.finishPass({ ...result, status: 'skipped-offline' });
    }
    const scope = this.options.getScope();
    if (!scope) {
      // Signed out: everything waits for whoever signs in next (Responder).
      return this.finishPass({ ...result, status: 'skipped-signed-out' });
    }

    this.setDraining(true);
    try {
      for (let round = 0; round < 10; round++) {
        const rows = await this.db.select<MetaRow>(OUTBOX_TABLE, { columns: META_COLUMNS, orderBy: [{ column: 'seq' }] });
        const live = new Map<string, MetaRow>(rows.map((row) => [row.id, row]));
        result.held = 0;
        result.waiting = 0;
        let progressed = false;
        let blockedByOthers = false;

        for (const row of rows) {
          if (!isSameSession(rowScope(row), scope)) {
            if (round === 0 && this.now() - Number(row.createdAt) > this.foreignHoldMs) {
              await this.dropRows([row], 'foreign-expired');
              live.delete(row.id);
              result.droppedForeign.push(row.id);
            } else {
              result.held++;
            }
            continue;
          }
          const current = live.get(row.id);
          if (!current || current.state === 'dead' || current.state === 'processing') continue;
          if (options.filter && !options.filter(this.toView(current))) continue;
          if (current.state === 'failed' && current.nextAttemptAt !== null && Number(current.nextAttemptAt) > this.now()) {
            result.waiting++;
            continue;
          }
          if (Number(current.requiresOnlineAuth) === 1 && current.confirmedAt === null) {
            result.waiting++;
            continue;
          }
          const handler = this.registry.get(current.type);
          if (!handler) {
            result.waiting++;
            continue;
          }
          if (this.isBlocked(current, live)) {
            result.waiting++;
            blockedByOthers = true;
            continue;
          }

          const outcome = await this.sendOne(current, handler);
          switch (outcome) {
            case 'sent':
              live.delete(current.id);
              result.sent.push(current.id);
              progressed = true;
              break;
            case 'superseded':
              live.delete(current.id);
              result.superseded.push(current.id);
              progressed = true;
              break;
            case 'dead':
              live.set(current.id, { ...current, state: 'dead' });
              result.dead.push(current.id);
              progressed = true;
              break;
            case 'failed':
              live.set(current.id, { ...current, state: 'failed' });
              result.failed.push(current.id);
              break;
            case 'stop-auth':
              return await this.finishPass({ ...result, status: 'stopped-auth' });
            case 'stop-network':
              result.failed.push(current.id);
              return await this.finishPass({ ...result, status: 'stopped-network' });
          }
        }

        // Another round only if something settled that a held-back event was waiting on (IC re-run).
        if (!(progressed && blockedByOthers)) break;
      }
      return await this.finishPass(result);
    } finally {
      this.setDraining(false);
    }
  }

  private isBlocked(row: MetaRow, live: Map<string, MetaRow>): boolean {
    const dependsOn = parseJson<string[]>(row.dependsOn) ?? [];
    for (const dependencyId of dependsOn) {
      const dependency = live.get(dependencyId);
      // Delivered (gone) or dead-lettered no longer holds it back — the server decides (IC).
      if (dependency && UNDELIVERED.includes(dependency.state as OutboxState)) return true;
    }
    if (row.orderKey) {
      for (const other of live.values()) {
        if (other.id !== row.id && other.orderKey === row.orderKey && Number(other.seq) < Number(row.seq) && UNDELIVERED.includes(other.state as OutboxState) && isSameSession(rowScope(other), rowScope(row))) {
          return true;
        }
      }
    }
    return false;
  }

  private backoffMs(failures: number): number {
    return Math.min(this.retryPolicy.baseDelayMs * Math.pow(2, Math.max(0, failures)), this.retryPolicy.maxDelayMs);
  }

  private async sendOne(row: MetaRow, handler: OutboxHandler): Promise<SendOutcome> {
    const logger = getOfflineLogger();
    const attempt = Number(row.attempts) + 1;
    const startedAt = this.now();
    await this.db.update(OUTBOX_TABLE, { id: row.id }, { state: 'processing', attempts: attempt, updatedAt: startedAt, stateChangedAt: startedAt });

    let event: OutboxEvent;
    try {
      event = await this.loadEvent(row.id);
    } catch {
      // Unknown ciphertext is preserved, never overwritten (Protected Data profile): park it visibly.
      await this.markDead(row, { code: 'payload_unreadable', message: 'The queued payload could not be decrypted.' });
      return 'dead';
    }

    try {
      const response = await handler.send(event, { idempotencyKey: row.id, attempt });
      await this.db.delete(OUTBOX_TABLE, { id: row.id });
      logger.info({ message: 'Outbox event delivered', context: { id: row.id, type: row.type, attempt } });
      if (handler.afterAck) {
        try {
          await handler.afterAck(event, response);
        } catch (error) {
          logger.warn({ message: 'Outbox afterAck failed', context: { id: row.id, type: row.type, error: error instanceof Error ? error.name : typeof error } });
        }
      }
      return 'sent';
    } catch (error) {
      let errorClass: OutboxErrorClass;
      try {
        errorClass = handler.classify(error, event);
      } catch {
        errorClass = 'retry';
      }
      const lastError = toOutboxError(error);
      const now = this.now();

      if (errorClass === 'permanent') {
        await this.markDead(row, lastError);
        logger.error({ message: 'Outbox event rejected by the server, dead-lettered', context: { id: row.id, type: row.type, status: lastError.status } });
        await this.runRollback(handler, event, 'dead');
        return 'dead';
      }

      if (errorClass === 'auth') {
        await this.db.update(OUTBOX_TABLE, { id: row.id }, { state: 'pending', lastError: JSON.stringify(lastError), nextAttemptAt: null, updatedAt: now, stateChangedAt: now });
        logger.warn({ message: 'Outbox drain stopped: authorization required', context: { id: row.id, type: row.type } });
        this.options.onAuthRequired?.();
        return 'stop-auth';
      }

      if (row.coalesceKey && (await this.isSuperseded(row))) {
        // Retrying would replay a value the newer queued one already replaces (Unit location rule).
        await this.db.delete(OUTBOX_TABLE, { id: row.id });
        logger.warn({ message: 'Superseded outbox event dropped after a failed send', context: { id: row.id, type: row.type } });
        return 'superseded';
      }

      if (errorClass === 'network') {
        await this.db.update(OUTBOX_TABLE, { id: row.id }, { state: 'failed', lastError: JSON.stringify(lastError), nextAttemptAt: now + this.backoffMs(Number(row.retryFailures)), updatedAt: now, stateChangedAt: now });
        logger.warn({ message: 'Outbox drain stopped: network unavailable', context: { id: row.id, type: row.type } });
        return 'stop-network';
      }

      const failures = Number(row.retryFailures) + 1;
      const maxAttempts = handler.maxAttempts ?? this.retryPolicy.maxAttempts;
      if (failures >= maxAttempts) {
        await this.markDead(row, lastError, failures);
        logger.error({ message: 'Outbox event out of retries, dead-lettered', context: { id: row.id, type: row.type, failures } });
        await this.runRollback(handler, event, 'dead');
        return 'dead';
      }
      await this.db.update(
        OUTBOX_TABLE,
        { id: row.id },
        { state: 'failed', retryFailures: failures, lastError: JSON.stringify(lastError), nextAttemptAt: now + this.backoffMs(failures - 1), updatedAt: now, stateChangedAt: now }
      );
      logger.warn({ message: 'Outbox event failed, retry scheduled', context: { id: row.id, type: row.type, failures, status: lastError.status } });
      return 'failed';
    }
  }

  private async isSuperseded(row: MetaRow): Promise<boolean> {
    if (!row.coalesceKey) return false;
    const others = await this.db.select<MetaRow>(OUTBOX_TABLE, { where: { coalesceKey: row.coalesceKey, id: { ne: row.id }, state: { in: UNDELIVERED } }, columns: META_COLUMNS });
    return others.some((other) => isSameSession(rowScope(other), rowScope(row)) && other.coalesceAt !== null && (row.coalesceAt === null || Number(other.coalesceAt) >= Number(row.coalesceAt)));
  }

  private async markDead(row: MetaRow, lastError: OutboxError, retryFailures?: number): Promise<void> {
    const now = this.now();
    await this.db.update(
      OUTBOX_TABLE,
      { id: row.id },
      { state: 'dead', lastError: JSON.stringify(lastError), nextAttemptAt: null, updatedAt: now, stateChangedAt: now, ...(retryFailures !== undefined ? { retryFailures } : {}) }
    );
  }

  private async runRollback(handler: OutboxHandler, event: OutboxEvent, reason: RollbackReason): Promise<void> {
    if (!handler.rollback) return;
    try {
      await handler.rollback(event, reason);
    } catch (error) {
      getOfflineLogger().error({ message: 'Outbox rollback failed', context: { id: event.id, type: event.type, reason, error: error instanceof Error ? error.name : typeof error } });
    }
  }

  private async finishPass(result: DrainResult): Promise<DrainResult> {
    this.lastDrainAt = this.now();
    this.lastDrainStatus = result.status;
    await this.refresh();
    this.scheduleTimer();
    return result;
  }

  private setDraining(value: boolean): void {
    if (this.isDraining === value) return;
    this.isDraining = value;
    this.snapshot = { ...this.snapshot, isDraining: value };
    this.listeners.forEach((listener) => listener(this.snapshot));
  }

  // ---------------------------------------------------------------- user actions (Pending sync screen)

  /** Send a failed or dead-lettered event again, with a fresh retry budget. Same id — same idempotency key. */
  async retry(id: string): Promise<boolean> {
    await this.init();
    const row = await this.ownRow(id);
    if (!row || (row.state !== 'failed' && row.state !== 'dead')) return false;
    await this.db.update(OUTBOX_TABLE, { id }, { state: 'pending', retryFailures: 0, nextAttemptAt: null, lastError: null, updatedAt: this.now(), stateChangedAt: this.now() });
    await this.refresh();
    this.wake();
    return true;
  }

  async retryAll(): Promise<number> {
    await this.init();
    const scope = this.options.getScope();
    if (!scope) return 0;
    const changed = await this.db.update(
      OUTBOX_TABLE,
      { ...this.scopeWhere(scope), state: { in: ['failed', 'dead'] } },
      { state: 'pending', retryFailures: 0, nextAttemptAt: null, lastError: null, updatedAt: this.now(), stateChangedAt: this.now() }
    );
    await this.refresh();
    this.wake();
    return changed;
  }

  /** Abandon a queued write (the screen confirms first). Runs the handler's rollback. */
  async discard(id: string, options: { confirmed: boolean }): Promise<boolean> {
    if (!options.confirmed) throw new ConfirmationRequiredError('Discarding a queued change');
    await this.init();
    const row = await this.ownRow(id);
    if (!row || row.state === 'processing') return false;
    let event: OutboxEvent | null = null;
    try {
      event = await this.loadEvent(id);
    } catch {
      event = null;
    }
    await this.db.delete(OUTBOX_TABLE, { id });
    getOfflineLogger().info({ message: 'Outbox event discarded by the user', context: { id, type: row.type } });
    const handler = this.registry.get(row.type);
    if (handler && event) await this.runRollback(handler, event, 'discarded');
    await this.refresh();
    return true;
  }

  /**
   * The user confirmed, after reconnecting and re-authorizing, that a `requiresOnlineAuth` write may
   * be sent (RMS legal transitions, protected writes). Never called automatically.
   */
  async confirmOnlineAuth(id: string): Promise<boolean> {
    await this.init();
    const row = await this.ownRow(id);
    if (!row || Number(row.requiresOnlineAuth) !== 1 || row.state === 'processing') return false;
    await this.db.update(OUTBOX_TABLE, { id }, { confirmedAt: this.now(), state: 'pending', nextAttemptAt: null, updatedAt: this.now() });
    await this.refresh();
    this.wake();
    return true;
  }

  /**
   * Correct a rejected write (e.g. an offline call the server refused) and queue it again under the
   * same id. A confirmation given earlier is cleared.
   */
  async amend<P>(id: string, payload: P, options: { protected?: boolean } = {}): Promise<boolean> {
    await this.init();
    const row = await this.ownRow(id);
    if (!row || row.state === 'processing') return false;
    const serialized = JSON.stringify(payload);
    if (serialized === undefined) throw new TypeError('Outbox payload must be JSON-serializable.');
    const encoded = await this.encode(serialized, Boolean(options.protected));
    await this.db.update(OUTBOX_TABLE, { id }, { ...encoded, state: 'pending', retryFailures: 0, nextAttemptAt: null, lastError: null, confirmedAt: null, updatedAt: this.now(), stateChangedAt: this.now() });
    await this.refresh();
    this.wake();
    return true;
  }

  /** The full event including the decrypted payload (correction flows). Own session only. */
  async getEvent<P = unknown>(id: string): Promise<OutboxEvent<P> | null> {
    await this.init();
    const row = await this.ownRow(id);
    if (!row) return null;
    return (await this.loadEvent(id)) as OutboxEvent<P>;
  }

  // ---------------------------------------------------------------- observable state

  getSnapshot(): OutboxSnapshot {
    return this.snapshot;
  }

  /** useSyncExternalStore-compatible. */
  subscribe(listener: (snapshot: OutboxSnapshot) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async refresh(): Promise<OutboxSnapshot> {
    const rows = await this.db.select<MetaRow>(OUTBOX_TABLE, { columns: META_COLUMNS, orderBy: [{ column: 'seq' }] });
    const dropped = await this.db.select<OutboxDropRecord & DbRow>(OUTBOX_DROPPED_TABLE, { orderBy: [{ column: 'droppedAt', direction: 'desc' }], limit: 20 });
    const scope = this.options.getScope();
    const counts = emptyCounts();
    const items: OutboxItemView[] = [];
    for (const row of rows) {
      if (!scope || !isSameSession(rowScope(row), scope)) {
        counts.held++;
        continue;
      }
      const view = this.toView(row);
      items.push(view);
      counts.total++;
      counts[view.state]++;
      if (view.state !== 'dead') counts.unsent++;
      if (view.awaitingConfirmation) counts.awaitingConfirmation++;
      if (view.stuck) counts.stuck++;
    }
    this.snapshot = {
      counts,
      items,
      isDraining: this.isDraining,
      lastDrainAt: this.lastDrainAt,
      lastDrainStatus: this.lastDrainStatus,
      recentlyDropped: dropped.map((record) => ({ id: record.id, type: record.type, reason: record.reason as DropReason, createdAt: Number(record.createdAt), droppedAt: Number(record.droppedAt) })),
      updatedAt: this.now(),
    };
    this.listeners.forEach((listener) => listener(this.snapshot));
    return this.snapshot;
  }

  private toView(row: MetaRow): OutboxItemView {
    const now = this.now();
    const state = row.state as OutboxState;
    const requiresOnlineAuth = Number(row.requiresOnlineAuth) === 1;
    const lastError = parseJson<OutboxError>(row.lastError);
    const stuck = state === 'processing' ? now - Number(row.stateChangedAt) > PROCESSING_STUCK_MS : (state === 'pending' || state === 'failed') && now - Number(row.createdAt) > this.stuckAfterMs;
    return {
      id: row.id,
      type: row.type,
      state,
      createdAt: Number(row.createdAt),
      ageMs: Math.max(0, now - Number(row.createdAt)),
      attempts: Number(row.attempts),
      ...(lastError ? { lastError } : {}),
      ...(row.nextAttemptAt !== null ? { nextAttemptAt: Number(row.nextAttemptAt) } : {}),
      requiresOnlineAuth,
      awaitingConfirmation: requiresOnlineAuth && row.confirmedAt === null && state !== 'dead',
      stuck,
      ...(row.coalesceKey ? { coalesceKey: row.coalesceKey } : {}),
      ...(row.orderKey ? { orderKey: row.orderKey } : {}),
    };
  }

  // ---------------------------------------------------------------- triggers

  /**
   * Drain on reconnect (connectivity source) and on a timer while there is work — waking at the
   * earliest retry time. Foreground is signalled by the shell with `notifyForeground()`.
   */
  startTriggers(options: { intervalMs?: number } = {}): () => void {
    this.triggerIntervalMs = options.intervalMs ?? 10_000;
    if (this.triggersActive) return () => this.stopTriggers();
    this.triggersActive = true;
    this.unsubscribeConnectivity =
      this.options.connectivity?.subscribe((online) => {
        if (online) void this.drain().catch(() => undefined);
      }) ?? null;
    this.scheduleTimer();
    return () => this.stopTriggers();
  }

  stopTriggers(): void {
    this.triggersActive = false;
    this.unsubscribeConnectivity?.();
    this.unsubscribeConnectivity = null;
    this.clearTimer();
  }

  notifyForeground(): Promise<DrainResult> {
    return this.drain();
  }

  notifyReconnect(): Promise<DrainResult> {
    return this.drain();
  }

  private timers() {
    return this.options.timers ?? { setTimeout: (fn: () => void, ms: number): unknown => setTimeout(fn, ms), clearTimeout: (handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>) };
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      this.timers().clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private wake(): void {
    if (!this.triggersActive) return;
    this.clearTimer();
    this.timer = this.timers().setTimeout(() => {
      this.timer = null;
      void this.drain().catch(() => undefined);
    }, 0);
  }

  /** Arms the timer only while the session has actionable work (Unit: no idle ticking). */
  private scheduleTimer(): void {
    if (!this.triggersActive) return;
    this.clearTimer();
    const actionable = this.snapshot.items.filter((item) => (item.state === 'pending' || item.state === 'failed') && !item.awaitingConfirmation);
    if (actionable.length === 0) return;
    const now = this.now();
    const earliest = Math.min(...actionable.map((item) => (item.state === 'failed' && item.nextAttemptAt !== undefined ? item.nextAttemptAt : now + this.triggerIntervalMs)));
    const delay = Math.max(250, Math.min(this.triggerIntervalMs, earliest - now));
    this.timer = this.timers().setTimeout(() => {
      this.timer = null;
      void this.drain().catch(() => undefined);
    }, delay);
  }

  // ---------------------------------------------------------------- reset & maintenance hooks

  /** Unsent (not dead) events for a session, or for everyone. */
  async countUnsent(scope?: OfflineScope | null): Promise<number> {
    await this.init();
    return this.db.count(OUTBOX_TABLE, { ...(scope ? this.scopeWhere(scope) : {}), state: { in: UNDELIVERED } });
  }

  /** Delete a session's events (or all). Used by wipes that discard unsent writes after confirmation. */
  async deleteForScope(scope?: OfflineScope | null): Promise<number> {
    await this.init();
    const removed = scope ? await this.db.delete(OUTBOX_TABLE, this.scopeWhere(scope)) : await this.db.delete(OUTBOX_TABLE);
    if (!scope) await this.db.delete(OUTBOX_DROPPED_TABLE);
    await this.refresh();
    return removed;
  }

  /** Retention: dead-lettered events older than `maxAgeMs`, then beyond the newest `maxRows`. */
  async pruneDead(rule: { maxAgeMs: number; maxRows: number }): Promise<number> {
    await this.init();
    const now = this.now();
    const dead = await this.db.select<MetaRow>(OUTBOX_TABLE, { where: { state: 'dead' }, columns: META_COLUMNS, orderBy: [{ column: 'stateChangedAt', direction: 'desc' }] });
    const expired = dead.filter((row) => now - Number(row.stateChangedAt) > rule.maxAgeMs);
    const remaining = dead.filter((row) => now - Number(row.stateChangedAt) <= rule.maxAgeMs);
    const overflow = remaining.slice(rule.maxRows);
    await this.dropRows(expired, 'dead-expired');
    await this.dropRows(overflow, 'dead-overflow');
    const removed = expired.length + overflow.length;
    if (removed > 0) {
      getOfflineLogger().warn({ message: 'Dropped dead-lettered outbox events past retention', context: { expired: expired.length, overflow: overflow.length } });
      await this.refresh();
    }
    return removed;
  }

  /** Retention: other sessions' events past the hold window. Decided only while someone is signed in (Responder). */
  async pruneForeign(holdMs: number = this.foreignHoldMs): Promise<number> {
    await this.init();
    const scope = this.options.getScope();
    if (!scope) return 0;
    const now = this.now();
    const rows = await this.db.select<MetaRow>(OUTBOX_TABLE, { columns: META_COLUMNS });
    const expired = rows.filter((row) => !isSameSession(rowScope(row), scope) && now - Number(row.createdAt) > holdMs);
    await this.dropRows(expired, 'foreign-expired');
    if (expired.length > 0) {
      getOfflineLogger().warn({ message: 'Dropped outbox events held too long for another session', context: { count: expired.length } });
      await this.refresh();
    }
    return expired.length;
  }

  private async dropRows(rows: MetaRow[], reason: DropReason): Promise<void> {
    if (rows.length === 0) return;
    const now = this.now();
    await this.db.transaction(async (tx: DbOps) => {
      for (const row of rows) {
        await tx.delete(OUTBOX_TABLE, { id: row.id });
        await tx.insert(OUTBOX_DROPPED_TABLE, { id: row.id, type: row.type, reason, createdAt: Number(row.createdAt), droppedAt: now }, { onConflict: 'replace' });
      }
    });
  }

  // ---------------------------------------------------------------- helpers

  private scopeWhere(scope: OfflineScope) {
    return { scopeServer: normalizeServer(scope.server), scopeDepartmentId: scope.departmentId, scopeUserId: scope.userId };
  }

  private async ownRow(id: string): Promise<MetaRow | null> {
    const scope = this.options.getScope();
    if (!scope) return null;
    const row = (await this.db.select<MetaRow>(OUTBOX_TABLE, { where: { id }, columns: META_COLUMNS }))[0];
    return row && isSameSession(rowScope(row), scope) ? row : null;
  }

  private async encode(serialized: string, isProtected: boolean): Promise<{ payload: string; payloadEncoding: string }> {
    const cipher = this.options.cipher ?? null;
    if (!cipher) {
      if (isProtected) throw new ProtectedPayloadError();
      return { payload: serialized, payloadEncoding: 'json' };
    }
    if (isProtected || (this.options.encryptPayloads ?? 'all') === 'all') {
      return { payload: await cipher.encrypt(serialized), payloadEncoding: `cipher:${cipher.id}` };
    }
    return { payload: serialized, payloadEncoding: 'json' };
  }

  private async loadEvent(id: string): Promise<OutboxEvent> {
    const row = (await this.db.select<OutboxRow>(OUTBOX_TABLE, { where: { id } }))[0];
    if (!row) throw new Error('Outbox event not found.');
    let json = row.payload;
    if (row.payloadEncoding !== 'json') {
      const cipher = this.options.cipher ?? null;
      if (!cipher || row.payloadEncoding !== `cipher:${cipher.id}`) throw new Error('No cipher for this payload.');
      json = await cipher.decrypt(row.payload);
    }
    const lastError = parseJson<OutboxError>(row.lastError);
    return {
      id: row.id,
      type: row.type,
      payload: JSON.parse(json) as unknown,
      scope: rowScope(row),
      createdAt: Number(row.createdAt),
      ...(row.dependsOn ? { dependsOn: parseJson<string[]>(row.dependsOn) ?? [] } : {}),
      ...(row.coalesceKey ? { coalesceKey: row.coalesceKey } : {}),
      ...(row.orderKey ? { orderKey: row.orderKey } : {}),
      attempts: Number(row.attempts),
      state: row.state as OutboxState,
      ...(lastError ? { lastError } : {}),
      requiresOnlineAuth: Number(row.requiresOnlineAuth) === 1,
      ...(row.confirmedAt !== null ? { confirmedAt: Number(row.confirmedAt) } : {}),
      ...(row.nextAttemptAt !== null ? { nextAttemptAt: Number(row.nextAttemptAt) } : {}),
    };
  }
}

export function createOutbox(options: OutboxOptions): Outbox {
  return new Outbox(options);
}
