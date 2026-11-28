import { createMemoryDb } from '../../db/memory-db';
import { DurableKv } from '../../kv/durable-kv';
import { createMemoryKvBackend } from '../../kv/memory-backend';
import { setOfflineLogger } from '../../util/logger';
import { beginPendingWipe, clearPendingWipe, finishPendingWipe, markWipePending, PENDING_WIPE_KEY, readPendingWipe } from '../pending-wipe';
import { createResetRegistry } from '../registry';
import { createScopeWiper, WipeIncompleteError } from '../wipe';

const logger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };

beforeAll(() => setOfflineLogger(logger));

afterAll(() => setOfflineLogger(null));

beforeEach(() => jest.clearAllMocks());

const kvWith = (values: Record<string, string> = {}): DurableKv => new DurableKv(createMemoryKvBackend('ResgridUnit', values));

describe('pending wipe mark', () => {
  it('reads back the reason it was marked with, and nothing once cleared', () => {
    const kv = kvWith();
    expect(readPendingWipe(kv)).toBeNull();
    markWipePending(kv, 'server-switch');
    expect(kv.getString(PENDING_WIPE_KEY)).toBe('server-switch');
    expect(readPendingWipe(kv)).toBe('server-switch');
    clearPendingWipe(kv);
    expect(readPendingWipe(kv)).toBeNull();
  });

  it('treats a mark it cannot read as an unfinished sign-out', () => {
    expect(readPendingWipe(kvWith({ [PENDING_WIPE_KEY]: 'clear-all-data' }))).toBe('logout');
    expect(readPendingWipe(kvWith({ [PENDING_WIPE_KEY]: '' }))).toBe('logout');
  });
});

describe('finishPendingWipe (startup)', () => {
  it('does nothing without a mark', async () => {
    const kv = kvWith({ 'calls-storage': '{}' });
    const wiper = createScopeWiper({ registry: createResetRegistry(), kvInstances: () => [kv] });
    const wipeScope = jest.spyOn(wiper, 'wipeScope');
    await expect(finishPendingWipe(kv, wiper)).resolves.toBeNull();
    expect(wipeScope).not.toHaveBeenCalled();
    expect(kv.contains('calls-storage')).toBe(true);
  });

  it('runs the marked wipe over every instance, keeps device preferences and removes the mark', async () => {
    const main = kvWith({
      [PENDING_WIPE_KEY]: 'auth-rejected',
      local: 'de',
      SELECTED_THEME: 'dark',
      'auth-storage': '{"state":{"refreshToken":"r","status":"signedIn"}}',
      'calls-storage': '{"state":{}}',
      'omni-recurring-calls-storage': '{"state":{}}',
      activeUnitId: '"7"',
    });

    const extra = new DurableKv(createMemoryKvBackend('checklists-ciphertext-v1', { 'run-1': 'cipher' }));
    const registry = createResetRegistry();
    const reset = jest.fn();
    registry.registerStoreReset('calls', reset);

    await expect(finishPendingWipe(main, createScopeWiper({ registry, kvInstances: () => [main, extra], variantId: 'unit' }))).resolves.toBe('auth-rejected');

    expect(reset).toHaveBeenCalledWith('auth-rejected');
    expect(main.keys().sort()).toEqual(['SELECTED_THEME', 'local']);
    expect(extra.keys()).toEqual([]);
  });

  it('keeps the mark when the wipe fails, so the next launch tries again', async () => {
    const kv = kvWith({ [PENDING_WIPE_KEY]: 'logout' });
    const wiper = createScopeWiper({ registry: createResetRegistry(), kvInstances: () => [kv] });
    jest.spyOn(wiper, 'wipeScope').mockRejectedValue(new Error('io'));

    await expect(finishPendingWipe(kv, wiper)).resolves.toBeNull();
    expect(readPendingWipe(kv)).toBe('logout');
    expect(logger.error).toHaveBeenCalledWith(expect.objectContaining({ message: 'Failed to finish the pending wipe' }));
  });

  it('keeps the mark when the wipe could not clear a table (it resolves all the same), so the next launch tries again', async () => {
    const kv = kvWith({ [PENDING_WIPE_KEY]: 'logout', 'calls-storage': '{}' });
    const registry = createResetRegistry();
    const db = await createMemoryDb();
    await db.createTable({ name: 'cache_calls', columns: [{ name: 'id', type: 'TEXT', primaryKey: true }] });
    await db.insert('cache_calls', { id: 'c1' });
    registry.registerWipeTable('cache_calls');
    jest.spyOn(db, 'delete').mockRejectedValueOnce(new Error('SQLITE_BUSY'));

    await expect(finishPendingWipe(kv, createScopeWiper({ registry, kvInstances: () => [kv], db }))).rejects.toBeInstanceOf(WipeIncompleteError);
    expect(readPendingWipe(kv)).toBe('logout');
    expect(kv.contains('calls-storage')).toBe(false);
    expect(logger.error).toHaveBeenCalledWith(expect.objectContaining({ message: 'Part of the pending wipe failed; the next launch runs it again' }));
  });

  it('keeps the mark when a store reset fails, but not for a failed teardown', async () => {
    const failing = kvWith({ [PENDING_WIPE_KEY]: 'logout' });
    const resets = createResetRegistry();
    resets.registerStoreReset('broken', () => {
      throw new Error('reset failed');
    });
    await expect(finishPendingWipe(failing, createScopeWiper({ registry: resets, kvInstances: () => [failing] }))).rejects.toBeInstanceOf(WipeIncompleteError);
    expect(readPendingWipe(failing)).toBe('logout');

    const kv = kvWith({ [PENDING_WIPE_KEY]: 'logout' });
    const teardowns = createResetRegistry();
    teardowns.registerTeardown('livekit', () => {
      throw new Error('room gone');
    });
    await expect(finishPendingWipe(kv, createScopeWiper({ registry: teardowns, kvInstances: () => [kv] }))).resolves.toBe('logout');
    expect(readPendingWipe(kv)).toBeNull();
  });
});

