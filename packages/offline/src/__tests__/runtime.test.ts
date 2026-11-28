import type { VariantManifest } from '@resgrid/config';

import { createMemoryDb } from '../db/memory-db';
import { createMemoryKvBackendFactory } from '../kv/memory-backend';
import { createMemorySecureKeyStore } from '../kv/secure-store';
import { createStorageAreaRegistry } from '../maintenance/areas';
import { createRetentionRegistry } from '../maintenance/retention';
import { createManualConnectivitySource } from '../outbox/connectivity';
import { createOutboxHandlerRegistry } from '../outbox/registry';
import { markWipePending, PENDING_WIPE_KEY } from '../reset/pending-wipe';
import { createResetRegistry } from '../reset/registry';
import { initOffline } from '../runtime';
import { createTestPayloadCipher } from '../testing';
import { createTestHandler, scopeA } from './helpers';

const manifest = {
  id: 'unit',
  storage: { mmkvId: 'ResgridUnit', extraInstances: ['checklists-ciphertext-v1'] },
  offline: { cacheTtl: 'long', storageBudgetMb: 200, mapPacks: 'full' },
} as unknown as VariantManifest;

describe('initOffline', () => {
  it('wires storage, outbox, wipe, maintenance and sync for a variant', async () => {
    const outboxRegistry = createOutboxHandlerRegistry();
    const handler = createTestHandler('status.set');
    outboxRegistry.register(handler);
    const connectivity = createManualConnectivitySource(true);
    let scope: typeof scopeA | null = scopeA;

    const runtime = await initOffline({
      manifest,
      getScope: () => scope,
      storage: { platform: 'native', backendFactory: createMemoryKvBackendFactory(), secureStore: createMemorySecureKeyStore() },
      db: await createMemoryDb(),
      cipher: createTestPayloadCipher(),
      connectivity,
      registries: { outbox: outboxRegistry, reset: createResetRegistry(), retention: createRetentionRegistry(), areas: createStorageAreaRegistry() },
      startTriggers: false,
    });

    expect(runtime.schema).toEqual([expect.objectContaining({ module: 'outbox', status: 'created' })]);
    expect(Array.from(runtime.storage.instances.keys())).toEqual(['ResgridUnit', 'checklists-ciphertext-v1']);

    runtime.storage.main.set('local', 'fr');
    runtime.storage.main.set('authResponse', '{}');
    runtime.apiCache.setScope({ userId: 'user-a', departmentId: '1' });
    runtime.apiCache.set('units', [1]);

    await runtime.outbox.enqueue({ type: 'status.set', payload: { s: 1 } });
    runtime.sync.setReconnectSequence({ drainOutbox: () => runtime.outbox.drain() });
    expect((await runtime.sync.onReconnect()).ok).toBe(true);
    expect(handler.send).toHaveBeenCalledTimes(1);

    const report = await runtime.storageManager.getStorageReport();
    expect(report.budget.budgetBytes).toBe(200 * 1024 * 1024);
    expect(report.lastSyncAt).not.toBeNull();

    scope = null;
    await runtime.wiper.wipeScope('logout');
    expect(runtime.storage.main.getString('local')).toBe('fr');
    expect(runtime.storage.main.contains('authResponse')).toBe(false);
    expect(runtime.apiCache.keys()).toEqual([]);

    runtime.dispose();
  });

  it('finishes a sign-out wipe the previous launch was killed in before anything reads storage', async () => {
    const backendFactory = createMemoryKvBackendFactory();
    const secureStore = createMemorySecureKeyStore();
    const reset = createResetRegistry();
    const storeReset = jest.fn();
    reset.registerStoreReset('calls', storeReset);

    const launch = async () =>
      initOffline({
        manifest,
        getScope: () => null,
        storage: { platform: 'native', backendFactory, secureStore },
        db: await createMemoryDb(),
        cipher: createTestPayloadCipher(),
        connectivity: createManualConnectivitySource(true),
        registries: { outbox: createOutboxHandlerRegistry(), reset, retention: createRetentionRegistry(), areas: createStorageAreaRegistry() },
        startTriggers: false,
      });

    // The killed run: signed out, its wipe marked, the member's stores still on disk.
    const killed = await launch();
    killed.storage.main.set('local', 'fr');
    killed.storage.main.set('calls-storage', '{"state":{"calls":[1]}}');
    killed.storage.main.set('auth-storage', '{"state":{"status":"signedOut"}}');
    markWipePending(killed.storage.main, 'logout');
    killed.dispose();
    expect(storeReset).not.toHaveBeenCalled();

    const next = await launch();
    expect(storeReset).toHaveBeenCalledWith('logout');
    expect(next.storage.main.getString('local')).toBe('fr');
    expect(next.storage.main.contains('calls-storage')).toBe(false);
    expect(next.storage.main.contains('auth-storage')).toBe(false);

    // Startup goes on registering (the push teardown, offline map packs): each catches up with the wipe it missed, and
    // the mark stays until startup is done, so a launch that dies here runs it all again.
    const lateTeardown = jest.fn();
    reset.registerTeardown('notifications', lateTeardown);
    expect(lateTeardown).toHaveBeenCalledWith('logout');
    expect(next.storage.main.getString(PENDING_WIPE_KEY)).toBe('logout');

    await next.settlePendingWipe();
    expect(next.storage.main.contains(PENDING_WIPE_KEY)).toBe(false);
    next.dispose();
  });
});
