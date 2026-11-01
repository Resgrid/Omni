import { createClock, createTestHandler, scopeA, scopeB, sequentialIds, type TestClock } from '../../__tests__/helpers';
import { createDurableApiCache, type DurableApiCache } from '../../api-cache/durable-api-cache';
import { createMemoryDb } from '../../db/memory-db';
import type { DurableDb } from '../../db/types';
import { DurableKv } from '../../kv/durable-kv';
import { createMemoryKvBackend } from '../../kv/memory-backend';
import { createOutbox, type Outbox } from '../../outbox/outbox';
import { createOutboxHandlerRegistry } from '../../outbox/registry';
import { OUTBOX_TABLE } from '../../outbox/schema';
import { createResetRegistry } from '../../reset/registry';
import { createScopeWiper } from '../../reset/wipe';
import { registerOutboxRetention } from '../../runtime';
import { createStorageAreaRegistry, type StorageAreaRegistry } from '../areas';
import { createRetentionRegistry, type RetentionRegistry } from '../retention';
import { budgetBytesFromManifest, createStorageManager, type StorageManager } from '../storage-manager';

describe('StorageManager (Settings → Advanced → Storage & sync)', () => {
  let db: DurableDb;
  let clock: TestClock;
  let main: DurableKv;
  let outbox: Outbox;
  let retention: RetentionRegistry;
  let areas: StorageAreaRegistry;
  let apiCache: DurableApiCache;
  let manager: StorageManager;
  let signOut: jest.Mock;
  const mapPacks = { size: 5_000_000, clear: jest.fn(async () => undefined) };
  const attachments = { size: 1_000, clear: jest.fn(async () => undefined) };

  beforeEach(async () => {
    jest.clearAllMocks();
    db = await createMemoryDb();
    clock = createClock();
    main = new DurableKv(createMemoryKvBackend('ResgridUnit', { local: 'en', SELECTED_THEME: 'light', authResponse: '{"t":1}', baseUrl: '"https://x"' }));
    const handlers = createOutboxHandlerRegistry();
    handlers.register(createTestHandler('status.set'));
    outbox = createOutbox({ db, getScope: () => scopeA, registry: handlers, now: clock.now, generateId: sequentialIds() });
    await outbox.init();
    retention = createRetentionRegistry();
    registerOutboxRetention(retention, outbox);
    retention.register({ table: 'cache_calls', area: 'cache', maxAgeMs: 30 * 24 * 60 * 60_000 });
    retention.register({ table: 'ws_units', area: 'working-set' });
    await db.createTable({
      name: 'cache_calls',
      columns: [
        { name: 'id', type: 'TEXT', primaryKey: true },
        { name: 'createdAt', type: 'INTEGER' },
      ],
    });
    await db.createTable({
      name: 'ws_units',
      columns: [
        { name: 'id', type: 'TEXT', primaryKey: true },
        { name: 'createdAt', type: 'INTEGER' },
      ],
    });
    await db.createTable({ name: 'mystery', columns: [{ name: 'id', type: 'TEXT', primaryKey: true }] });
    for (let i = 0; i < 3; i++) await db.insert('cache_calls', { id: `c${i}`, createdAt: clock.now() });
    await db.insert('ws_units', { id: 'u1', createdAt: clock.now() });
    areas = createStorageAreaRegistry();
    areas.register({ id: 'map-packs', area: 'map-packs', getSizeBytes: async () => mapPacks.size, clear: mapPacks.clear, clearWithCachedData: true });
    areas.register({ id: 'attachments', area: 'attachments', getSizeBytes: async () => attachments.size, clear: attachments.clear });
    apiCache = createDurableApiCache({ kv: main, now: clock.now });
    apiCache.setScope({ userId: 'u', departmentId: '1' });
    apiCache.set('units', ['a', 'b']);
    signOut = jest.fn(async () => undefined);
    const resetRegistry = createResetRegistry();
    manager = createStorageManager({
      db,
      outbox,
      kvInstances: () => [main],
      stateKv: main,
      retention,
      areas,
      apiCache,
      budgetBytes: budgetBytesFromManifest({ storageBudgetMb: 200 }),
      wiper: createScopeWiper({ registry: resetRegistry, kvInstances: () => [main], db, outbox, variantId: 'unit' }),
      getLastSyncAt: () => 111,
      getLastHydrationAt: () => 222,
      getFreeDeviceBytes: async () => 9_999,
      signOut,
      now: clock.now,
    });
  });

  it('reports sizes by area and table, pending items, sync and maintenance times', async () => {
    await outbox.enqueue({ type: 'status.set', payload: {} });
    await outbox.enqueue({ type: 'status.set', payload: {} });
    await outbox.enqueue({ type: 'status.set', payload: {}, scope: scopeB });
    await db.update(OUTBOX_TABLE, { id: 'evt-2' }, { state: 'dead' });
    clock.advance(2 * 60 * 60_000);
    await manager.runMaintenance('manual');

    const report = await manager.getStorageReport();

    expect(report.engine).toBe('memory');
    expect(report.sizes.byTable).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ table: 'cache_calls', area: 'cache', rows: 3 }),
        expect.objectContaining({ table: 'ws_units', area: 'working-set', rows: 1 }),
        expect.objectContaining({ table: OUTBOX_TABLE, area: 'outbox', rows: 3 }),
        expect.objectContaining({ table: 'mystery', area: 'unclassified', rows: 0 }),
        expect.objectContaining({ table: '_resgrid_schema', area: 'system' }),
      ])
    );
    expect(report.sizes.cachedDataBytes).toBe(report.sizes.byArea.cache + report.sizes.byArea['working-set'] + apiCache.sizeBytes());
    expect(report.sizes.outboxBytes).toBeGreaterThan(0);
    expect(report.sizes.mapPacksBytes).toBe(5_000_000);
    expect(report.sizes.attachmentsBytes).toBe(1_000);
    expect(report.sizes.freeDeviceBytes).toBe(9_999);
    expect(report.sizes.keyValueBytes).toBeGreaterThan(0);
    expect(report.budget).toEqual({ budgetBytes: 200 * 1024 * 1024, usedBytes: expect.any(Number), overBudget: false });
    expect(report.pending).toMatchObject({ unsent: 1, pending: 1, dead: 1, held: 1, stuck: 1, oldestUnsentAt: clock.now() - 2 * 60 * 60_000 });
    expect(report.items.map((item) => [item.id, item.state])).toEqual([
      ['evt-1', 'pending'],
      ['evt-2', 'dead'],
    ]);
    expect(report.lastSyncAt).toBe(111);
    expect(report.lastHydrationAt).toBe(222);
    expect(report.lastMaintenanceAt).toBe(clock.now());
    expect(report.lastMaintenance).toMatchObject({ reason: 'manual', failedSteps: 0 });
  });

  it('gives support diagnostics with counts and sizes only', async () => {
    await outbox.enqueue({ type: 'status.set', payload: { note: 'secret note' } });
    const diagnostics = await manager.getDiagnosticsSummary();
    expect(diagnostics.itemTypes).toEqual({ 'status.set': 1 });
    const text = JSON.stringify(diagnostics);
    expect(text).not.toContain('evt-1');
    expect(text).not.toContain('secret note');
    expect(text).not.toContain('user-a');
  });

  it('clears cached data but keeps the session, unsent changes and attachment staging', async () => {
    await outbox.enqueue({ type: 'status.set', payload: {} });
    const result = await manager.clearCachedData();
    expect(result).toEqual({ tablesCleared: ['cache_calls', 'ws_units'], rowsRemoved: 4, areasCleared: ['map-packs'], apiCacheCleared: true });
    expect(await db.count('cache_calls')).toBe(0);
    expect(await outbox.countUnsent(null)).toBe(1);
    expect(main.getJSON('authResponse')).toEqual({ t: 1 });
    expect(apiCache.keys()).toEqual([]);
    expect(mapPacks.clear).toHaveBeenCalled();
    expect(attachments.clear).not.toHaveBeenCalled();
  });

  it('clear all local data asks for confirmation with the unsent count first, changing nothing', async () => {
    await outbox.enqueue({ type: 'status.set', payload: {} });
    await outbox.enqueue({ type: 'status.set', payload: {}, scope: scopeB });
    expect(await manager.clearAllLocalData()).toEqual({ status: 'confirmation-required', unsentCount: 2 });
    expect(await outbox.countUnsent(null)).toBe(2);
    expect(signOut).not.toHaveBeenCalled();
    expect(await db.count('cache_calls')).toBe(3);
  });

  it('clear all local data, confirmed: signs out first, wipes everything but device preferences', async () => {
    await outbox.enqueue({ type: 'status.set', payload: {} });
    const order: string[] = [];
    signOut.mockImplementation(async () => {
      order.push(`signOut:auth=${main.contains('authResponse')}`);
    });

    const result = await manager.clearAllLocalData({ confirmed: true });

    expect(result).toMatchObject({ status: 'cleared', discardedUnsent: 1, signOutFailed: false, areasCleared: ['map-packs', 'attachments'] });
    expect(order).toEqual(['signOut:auth=true']);
    expect(await outbox.countUnsent(null)).toBe(0);
    expect(await db.count('cache_calls')).toBe(0);
    expect(await db.count('ws_units')).toBe(0);
    expect(main.keys().sort()).toEqual(['SELECTED_THEME', 'baseUrl', 'local']);
  });

  it('still clears when sign-out fails (offline)', async () => {
    signOut.mockRejectedValue(new Error('offline'));
    expect(await manager.clearAllLocalData({ confirmed: true })).toMatchObject({ status: 'cleared', signOutFailed: true });
  });
});
