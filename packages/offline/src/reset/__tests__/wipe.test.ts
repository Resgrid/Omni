import { createClock, createTestHandler, scopeA, scopeB, sequentialIds } from '../../__tests__/helpers';
import { createMemoryDb } from '../../db/memory-db';
import type { DurableDb } from '../../db/types';
import { DurableKv } from '../../kv/durable-kv';
import { createMemoryKvBackend } from '../../kv/memory-backend';
import { ConfirmationRequiredError, createOutbox, type Outbox } from '../../outbox/outbox';
import { createOutboxHandlerRegistry } from '../../outbox/registry';
import { setOfflineLogger } from '../../util/logger';
import { createResetRegistry, defaultResetRegistry, getRegisteredStoreCount, getRegisteredStoreNames, registerStoreReset, type ResetRegistry, unregisterStoreReset } from '../registry';
import { createScopeWiper } from '../wipe';

const logger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
beforeAll(() => setOfflineLogger(logger));
afterAll(() => setOfflineLogger(null));
beforeEach(() => jest.clearAllMocks());

const legacyValues = () => ({
  local: 'de',
  SELECTED_THEME: 'dark',
  baseUrl: '"https://api.resgrid.com/api/v4"',
  unitDeviceUuid: '"device-1"',
  IS_FIRST_TIME: false,
  NAVIGATION_APP: '"waze"',
  KEEP_ALIVE_ENABLED: true,
  authResponse: '{"access_token":"t"}',
  'auth-storage': '{"state":{}}',
  'core-storage': '{"state":{}}',
  api_cache_scope: '{"userId":"u"}',
  api_cache_units: '{}',
  activeCallId: '"9"',
});

describe('store reset registry (Responder registerStoreReset)', () => {
  afterEach(() => defaultResetRegistry.clear());

  it('registers, lists, counts and unregisters stores', () => {
    registerStoreReset('testStore', jest.fn());
    expect(getRegisteredStoreNames()).toContain('testStore');
    expect(getRegisteredStoreCount()).toBe(1);
    unregisterStoreReset('testStore');
    expect(getRegisteredStoreNames()).not.toContain('testStore');
  });

  it('logs registrations', () => {
    registerStoreReset('anotherStore', jest.fn());
    expect(logger.debug).toHaveBeenCalledWith({ message: 'Store registered for reset', context: { storeName: 'anotherStore' } });
  });

  it('returns an unregister function that ignores a newer registration of the same name', () => {
    const first = registerStoreReset('dup', jest.fn());
    const second = jest.fn();
    registerStoreReset('dup', second);
    first();
    expect(getRegisteredStoreNames()).toEqual(['dup']);
  });
});

