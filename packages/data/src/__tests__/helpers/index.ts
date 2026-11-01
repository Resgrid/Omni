import fs from 'node:fs';
import path from 'node:path';

import { type ApiContext, ApiError } from '@resgrid/api';
import { parseVariantManifest, type VariantId, type VariantManifest } from '@resgrid/config';
import { createOutbox, type DbRow, DurableKv, type OfflineScope, type Outbox, OUTBOX_TABLE, type OutboxHandler, type PayloadCipher } from '@resgrid/offline';
import { createManualConnectivitySource, createMemoryDb, createMemoryKvBackend, createOutboxHandlerRegistry } from '@resgrid/offline/testing';

import { setDataStorage } from '../../core/persist';
import { type DataSessionScope, resetDataRuntimeForTests, setDataApiContext, setDataClock, setDataOutbox, setDataSessionScopeProvider, setDataVariant } from '../../core/runtime';
import { registerDataOutboxHandlers } from '../../offline-scope/register';

export const manifest = (id: VariantId): VariantManifest => parseVariantManifest(JSON.parse(fs.readFileSync(path.resolve(__dirname, `../../../../../apps/omni/variants/${id}/variant.json`), 'utf8')));

export const scopeA: DataSessionScope = { server: 'https://api.resgrid.com', departmentId: 1, userId: 'user-a', unitId: 10, displayName: 'Alex Crew' };

export const ok = <T>(Data: T, Status = 'success') => ({ Data, Status });
export const notFound = <T>(Data: T) => ({ Data, Status: 'not_found' });
export const failure = () => ({ Data: null, Status: 'failure' });

export const networkError = () => new ApiError({ kind: 'network', message: 'Network error' });
export const httpError = (status: number) => new ApiError({ kind: 'http', status });

export const fakeApiContext = { http: {} } as unknown as ApiContext;

export interface TestClock {
  now: () => number;
  advance(ms: number): void;
}

export const createClock = (start = Date.UTC(2026, 9, 31, 12, 0, 0)): TestClock => {
  let value = start;
  return {
    now: () => value,
    advance: (ms) => {
      value += ms;
    },
  };
};

export interface DataTestRuntime {
  outbox: Outbox;
  kv: DurableKv;
  connectivity: ReturnType<typeof createManualConnectivitySource>;
  clock: TestClock;
  rows: () => Promise<DbRow[]>;
  setScope: (scope: DataSessionScope | null) => void;
}

let idCounter = 0;

/**
 * A real @resgrid/offline outbox on the in-memory DB, with the variant's data handlers registered, an
 * in-memory KV for persisted stores and a manual connectivity switch. API functions are jest-mocked per test.
 */
export async function createDataTestRuntime(options: { variant?: VariantId; handlers?: OutboxHandler[]; online?: boolean; scope?: DataSessionScope | null; cipher?: PayloadCipher } = {}): Promise<DataTestRuntime> {
  resetDataRuntimeForTests();
  const clock = createClock();
  setDataClock(clock.now);
  let scope: DataSessionScope | null = options.scope === undefined ? scopeA : options.scope;
  const variant = manifest(options.variant ?? 'unit');
  setDataVariant(variant);
  setDataApiContext(fakeApiContext);
  setDataSessionScopeProvider(() => scope);

  const registry = createOutboxHandlerRegistry();
  if (options.handlers) options.handlers.forEach((handler) => registry.register(handler));
  else registerDataOutboxHandlers(variant, registry);

  const db = await createMemoryDb();
  const connectivity = createManualConnectivitySource(options.online !== false);
  const outbox = createOutbox({
    db,
    registry,
    connectivity,
    getScope: (): OfflineScope | null => scope,
    now: clock.now,
    generateId: () => `evt-${++idCounter}`,
    cipher: options.cipher ?? null,
  });
  await outbox.init();
  setDataOutbox(outbox);

  const kv = new DurableKv(createMemoryKvBackend(`test-${idCounter}`));
  await setDataStorage(kv);

  return {
    outbox,
    kv,
    connectivity,
    clock,
    rows: () => db.select(OUTBOX_TABLE, { orderBy: [{ column: 'seq' }] }),
    setScope: (next) => {
      scope = next;
    },
  };
}

/** Lets pending promise chains (afterAck refreshes) settle. */
export const flush = async (times = 5): Promise<void> => {
  for (let i = 0; i < times; i++) await new Promise((resolve) => setImmediate(resolve));
};

/** Reads a persisted store blob from the test KV. */
export const persisted = (kv: DurableKv, name: string): { state: Record<string, unknown>; version?: number } | null => {
  const raw = kv.getString(name);
  return raw ? (JSON.parse(raw) as { state: Record<string, unknown>; version?: number }) : null;
};
