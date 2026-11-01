// @resgrid/offline (layer L2) — durable storage, reset/wipe registry, outbox, sync primitives and
// storage maintenance for every Omni variant. Design: docs/architecture/omni-plan.md §8 and the
// omni-offline-first skill.

// Shared
export type { Clock, IdGenerator } from './util/ids';
export type { OfflineLogEntry, OfflineLogger } from './util/logger';
export { getOfflineLogger, noopLogger, setOfflineLogger } from './util/logger';
export type { OfflineScope } from './util/scope';
export { isSameSession, normalizeServer, scopeKey } from './util/scope';

// KV (MMKV with the frozen per-variant identity)
export { CONTRACT_KEYS, DEVICE_PREFERENCE_KEYS, readLegacyString, SESSION_KEYS, VARIANT_PRESERVED_KEYS, writeLegacyString } from './kv/contract-keys';
export { type ClearResult, DurableKv, type GetJsonOptions, type KeyFilter } from './kv/durable-kv';
export {
  generateMmkvKey,
  type InstanceKeySource,
  type InstanceKeyState,
  KEY_SENTINEL_KEY,
  keySidecarId,
  type LegacyKeyProvider,
  MMKV_KEY_LENGTH,
  pendingSecureKeyName,
  type RekeyResult,
  type RekeyStatus,
  rekeyToSecureKey,
  resolveInstanceKey,
  secureKeyName,
} from './kv/keys';
export { createMemoryKvBackend, createMemoryKvBackendFactory } from './kv/memory-backend';
export { createMmkvBackend, createMmkvBackendFactory } from './kv/mmkv-backend';
export { defaultWebKeyLayout, openVariantStorage, type OpenVariantStorageOptions, type StorageManifest, type VariantStorage } from './kv/open-storage';
export { createDefaultKvBackendFactory, KV_PLATFORM } from './kv/platform';
export { createExpoSecureKeyStore, createMemorySecureKeyStore, getOrCreateSecureKey, type SecureKeyStore } from './kv/secure-store';
export type { KvBackend, KvBackendConfig, KvBackendFactory, KvPlatform } from './kv/types';
export { createWebKvBackend, createWebKvBackendFactory, getDefaultWebStorage, RAW_LAYOUT_LEDGER_KEY, type StorageLike, type WebKeyLayout, type WebKvBackendOptions } from './kv/web-backend';
export { createGuardedStateStorage, type GuardedStateStorageOptions } from './kv/zustand-storage';

// DB (SQLite / memory engine)
export { createMemoryDb, type MemoryDbPersistence, type MemoryDbSnapshot } from './db/memory-db';
export { DURABLE_DB_ENGINE, openDurableDb, type OpenDurableDbOptions } from './db/open-db';
export { applySchema, type ApplySchemaOptions, getSchemaVersion, SCHEMA_TABLE } from './db/schema';
export { createSqliteDb, OFFLINE_DB_NAME, type SqliteConnection, type SqliteDbOptions, SqliteDurableDb } from './db/sqlite-db';
export {
  type ColumnSpec,
  type ColumnType,
  type Condition,
  type ConditionOps,
  type DbOps,
  type DbRow,
  type DbSizeInfo,
  type DurableDb,
  type IndexSpec,
  type Migration,
  type OrderBy,
  type SchemaModule,
  type SchemaResult,
  type SchemaStatus,
  type SelectOptions,
  SqlNotSupportedError,
  type SqlValue,
  type TableSpec,
  type Where,
} from './db/types';