describe('beginPendingWipe (what startup registers after the wipe catches up)', () => {
  it('runs the teardowns, store resets and wipe tables registered until it is settled, then removes the mark', async () => {
    const kv = kvWith({ [PENDING_WIPE_KEY]: 'logout' });
    const registry = createResetRegistry();
    const db = await createMemoryDb();
    await db.createTable({ name: 'offline_map_packs', columns: [{ name: 'id', type: 'TEXT', primaryKey: true }] });
    await db.insert('offline_map_packs', { id: 'pack:cell-1' });

    const run = await beginPendingWipe(kv, createScopeWiper({ registry, kvInstances: () => [kv], db }));
    expect(run?.reason).toBe('logout');
    expect(readPendingWipe(kv)).toBe('logout');

    // Startup goes on: the push service's teardown and the map pack manager register after storage opened.
    const clearNotifications = jest.fn();
    const wipePacks = jest.fn();
    registry.registerTeardown('notifications', clearNotifications);
    registry.registerStoreReset('maps.offline-packs', wipePacks);
    registry.registerWipeTable('offline_map_packs');
    await run?.settle();

    expect(clearNotifications).toHaveBeenCalledWith('logout');
    expect(wipePacks).toHaveBeenCalledWith('logout');
    expect(await db.count('offline_map_packs')).toBe(0);
    expect(readPendingWipe(kv)).toBeNull();

    // Settled: what registers from now on (after a sign-in) is not wiped.
    const later = jest.fn();
    registry.registerStoreReset('later', later);
    await run?.settle();
    expect(later).not.toHaveBeenCalled();
  });

  it('settles only once the late work it started has finished', async () => {
    const kv = kvWith({ [PENDING_WIPE_KEY]: 'logout' });
    const registry = createResetRegistry();
    const run = await beginPendingWipe(kv, createScopeWiper({ registry, kvInstances: () => [kv] }));
    let finish: () => void = () => undefined;
    registry.registerTeardown('notifications', () => new Promise<void>((resolve) => (finish = resolve)));

    let settled = false;
    const settling = run?.settle().then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(readPendingWipe(kv)).toBe('logout');

    finish();
    await settling;
    expect(readPendingWipe(kv)).toBeNull();
  });

  it('keeps the mark when startup ends without settling, so the next launch runs it all again', async () => {
    const kv = kvWith({ [PENDING_WIPE_KEY]: 'server-switch' });
    const registry = createResetRegistry();
    const run = await beginPendingWipe(kv, createScopeWiper({ registry, kvInstances: () => [kv] }));
    run?.abandon();

    const late = jest.fn();
    registry.registerTeardown('notifications', late);
    expect(late).not.toHaveBeenCalled();
    expect(readPendingWipe(kv)).toBe('server-switch');
  });

  it('logs a late part that fails and still settles', async () => {
    const kv = kvWith({ [PENDING_WIPE_KEY]: 'logout' });
    const registry = createResetRegistry();
    const run = await beginPendingWipe(kv, createScopeWiper({ registry, kvInstances: () => [kv] }));
    registry.registerTeardown('notifications', async () => {
      throw new Error('notifee unavailable');
    });

    await run?.settle();
    expect(logger.error).toHaveBeenCalledWith(expect.objectContaining({ message: 'A late part of a wipe failed', context: expect.objectContaining({ name: 'notifications' }) }));
    expect(readPendingWipe(kv)).toBeNull();
  });

  it('keeps the mark when a late store reset fails, so the next launch runs it again', async () => {
    const kv = kvWith({ [PENDING_WIPE_KEY]: 'logout' });
    const registry = createResetRegistry();
    const run = await beginPendingWipe(kv, createScopeWiper({ registry, kvInstances: () => [kv] }));
    registry.registerStoreReset('maps.offline-packs', async () => {
      throw new Error('EBUSY');
    });

    await expect(run?.settle()).rejects.toBeInstanceOf(WipeIncompleteError);
    expect(readPendingWipe(kv)).toBe('logout');
    expect(logger.error).toHaveBeenCalledWith(expect.objectContaining({ message: 'A late part of a wipe failed', context: expect.objectContaining({ kind: 'store-reset', name: 'maps.offline-packs' }) }));
  });

  it('keeps the mark when a late wipe table cannot be cleared', async () => {
    const kv = kvWith({ [PENDING_WIPE_KEY]: 'logout' });
    const registry = createResetRegistry();
    const db = await createMemoryDb();
    await db.createTable({ name: 'offline_map_packs', columns: [{ name: 'id', type: 'TEXT', primaryKey: true }] });
    const run = await beginPendingWipe(kv, createScopeWiper({ registry, kvInstances: () => [kv], db }));
    jest.spyOn(db, 'delete').mockRejectedValueOnce(new Error('SQLITE_BUSY'));
    registry.registerWipeTable('offline_map_packs');

    await expect(run?.settle()).rejects.toBeInstanceOf(WipeIncompleteError);
    expect(readPendingWipe(kv)).toBe('logout');
  });
});
