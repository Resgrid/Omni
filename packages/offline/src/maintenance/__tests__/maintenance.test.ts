import { __resetSqliteFake, isNodeSqliteAvailable, sqliteLog } from '../../__tests__/fakes/expo-sqlite';
import { createClock, createTestHandler, DAY, engines, scopeA, sequentialIds, type TestClock } from '../../__tests__/helpers';
import { createSqliteDb } from '../../db/sqlite-db';
import type { DurableDb, TableSpec } from '../../db/types';
import { DurableKv } from '../../kv/durable-kv';
import { createMemoryKvBackend } from '../../kv/memory-backend';
import { createOutbox, type Outbox } from '../../outbox/outbox';
import { createOutboxHandlerRegistry } from '../../outbox/registry';
import { OUTBOX_TABLE } from '../../outbox/schema';
import { registerOutboxRetention } from '../../runtime';
import { createRetentionRegistry, findTablesWithoutRetention, type RetentionRegistry } from '../retention';
import { type MaintenanceReason, type MaintenanceResult, runMaintenance } from '../run-maintenance';
import { createMaintenanceScheduler, LAST_MAINTENANCE_AT_KEY } from '../scheduler';

const callsTable: TableSpec = {
  name: 'cache_calls',
  columns: [
    { name: 'id', type: 'TEXT', primaryKey: true },
    { name: 'json', type: 'TEXT' },
    { name: 'createdAt', type: 'INTEGER', notNull: true },
    { name: 'closed', type: 'INTEGER', default: 0 },
  ],
};
const messagesTable: TableSpec = {
  name: 'cache_messages',
  columns: [
    { name: 'id', type: 'TEXT', primaryKey: true },
    { name: 'body', type: 'TEXT' },
    { name: 'receivedAt', type: 'INTEGER', notNull: true },
  ],
};

afterEach(() => __resetSqliteFake());