// Outbox
export { createAesGcmPayloadCipher, OUTBOX_KEY_NAME, type PayloadCipher } from './outbox/cipher';
export { defaultClassify, getHttpStatus, isNetworkError, toOutboxError } from './outbox/classify';
export { type ConnectivitySource, createManualConnectivitySource, createNetInfoConnectivitySource, isNetInfoOnline, type ManualConnectivitySource } from './outbox/connectivity';
export { ConfirmationRequiredError, createOutbox, DEFAULT_RETRY_POLICY, FOREIGN_HOLD_MS, Outbox, OutboxNoSessionError, type OutboxOptions, OutboxUnknownTypeError, ProtectedPayloadError } from './outbox/outbox';
export { createOutboxHandlerRegistry, defaultOutboxHandlerRegistry, type OutboxHandlerRegistry, registerOutboxHandler } from './outbox/registry';
export { OUTBOX_DROPPED_TABLE, OUTBOX_TABLE, outboxSchemaModule } from './outbox/schema';
export type {
  DrainOptions,
  DrainResult,
  DrainStatus,
  DropReason,
  EnqueueInput,
  EnqueueResult,
  EnqueueStatus,
  OutboxCounts,
  OutboxDropRecord,
  OutboxError,
  OutboxErrorClass,
  OutboxEvent,
  OutboxHandler,
  OutboxItemView,
  OutboxSnapshot,
  OutboxState,
  RetryPolicy,
  RollbackReason,
  SendContext,
} from './outbox/types';

// Reset / wipe
export {
  createResetRegistry,
  defaultResetRegistry,
  getRegisteredStoreCount,
  getRegisteredStoreNames,
  registerPreservedKeys,
  registerStoreReset,
  registerTeardown,
  registerWipeTable,
  type ResetFunction,
  type ResetReason,
  type ResetRegistry,
  unregisterStoreReset,
} from './reset/registry';
export { createScopeWiper, type ScopeWiper, type ScopeWiperOptions, type UnsentWritesPolicy, type WipeOptions, type WipeReport } from './reset/wipe';

// Maintenance and the Storage & sync screen
export { createStorageAreaRegistry, defaultStorageAreaRegistry, type ExternalStorageArea, registerStorageArea, type StorageAreaRegistry } from './maintenance/areas';
export {
  applyRetentionRule,
  createRetentionRegistry,
  defaultRetentionRegistry,
  findTablesWithoutRetention,
  registerRetention,
  registerRetentionHook,
  RETENTION_DEFAULTS,
  type RetentionHook,
  type RetentionRegistry,
  type RetentionRule,
  type StorageArea,
} from './maintenance/retention';
export { type MaintenanceReason, type MaintenanceResult, runMaintenance, type RunMaintenanceOptions } from './maintenance/run-maintenance';
export { createMaintenanceScheduler, LAST_MAINTENANCE_AT_KEY, type MaintenanceScheduler, type MaintenanceSchedulerOptions } from './maintenance/scheduler';
export {
  type ApiCacheLike,
  budgetBytesFromManifest,
  type ClearAllLocalDataResult,
  type ClearCachedDataResult,
  createStorageManager,
  type MaintenanceSummary,
  type StorageDiagnostics,
  StorageManager,
  type StorageManagerOptions,
  type StorageReport,
} from './maintenance/storage-manager';

// Sync
export {
  createSyncOrchestrator,
  type HydrationContext,
  type HydrationResult,
  type HydrationState,
  type HydrationStep,
  type HydrationStepState,
  type HydrationStepStatus,
  LAST_HYDRATION_AT_KEY,
  LAST_SYNC_AT_KEY,
  type ReconnectResult,
  type ReconnectSequence,
  type ReconnectStepId,
  SyncOrchestrator,
} from './sync/orchestrator';

// API cache
export {
  API_CACHE_TTL_DEFAULTS,
  type ApiCacheEntry,
  type ApiCacheScope,
  type ApiCacheStoreLike,
  apiCacheTtlFromManifest,
  createDurableApiCache,
  DurableApiCache,
  type DurableApiCacheOptions,
} from './api-cache/durable-api-cache';

// Composition root
export { initOffline, type InitOfflineOptions, type OfflineRuntime, registerOutboxRetention } from './runtime';
