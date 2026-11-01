import { getActiveVariant, type VariantManifest } from '@resgrid/config';

import { apiCacheTtlFromManifest, createDurableApiCache, type DurableApiCache } from './api-cache/durable-api-cache';
import { openDurableDb, type OpenDurableDbOptions } from './db/open-db';
import { applySchema } from './db/schema';
import type { DurableDb, SchemaModule, SchemaResult } from './db/types';
import type { LegacyKeyProvider } from './kv/keys';
import { openVariantStorage, type OpenVariantStorageOptions, type VariantStorage } from './kv/open-storage';
import { KV_PLATFORM } from './kv/platform';
import { createExpoSecureKeyStore } from './kv/secure-store';
import { defaultStorageAreaRegistry, type StorageAreaRegistry } from './maintenance/areas';
import { defaultRetentionRegistry, RETENTION_DEFAULTS, type RetentionRegistry } from './maintenance/retention';
import { budgetBytesFromManifest, createStorageManager, type StorageManager, type StorageManagerOptions } from './maintenance/storage-manager';
import { createAesGcmPayloadCipher, type PayloadCipher } from './outbox/cipher';
import { type ConnectivitySource, createNetInfoConnectivitySource } from './outbox/connectivity';
import { createOutbox, type Outbox, type OutboxOptions } from './outbox/outbox';
import { defaultOutboxHandlerRegistry, type OutboxHandlerRegistry } from './outbox/registry';
import { OUTBOX_DROPPED_TABLE, OUTBOX_TABLE, outboxSchemaModule } from './outbox/schema';
import { defaultResetRegistry, type ResetRegistry } from './reset/registry';
import { createScopeWiper, type ScopeWiper } from './reset/wipe';
import { createSyncOrchestrator, type SyncOrchestrator } from './sync/orchestrator';
import { type OfflineLogger, setOfflineLogger } from './util/logger';
import type { OfflineScope } from './util/scope';

export interface InitOfflineOptions {
  /** Defaults to `getActiveVariant()`. */
  manifest?: VariantManifest;
  getLegacyKey: LegacyKeyProvider;
  /** The signed-in session (server + department + user + unit), or null. */
  getScope: () => OfflineScope | null;
  logger?: OfflineLogger;
  storage?: Omit<OpenVariantStorageOptions, 'manifest' | 'getLegacyKey'>;
  /** Defaults to `openDurableDb()` (expo-sqlite native, memory engine on web until spike S7). */
  db?: DurableDb;
  dbOptions?: OpenDurableDbOptions;
  /** Feature schema modules to create/migrate along with the outbox. */
  schemaModules?: SchemaModule[];
  /** Defaults to AES-GCM with a SecureStore key on native; none on web (protected writes are refused there). */
  cipher?: PayloadCipher | null;
  /** Defaults to NetInfo. */
  connectivity?: ConnectivitySource;
  outbox?: Partial<Omit<OutboxOptions, 'db' | 'getScope' | 'connectivity' | 'cipher' | 'registry'>>;
  registries?: { outbox?: OutboxHandlerRegistry; reset?: ResetRegistry; retention?: RetentionRegistry; areas?: StorageAreaRegistry };
  storageManager?: Pick<StorageManagerOptions, 'signOut' | 'getFreeDeviceBytes' | 'scheduler'>;
  /** Start reconnect/timer drain triggers (default true). */
  startTriggers?: boolean;
}

export interface OfflineRuntime {
  manifest: VariantManifest;
  storage: VariantStorage;
  db: DurableDb;
  schema: SchemaResult[];
  outbox: Outbox;
  apiCache: DurableApiCache;
  wiper: ScopeWiper;
  storageManager: StorageManager;
  sync: SyncOrchestrator;
  connectivity: ConnectivitySource | null;
  dispose(): void;
}

