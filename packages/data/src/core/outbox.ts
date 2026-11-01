import { isApiError, V4FailureError } from '@resgrid/api';
import { defaultClassify, type EnqueueInput, type OutboxErrorClass, type OutboxHandler } from '@resgrid/offline';

import { getDataOutbox } from './runtime';

/**
 * Outbox classification for `@resgrid/api` errors (plan §8.3): no answer → `network` (wait, do not spend
 * attempts); 401 / no session → `auth`; 408 / 429 / 5xx → `retry`; any other 4xx or a v4 `failure`
 * envelope → `permanent` (dead-letter: shown in Pending sync, never replayed silently).
 */
export function classifyDataWriteError(error: unknown): OutboxErrorClass {
  if (error instanceof V4FailureError) return 'permanent';
  if (isApiError(error)) {
    switch (error.kind) {
      case 'network':
      case 'timeout':
      case 'canceled':
        return 'network';
      case 'no_session':
        return 'auth';
      case 'http': {
        const status = error.status ?? 0;
        if (status === 401) return 'auth';
        if (status === 408 || status === 429) return 'retry';
        if (status >= 400 && status < 500) return 'permanent';
        return 'retry';
      }
      default:
        return 'retry';
    }
  }
  return defaultClassify(error);
}

type HandlerInput<P, R> = Omit<OutboxHandler<P, R>, 'classify'> & Partial<Pick<OutboxHandler<P, R>, 'classify'>>;

/** An outbox handler with the data layer's default classification. */
export function defineDataHandler<P, R = unknown>(handler: HandlerInput<P, R>): OutboxHandler<P, R> {
  return { classify: (error) => classifyDataWriteError(error), ...handler };
}

/**
 * - `sent`: the server accepted it (the write went straight through).
 * - `queued`: held on the device; it replays on reconnect (offline, network failure, or waiting behind earlier writes).
 * - `rejected`: the server refused it; it is dead-lettered in Pending sync for correction or discard.
 */
export type WriteOutcome = 'sent' | 'queued' | 'rejected';

export interface WriteResult {
  outcome: WriteOutcome;
  /** Outbox event id = idempotency key (= client GUID for creates). */
  id: string;
}

/**
 * Queues a write durably, then tries to deliver it right away (Unit status rule generalized): the drain
 * pass delivers earlier writes with the same `orderKey` first, so a newer status can never overtake an
 * older queued one. Offline, the drain is skipped and the write stays queued.
 */
export async function submitWrite<P>(input: EnqueueInput<P>, options: { deliverNow?: boolean } = {}): Promise<WriteResult> {
  const outbox = getDataOutbox();
  const queued = await outbox.enqueue(input);
  if (queued.status !== 'queued' || options.deliverNow === false) return { outcome: 'queued', id: queued.id };
  const id = queued.id;
  const orderKey = input.orderKey;
  const result = await outbox.drain({ filter: (event) => event.id === id || (orderKey !== undefined && event.orderKey === orderKey) });
  if (result.sent.includes(id)) return { outcome: 'sent', id };
  if (result.dead.includes(id)) return { outcome: 'rejected', id };
  return { outcome: 'queued', id };
}

/** Delivers queued writes of one order group now (e.g. a unit's statuses before its next one). */
export async function drainOrderGroup(orderKey: string): Promise<void> {
  await getDataOutbox().drain({ filter: (event) => event.orderKey === orderKey });
}