describe.each(engines())('runMaintenance (%s)', (_engine, openDb) => {
  let db: DurableDb;
  let clock: TestClock;
  let retention: RetentionRegistry;
  let outbox: Outbox;

  beforeEach(async () => {
    db = await openDb();
    clock = createClock();
    retention = createRetentionRegistry();
    const handlers = createOutboxHandlerRegistry();
    handlers.register(createTestHandler('status.set'));
    outbox = createOutbox({ db, getScope: () => scopeA, registry: handlers, now: clock.now, generateId: sequentialIds() });
    await outbox.init();
    registerOutboxRetention(retention, outbox);
    await db.createTable(callsTable);
    await db.createTable(messagesTable);
  });

  const seedCalls = async (count: number, start = clock.now()) => {
    for (let i = 0; i < count; i++) await db.insert('cache_calls', { id: `c${i}`, json: 'x'.repeat(200), createdAt: start + i, closed: i % 2 });
  };

  it('applies age and row-cap rules, optionally to a subset of rows', async () => {
    retention.register({ table: 'cache_calls', maxAgeMs: 7 * DAY, where: { closed: 1 } });
    retention.register({ table: 'cache_messages', maxRows: 2, timeColumn: 'receivedAt' });
    await seedCalls(4, clock.now() - 8 * DAY);
    for (let i = 0; i < 4; i++) await db.insert('cache_messages', { id: `m${i}`, body: 'b', receivedAt: clock.now() + i });

    const result = await runMaintenance({ db, registry: retention, now: clock.now });

    expect(result.retention).toEqual(
      expect.arrayContaining([
        { table: 'cache_calls', removed: 2 },
        { table: 'cache_messages', removed: 2 },
      ])
    );
    expect((await db.select('cache_calls', { orderBy: [{ column: 'id' }] })).map((row) => row.id)).toEqual(['c0', 'c2']);
    expect((await db.select('cache_messages', { orderBy: [{ column: 'id' }] })).map((row) => row.id)).toEqual(['m2', 'm3']);
  });

  it('runs the outbox hooks: dead letters 14 days / 200, other sessions 7 days', async () => {
    await outbox.enqueue({ type: 'status.set', payload: {} });
    await outbox.enqueue({ type: 'status.set', payload: {}, scope: { ...scopeA, userId: 'someone-else' } });
    await db.update(OUTBOX_TABLE, { id: 'evt-1' }, { state: 'dead', stateChangedAt: clock.now() });
    clock.advance(15 * DAY);

    const result = await runMaintenance({ db, registry: retention, now: clock.now });

    expect(result.hooks).toEqual([
      { id: 'outbox.dead', removed: 1 },
      { id: 'outbox.foreign', removed: 1 },
    ]);
    expect(await db.count(OUTBOX_TABLE)).toBe(0);
  });

  it('prunes the oldest cached rows to meet the budget and never touches unsent writes', async () => {
    retention.register({ table: 'cache_calls' });
    retention.register({ table: 'cache_messages', timeColumn: 'receivedAt' });
    await seedCalls(60, clock.now() - 1_000);
    for (let i = 0; i < 60; i++) await db.insert('cache_messages', { id: `m${i}`, body: 'y'.repeat(200), receivedAt: clock.now() + i });
    for (let i = 0; i < 20; i++) await outbox.enqueue({ type: 'status.set', payload: { pad: 'z'.repeat(300) } });
    const before = (await db.getSize()).usedBytes;

    const result = await runMaintenance({ db, registry: retention, budgetBytes: Math.floor(before * 0.6), pruneBatchSize: 10, now: clock.now });

    expect(result.budget.prunedRows).toBeGreaterThan(0);
    expect(await db.count(OUTBOX_TABLE)).toBe(20);
    // Oldest first: calls (older) go before messages.
    expect(await db.count('cache_calls')).toBeLessThan(60);
    const remainingCalls = await db.count('cache_calls');
    if (remainingCalls > 0) expect(await db.count('cache_messages')).toBe(60);
  });

  it('reports over budget when only unsent writes remain', async () => {
    for (let i = 0; i < 5; i++) await outbox.enqueue({ type: 'status.set', payload: { pad: 'z'.repeat(500) } });
    const result = await runMaintenance({ db, registry: retention, budgetBytes: 1, now: clock.now });
    expect(result.budget).toMatchObject({ prunedRows: 0, overBudget: true });
    expect(await db.count(OUTBOX_TABLE)).toBe(5);
  });

  it('vacuums, optimizes and checkpoints, and records sizes', async () => {
    const vacuum = jest.spyOn(db, 'incrementalVacuum');
    const optimize = jest.spyOn(db, 'optimize');
    const checkpoint = jest.spyOn(db, 'checkpoint');
    const result = await runMaintenance({ db, registry: retention, now: clock.now, reason: 'after-sync' });
    expect(vacuum).toHaveBeenCalled();
    expect(optimize).toHaveBeenCalled();
    expect(checkpoint).toHaveBeenCalled();
    expect(result).toMatchObject({ reason: 'after-sync', vacuumed: true, optimized: true, checkpointed: true, errors: [] });
    expect(result.sizeAfter.usedBytes).toBeGreaterThan(0);
  });

  it('records a failing step and still runs the rest', async () => {
    retention.registerHook({
      id: 'broken',
      apply: async () => {
        throw new Error('x');
      },
    });
    jest.spyOn(db, 'optimize').mockRejectedValue(new Error('locked'));
    const checkpoint = jest.spyOn(db, 'checkpoint');
    const result = await runMaintenance({ db, registry: retention, now: clock.now });
    expect(result.errors).toEqual(['hook:broken', 'optimize']);
    expect(checkpoint).toHaveBeenCalled();
  });
});

(isNodeSqliteAvailable ? describe : describe.skip)('runMaintenance on expo-sqlite', () => {
  it('issues PRAGMA incremental_vacuum, optimize and a WAL checkpoint', async () => {
    const db = await createSqliteDb({ name: 'maintenance-pragmas.db' });
    sqliteLog.length = 0;
    await runMaintenance({ db, registry: createRetentionRegistry() });
    expect(sqliteLog).toEqual(expect.arrayContaining(['PRAGMA incremental_vacuum', 'PRAGMA optimize', 'PRAGMA wal_checkpoint(TRUNCATE)']));
  });
});