/** Registers the plan §8.2a defaults for the outbox tables. Idempotent per registry. */
export function registerOutboxRetention(registry: RetentionRegistry, outbox: Outbox): () => void {
  const disposers = [
    registry.register({ table: OUTBOX_TABLE, area: 'outbox', until: 'acknowledged' }),
    registry.register({ table: OUTBOX_DROPPED_TABLE, area: 'system', timeColumn: 'droppedAt', ...RETENTION_DEFAULTS.outboxDropRecords }),
    registry.registerHook({ id: 'outbox.dead', apply: () => outbox.pruneDead(RETENTION_DEFAULTS.outboxDead) }),
    registry.registerHook({ id: 'outbox.foreign', apply: () => outbox.pruneForeign(RETENTION_DEFAULTS.outboxForeignHoldMs) }),
  ];
  return () => disposers.forEach((dispose) => dispose());
}

/**
 * Composition root for the app shell: opens the frozen MMKV instances, the offline database, the
 * outbox, API cache, wiper, storage manager and sync orchestrator for the active variant.
 */
export async function initOffline(options: InitOfflineOptions): Promise<OfflineRuntime> {
  if (options.logger) setOfflineLogger(options.logger);
  const manifest = options.manifest ?? getActiveVariant();
  const registries = {
    outbox: options.registries?.outbox ?? defaultOutboxHandlerRegistry,
    reset: options.registries?.reset ?? defaultResetRegistry,
    retention: options.registries?.retention ?? defaultRetentionRegistry,
    areas: options.registries?.areas ?? defaultStorageAreaRegistry,
  };

  const storage = await openVariantStorage({ ...options.storage, manifest, getLegacyKey: options.getLegacyKey });
  const db = options.db ?? (await openDurableDb(options.dbOptions));
  const schema = await applySchema(db, [outboxSchemaModule, ...(options.schemaModules ?? [])]);

  const platform = options.storage?.platform ?? KV_PLATFORM;
  const secureStore = options.storage?.secureStore ?? (platform === 'native' ? createExpoSecureKeyStore() : null);
  const cipher = options.cipher !== undefined ? options.cipher : secureStore ? createAesGcmPayloadCipher({ secureStore }) : null;
  const ownsConnectivity = options.connectivity === undefined;
  const connectivity = options.connectivity ?? createNetInfoConnectivitySource();

  const outbox = createOutbox({ ...options.outbox, db, getScope: options.getScope, connectivity, cipher, registry: registries.outbox });
  await outbox.init();
  const disposeRetention = registerOutboxRetention(registries.retention, outbox);

  const apiCache = createDurableApiCache({ kv: storage.main, defaultTtlMs: apiCacheTtlFromManifest(manifest.offline) });
  const disposeApiCacheReset = registries.reset.registerStoreReset('offline.api-cache', () => apiCache.reset());
  const disposeApiCachePrune = registries.retention.registerHook({ id: 'api-cache.prune', apply: async () => apiCache.prune() });

  const wiper = createScopeWiper({ registry: registries.reset, kvInstances: () => storage.all(), db, outbox, variantId: manifest.id });
  const sync = createSyncOrchestrator({ kv: storage.main });

  const storageManager = createStorageManager({
    ...options.storageManager,
    db,
    outbox,
    kvInstances: () => storage.all(),
    stateKv: storage.main,
    retention: registries.retention,
    areas: registries.areas,
    apiCache,
    budgetBytes: budgetBytesFromManifest(manifest.offline),
    wiper,
    getLastSyncAt: () => sync.getLastSyncAt(),
    getLastHydrationAt: () => sync.getLastHydrationAt(),
  });
  const disposeSyncListener = sync.onSyncCompleted(() => {
    void storageManager.scheduler.afterSync().catch(() => undefined);
  });

  const stopTriggers = options.startTriggers === false ? () => undefined : outbox.startTriggers();

  return {
    manifest,
    storage,
    db,
    schema,
    outbox,
    apiCache,
    wiper,
    storageManager,
    sync,
    connectivity,
    dispose() {
      stopTriggers();
      disposeSyncListener();
      disposeRetention();
      disposeApiCacheReset();
      disposeApiCachePrune();
      storageManager.scheduler.dispose();
      if (ownsConnectivity && 'dispose' in connectivity && typeof connectivity.dispose === 'function') connectivity.dispose();
    },
  };
}
