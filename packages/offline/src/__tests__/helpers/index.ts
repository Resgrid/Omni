import { createMemoryDb } from '../../db/memory-db';
import { createSqliteDb } from '../../db/sqlite-db';
import type { DurableDb } from '../../db/types';
import type { OutboxErrorClass, OutboxEvent, OutboxHandler } from '../../outbox/types';
import type { OfflineScope } from '../../util/scope';
import { isNodeSqliteAvailable } from '../fakes/expo-sqlite';

export interface TestClock {
  now: () => number;
  advance(ms: number): void;
  set(value: number): void;
}

export function createClock(start = Date.UTC(2026, 9, 31, 12, 0, 0)): TestClock {
  let value = start;
  return {
    now: () => value,
    advance: (ms) => {
      value += ms;
    },
    set: (next) => {
      value = next;
    },
  };
}

export const DAY = 24 * 60 * 60 * 1000;

export const scopeA: OfflineScope = { server: 'https://api.resgrid.com/api/v4', departmentId: 1, userId: 'user-a', unitId: 10 };
export const scopeB: OfflineScope = { server: 'https://api.resgrid.com', departmentId: 1, userId: 'user-b' };

/** axios-style HTTP error. */
export function httpError(status: number, message = `Request failed with status code ${status}`): Error & { response: { status: number }; isAxiosError: boolean } {
  return Object.assign(new Error(message), { response: { status }, isAxiosError: true });
}

export function networkError(): Error & { code: string; isAxiosError: boolean } {
  return Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK', isAxiosError: true });
}

let idCounter = 0;
export const sequentialIds = (): (() => string) => {
  idCounter = 0;
  return () => `evt-${++idCounter}`;
};

export type SendImpl = (event: OutboxEvent) => Promise<unknown>;

export interface TestHandler extends OutboxHandler {
  send: jest.Mock<Promise<unknown>, [OutboxEvent, { idempotencyKey: string; attempt: number }]>;
  rollback: jest.Mock;
  optimisticApply: jest.Mock;
  afterAck: jest.Mock;
}

/** Handler whose send resolves unless the test swaps the implementation. Uses the default classification rules. */
export function createTestHandler(type: string, classify?: (error: unknown) => OutboxErrorClass): TestHandler {
  // Mirrors defaultClassify, kept local so tests also exercise explicit classify functions.
  const fallback = (error: unknown): OutboxErrorClass => {
    const status = (error as { response?: { status?: number } }).response?.status;
    if (status === 401) return 'auth';
    if (status !== undefined && status >= 400 && status < 500) return 'permanent';
    if (status !== undefined) return 'retry';
    return (error as { code?: string }).code === 'ERR_NETWORK' ? 'network' : 'retry';
  };
  return {
    type,
    send: jest.fn(async (_event: OutboxEvent, _context: { idempotencyKey: string; attempt: number }): Promise<unknown> => ({ ok: true })),
    rollback: jest.fn(),
    optimisticApply: jest.fn(),
    afterAck: jest.fn(),
    classify: classify ?? fallback,
  };
}

export type EngineFactory = () => Promise<DurableDb>;

let dbCounter = 0;
/** The engines every storage test runs against: memory always, SQLite when node:sqlite exists. */
export function engines(): [string, EngineFactory][] {
  const list: [string, EngineFactory][] = [['memory', () => createMemoryDb()]];
  if (isNodeSqliteAvailable) {
    list.push(['sqlite', () => createSqliteDb({ name: `test-${++dbCounter}.db` })]);
  }
  return list;
}

/** Let queued microtasks/promise chains settle. */
export const flush = async (times = 5): Promise<void> => {
  for (let i = 0; i < times; i++) await Promise.resolve();
};
