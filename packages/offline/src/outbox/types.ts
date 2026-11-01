import type { OfflineScope } from '../util/scope';

export type OutboxState = 'pending' | 'processing' | 'failed' | 'dead';

export interface OutboxError {
  status?: number;
  code?: string;
  message: string;
}

/**
 * Plan §8.3 contract. Additions (all optional, documented in the package README of record — the
 * plan): `orderKey`, `nextAttemptAt`, `confirmedAt`. Ordering within a scope uses the insertion
 * sequence (device clock jumps cannot reorder writes); `createdAt` is kept for display and LWW.
 */
export interface OutboxEvent<T = unknown> {
  /** Client UUID = idempotency key sent to the server. Never changes on retry. */
  id: string;
  /** Registered handler key, e.g. 'status.set', 'ic.lane.create', 'records.draft.save'. */
  type: string;
  payload: T;
  /** Server is stored normalized (`normalizeServer`). */
  scope: OfflineScope;
  createdAt: number;
  /** Events that must be delivered (or dead-lettered) first, e.g. close call after close command. */
  dependsOn?: string[];
  /** Newest-wins collapse, e.g. location fixes per unit. */
  coalesceKey?: string;
  /** Strict FIFO group: an event waits for every earlier undelivered event with the same key (e.g. unit statuses per unit). */
  orderKey?: string;
  attempts: number;
  state: OutboxState;
  lastError?: OutboxError;
  /** RMS legal transitions, protected writes: never silently replayed — waits for `confirmOnlineAuth()`. */
  requiresOnlineAuth?: boolean;
  confirmedAt?: number;
  nextAttemptAt?: number;
}

/**
 * - `permanent` — the server refused the payload (4xx): dead-letter now.
 * - `retry` — server/transient failure (5xx, 408, 429): back off, dead-letter after max attempts.
 * - `network` — the request never got an answer: back off without spending the attempt budget, stop the pass.
 * - `auth` — 401: stop the pass so auth can refresh; the event stays pending.
 */
export type OutboxErrorClass = 'retry' | 'permanent' | 'network' | 'auth';

export interface SendContext {
  /** Same as `event.id`; pass it as the idempotency key / client GUID. */
  idempotencyKey: string;
  attempt: number;
}

export type RollbackReason = 'dead' | 'discarded';

/**
 * One handler per event type, registered by the features in a variant's offline scope (plan §8.3).
 * Methods use method syntax so typed handlers register into the untyped registry.
 */
export interface OutboxHandler<P = unknown, R = unknown> {
  type: string;
  send(event: OutboxEvent<P>, context: SendContext): Promise<R>;
  /** Applied right after the event is durably queued, so the UI updates offline. */
  optimisticApply?(event: OutboxEvent<P>): void | Promise<void>;
  /** Called when the write is abandoned: dead-lettered, or discarded by the user. */
  rollback?(event: OutboxEvent<P>, reason: RollbackReason): void | Promise<void>;
  classify(error: unknown, event: OutboxEvent<P>): OutboxErrorClass;
  /** After the server acknowledged and the event was deleted (e.g. IC board refresh). */
  afterAck?(event: OutboxEvent<P>, result: R): void | Promise<void>;
  /** Overrides the retry policy's max attempts for this type. */
  maxAttempts?: number;
}

export interface EnqueueInput<P = unknown> {
  type: string;
  payload: P;
  /** Defaults to the signed-in session. */
  scope?: OfflineScope;
  dependsOn?: string[];
  coalesceKey?: string;
  /** Time the coalesced value represents (e.g. the GPS fix time); defaults to createdAt. */
  coalesceAt?: number;
  orderKey?: string;
  requiresOnlineAuth?: boolean;
  /** Payload carries protected (ADP) values: must be encrypted; enqueue fails without a cipher. */
  protected?: boolean;
  /** Supply when importing legacy queue items so their ids (idempotency keys) survive. */
  id?: string;
  createdAt?: number;
}

export type EnqueueStatus = 'queued' | 'coalesced' | 'duplicate';

export interface EnqueueResult {
  /** The queued event's id — or, when `coalesced`, the newer event that made this one redundant. */
  id: string;
  status: EnqueueStatus;
  /** Older events with the same coalesce key that this one replaced. */
  replaced: string[];
}

export interface RetryPolicy {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

export type DrainStatus = 'completed' | 'skipped-offline' | 'skipped-signed-out' | 'stopped-auth' | 'stopped-network';

export interface DrainResult {
  status: DrainStatus;
  sent: string[];
  failed: string[];
  dead: string[];
  superseded: string[];
  droppedForeign: string[];
  /** Events of other sessions left untouched. */
  held: number;
  /** Events not attempted: backoff, dependency/order, awaiting confirmation, or no handler. */
  waiting: number;
}

export interface DrainOptions {
  /** Only attempt matching events (e.g. a unit's queued statuses before submitting a new one). */
  filter?: (event: OutboxItemView) => boolean;
  /** Send even if the connectivity source says offline (the caller is about to hit the network anyway). */
  ignoreConnectivity?: boolean;
}

export type DropReason = 'foreign-expired' | 'dead-expired' | 'dead-overflow';

export interface OutboxDropRecord {
  id: string;
  type: string;
  reason: DropReason;
  createdAt: number;
  droppedAt: number;
}

/** What the Pending sync screen lists — no payloads, no protected values. */
export interface OutboxItemView {
  id: string;
  type: string;
  state: OutboxState;
  createdAt: number;
  ageMs: number;
  attempts: number;
  lastError?: OutboxError;
  nextAttemptAt?: number;
  requiresOnlineAuth: boolean;
  awaitingConfirmation: boolean;
  stuck: boolean;
  coalesceKey?: string;
  orderKey?: string;
}

export interface OutboxCounts {
  pending: number;
  processing: number;
  failed: number;
  dead: number;
  awaitingConfirmation: number;
  stuck: number;
  /** Not yet delivered: pending + processing + failed (dead excluded). Drives "N changes waiting". */
  unsent: number;
  /** Items of other users/servers/departments held on this device (shown as a count only). */
  held: number;
  total: number;
}

export interface OutboxSnapshot {
  counts: OutboxCounts;
  items: OutboxItemView[];
  isDraining: boolean;
  lastDrainAt: number | null;
  lastDrainStatus: DrainStatus | null;
  recentlyDropped: OutboxDropRecord[];
  updatedAt: number;
}