describe('wipeScope', () => {
  let registry: ResetRegistry;
  let main: DurableKv;
  let auth: DurableKv;
  let db: DurableDb;
  let outbox: Outbox;
  let scope = scopeA;

  beforeEach(async () => {
    registry = createResetRegistry();
    main = new DurableKv(createMemoryKvBackend('ResgridDispatch', legacyValues()));
    auth = new DurableKv(createMemoryKvBackend('auth-storage', { 'auth-storage': '{"state":{"token":"t"}}' }));
    db = await createMemoryDb();
    const handlers = createOutboxHandlerRegistry();
    handlers.register(createTestHandler('status.set'));
    outbox = createOutbox({ db, getScope: () => scope, registry: handlers, now: createClock().now, generateId: sequentialIds() });
    await outbox.init();
    await db.createTable({ name: 'cache_calls', columns: [{ name: 'id', type: 'TEXT', primaryKey: true }] });
    await db.insert('cache_calls', { id: 'c1' });
    registry.registerWipeTable('cache_calls');
    scope = scopeA;
  });

  const wiper = (variantId: 'dispatch' | 'bigboard' = 'dispatch') => createScopeWiper({ registry, kvInstances: () => [main, auth], db, outbox, variantId });

  it('runs teardowns first, then store resets, isolating failures', async () => {
    const order: string[] = [];
    registry.registerTeardown('signalr', () => {
      order.push('teardown:signalr');
    });
    registry.registerTeardown('livekit', () => {
      throw new Error('room gone');
    });
    registry.registerStoreReset('calls', () => {
      order.push('store:calls');
    });
    registry.registerStoreReset('broken', () => {
      throw new Error('reset failed');
    });
    registry.registerStoreReset('units', async () => {
      order.push('store:units');
    });

    const report = await wiper().wipeScope('logout');

    expect(order).toEqual(['teardown:signalr', 'store:calls', 'store:units']);
    expect(report.teardowns).toEqual({ ok: ['signalr'], failed: ['livekit'] });
    expect(report.stores).toEqual({ ok: ['calls', 'units'], failed: ['broken'] });
    expect(logger.error).toHaveBeenCalledWith(expect.objectContaining({ message: 'Failed to reset store', context: expect.objectContaining({ storeName: 'broken' }) }));
  });

  it('passes the reason to every reset', async () => {
    const reset = jest.fn();
    registry.registerStoreReset('calls', reset);
    await wiper().wipeScope('server-switch');
    expect(reset).toHaveBeenCalledWith('server-switch');
  });

  it('keeps device preferences and clears session, caches and working state in every instance', async () => {
    const report = await wiper().wipeScope('logout');
    expect(main.keys().sort()).toEqual(['IS_FIRST_TIME', 'KEEP_ALIVE_ENABLED', 'NAVIGATION_APP', 'SELECTED_THEME', 'baseUrl', 'local', 'unitDeviceUuid']);
    expect(auth.keys()).toEqual([]);
    expect(report.kv.ResgridDispatch).toEqual({ removed: 6, preserved: 7 });
    expect(report.tablesCleared).toEqual(['cache_calls']);
    expect(await db.count('cache_calls')).toBe(0);
  });

  it("keeps BigBoard's widget layouts", async () => {
    main.set('dashboard-widgets', '{"state":{"widgets":[]}}');
    main.set('widget-settings', '{}');
    await wiper('bigboard').wipeScope('logout');
    expect(main.contains('dashboard-widgets')).toBe(true);
    expect(main.contains('widget-settings')).toBe(true);
  });

  it('honours keys registered by features, globally or per instance', async () => {
    registry.registerPreservedKeys(['feature-pref']);
    registry.registerPreservedKeys(['auth-only'], { instanceId: 'auth-storage' });
    main.set('feature-pref', '1');
    main.set('auth-only', '1');
    auth.set('auth-only', '1');
    await wiper().wipeScope('logout');
    expect(main.contains('feature-pref')).toBe(true);
    expect(main.contains('auth-only')).toBe(false);
    expect(auth.contains('auth-only')).toBe(true);
  });

  it('keeps the session across a department switch', async () => {
    await wiper().wipeScope('department-switch');
    expect(main.contains('authResponse')).toBe(true);
    expect(main.contains('auth-storage')).toBe(true);
    expect(main.contains('core-storage')).toBe(false);
    expect(main.contains('api_cache_units')).toBe(false);
    expect(auth.contains('auth-storage')).toBe(true);
  });

  it('holds unsent writes by default and reports how many', async () => {
    await outbox.enqueue({ type: 'status.set', payload: {} });
    const report = await wiper().wipeScope('logout', { scope: scopeA });
    expect(report.unsentWrites).toEqual({ policy: 'hold', discarded: 0, held: 1 });
    expect(await outbox.countUnsent(null)).toBe(1);
  });

  it('discards unsent writes only with confirmation, and only for the session left', async () => {
    await outbox.enqueue({ type: 'status.set', payload: {} });
    await outbox.enqueue({ type: 'status.set', payload: {}, scope: scopeB });
    await expect(wiper().wipeScope('logout', { scope: scopeA, unsentWrites: 'discard' })).rejects.toBeInstanceOf(ConfirmationRequiredError);
    const report = await wiper().wipeScope('logout', { scope: scopeA, unsentWrites: 'discard', confirmedDiscard: true });
    expect(report.unsentWrites.discarded).toBe(1);
    expect(await outbox.countUnsent(null)).toBe(1);
  });

  it('always discards on clear-all-data (with confirmation)', async () => {
    await outbox.enqueue({ type: 'status.set', payload: {} });
    await outbox.enqueue({ type: 'status.set', payload: {}, scope: scopeB });
    await expect(wiper().wipeScope('clear-all-data')).rejects.toBeInstanceOf(ConfirmationRequiredError);
    const report = await wiper().wipeScope('clear-all-data', { confirmedDiscard: true });
    expect(report.unsentWrites).toEqual({ policy: 'discard', discarded: 2, held: 0 });
  });

  it('exposes the preserve list per reason', () => {
    const keys = wiper().preservedKeysFor('department-switch', 'ResgridDispatch');
    expect(keys.has('local')).toBe(true);
    expect(keys.has('authResponse')).toBe(true);
    expect(wiper().preservedKeysFor('logout', 'ResgridDispatch').has('authResponse')).toBe(false);
  });
});