describe('retention registry', () => {
  it('refuses age, row-cap or budget rules on tables holding unsent writes', () => {
    const registry = createRetentionRegistry();
    expect(() => registry.register({ table: 'outbox', maxAgeMs: DAY })).toThrow();
    expect(() => registry.register({ table: 'drafts', area: 'outbox', maxRows: 5 })).toThrow();
    expect(() => registry.register({ table: 'uploads', until: 'acknowledged', prunableForBudget: true })).toThrow();
    registry.protectTable('attachments_staging');
    expect(() => registry.register({ table: 'attachments_staging', maxAgeMs: DAY })).toThrow();
    expect(() => registry.register({ table: 'outbox', until: 'acknowledged' })).not.toThrow();
  });

  it('finds tables that declare no retention', async () => {
    const [, open] = engines()[0];
    const db = await open();
    await db.createTable(callsTable);
    await db.createTable(messagesTable);
    const registry = createRetentionRegistry();
    registry.register({ table: 'cache_calls', maxAgeMs: DAY });
    expect(await findTablesWithoutRetention(db, registry)).toEqual(['cache_messages']);
  });
});

describe('maintenance scheduler', () => {
  const result = (finishedAt: number): MaintenanceResult => ({
    reason: 'manual',
    startedAt: finishedAt,
    finishedAt,
    retention: [],
    hooks: [],
    budget: { budgetBytes: null, usedBytesBefore: 0, usedBytesAfter: 0, prunedRows: 0, overBudget: false },
    vacuumed: true,
    optimized: true,
    checkpointed: true,
    sizeBefore: { totalBytes: 0, usedBytes: 0, freeBytes: 0 },
    sizeAfter: { totalBytes: 0, usedBytes: 0, freeBytes: 0 },
    errors: [],
  });

  it('defers the startup run until after first render, once', async () => {
    const clock = createClock();
    const run = jest.fn(async () => result(clock.now()));
    const scheduled: { fn: () => void; ms: number }[] = [];
    const deferred: (() => void)[] = [];
    const scheduler = createMaintenanceScheduler({
      run,
      now: clock.now,
      startupDelayMs: 3_000,
      defer: (task) => deferred.push(task),
      timers: { setTimeout: (fn, ms) => scheduled.push({ fn, ms }), clearTimeout: jest.fn() },
    });
    scheduler.afterFirstRender();
    scheduler.afterFirstRender();
    expect(scheduled).toHaveLength(0);
    deferred.forEach((task) => task());
    expect(scheduled).toEqual([{ fn: expect.any(Function), ms: 3_000 }]);
    scheduled[0].fn();
    await Promise.resolve();
    expect(run).toHaveBeenCalledWith('startup');
  });

  it('runs on foreground only after 24 h, remembering the last run across launches', async () => {
    const clock = createClock();
    const kv = new DurableKv(createMemoryKvBackend('main'));
    const run = jest.fn(async () => result(clock.now()));
    const scheduler = createMaintenanceScheduler({ run, kv, now: clock.now });

    expect(await scheduler.onForeground()).not.toBeNull();
    expect(kv.getNumber(LAST_MAINTENANCE_AT_KEY)).toBe(clock.now());
    clock.advance(23 * 60 * 60_000);
    expect(await createMaintenanceScheduler({ run, kv, now: clock.now }).onForeground()).toBeNull();
    clock.advance(2 * 60 * 60_000);
    expect(await scheduler.onForeground()).not.toBeNull();
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('shares one run between concurrent triggers and runs after each sync', async () => {
    const clock = createClock();
    let resolve: (() => void) | null = null;
    const run = jest.fn(
      (reason: string) =>
        new Promise<MaintenanceResult>((done) => {
          resolve = () => done({ ...result(clock.now()), reason: reason as MaintenanceReason });
        })
    );
    const scheduler = createMaintenanceScheduler({ run, now: clock.now });
    const first = scheduler.afterSync();
    const second = scheduler.runNow();
    (resolve as unknown as () => void)();
    await Promise.all([first, second]);
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith('after-sync');
  });
});
