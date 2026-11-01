import { createGuardedStateStorage, type DurableKv } from '@resgrid/offline';
import { createJSONStorage, type PersistOptions, type StateStorage } from 'zustand/middleware';

import { getDataLogger } from './runtime';

/**
 * Persisted domain stores (omni-plan §8: persisted stores are the primary offline read source).
 *
 * Stores are created at module load, but the variant's MMKV instance only exists after `initOffline()`.
 * Every store therefore persists through one late-bound storage: reads and writes are no-ops until the
 * app shell calls `setDataStorage(storage.main)`, which then rehydrates every persisted store at once
 * (synchronously — MMKV is synchronous), before anything else can write.
 *
 * Persisted store names are frozen identity (AGENTS.md): legacy names (`calls-storage`,
 * `command-storage`, `chat-outbox-storage`, `records-field-storage`, `records-deployments-storage`,
 * `incident-assistant-storage`) are kept; new stores use an `omni-` prefix.
 */

let guarded: StateStorage | null = null;
let currentKv: DurableKv | null = null;

const lateBoundStorage: StateStorage = {
  getItem: (name) => (guarded ? guarded.getItem(name) : null),
  setItem: (name, value) => (guarded ? guarded.setItem(name, value) : undefined),
  removeItem: (name) => (guarded ? guarded.removeItem(name) : undefined),
};

interface PersistedStoreHandle {
  persist: { rehydrate: () => Promise<void> | void };
}

const persistedStores = new Map<string, PersistedStoreHandle>();

/** Registers a persisted store for `setDataStorage()` / `rehydrateDataStores()`. Rehydrates now if storage is already set. */
export function registerPersistedStore(name: string, store: PersistedStoreHandle): void {
  persistedStores.set(name, store);
  if (guarded) void Promise.resolve(store.persist.rehydrate()).catch(() => undefined);
}

export function getPersistedStoreNames(): string[] {
  return Array.from(persistedStores.keys());
}

/** Re-reads every persisted store from durable storage. */
export async function rehydrateDataStores(): Promise<void> {
  await Promise.all(
    Array.from(persistedStores.entries()).map(async ([name, store]) => {
      try {
        await store.persist.rehydrate();
      } catch {
        getDataLogger().warn({ message: 'Persisted store failed to rehydrate', context: { store: name } });
      }
    })
  );
}

/**
 * Points every persisted data store at the variant's durable KV (`runtime.storage.main`) and rehydrates
 * them. Pass null on teardown (tests).
 */
export async function setDataStorage(kv: DurableKv | null): Promise<void> {
  currentKv = kv;
  guarded = kv ? createGuardedStateStorage(kv) : null;
  if (kv) await rehydrateDataStores();
}

export function getDataStorageKv(): DurableKv | null {
  return currentKv;
}

export interface DataPersistConfig<S, P> {
  /** Frozen store name. */
  name: string;
  partialize: (state: S) => P;
  version?: number;
  migrate?: (persisted: unknown, version: number) => P;
  merge?: (persisted: unknown, current: S) => S;
  onRehydrated?: (state: S | undefined) => void;
}

/** zustand `persist` options over the late-bound guarded storage. */
export function dataPersistOptions<S, P>(config: DataPersistConfig<S, P>): PersistOptions<S, P> {
  return {
    name: config.name,
    storage: createJSONStorage<P>(() => lateBoundStorage),
    partialize: config.partialize,
    version: config.version ?? 0,
    ...(config.migrate ? { migrate: config.migrate } : {}),
    ...(config.merge ? { merge: config.merge } : {}),
    ...(config.onRehydrated ? { onRehydrateStorage: () => (state?: S) => config.onRehydrated?.(state) } : {}),
  };
}
