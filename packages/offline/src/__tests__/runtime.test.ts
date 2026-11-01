import type { VariantManifest } from '@resgrid/config';

import { createMemoryDb } from '../db/memory-db';
import { createMemoryKvBackendFactory } from '../kv/memory-backend';
import { createMemorySecureKeyStore } from '../kv/secure-store';
import { createStorageAreaRegistry } from '../maintenance/areas';
import { createRetentionRegistry } from '../maintenance/retention';
import { createManualConnectivitySource } from '../outbox/connectivity';
import { createOutboxHandlerRegistry } from '../outbox/registry';
import { createResetRegistry } from '../reset/registry';
import { initOffline } from '../runtime';
import { createTestPayloadCipher } from '../testing';
import { createTestHandler, scopeA } from './helpers';

const manifest = {
  id: 'unit',
  storage: { mmkvId: 'ResgridUnit', keySecret: 'UNIT_MMKV_KEY', extraInstances: ['checklists-ciphertext-v1'] },
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
      getLegacyKey: () => 'legacy-unit',
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
});
