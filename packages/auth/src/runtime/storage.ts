import { createGuardedStateStorage, type DurableKv } from '@resgrid/offline';
import type { StateStorage } from 'zustand/middleware';

/**
 * The variant's durable KV instances (from `@resgrid/offline` `openVariantStorage()` / `initOffline().storage`). Bound
 * once by `initAuth()`. Stores are created at module load (so hooks work everywhere) with late-bound persistence: until
 * the storage is bound, writes stay in memory and nothing is read.
 */
export interface AuthStorageBinding {
  readonly main: DurableKv;
  readonly instances?: ReadonlyMap<string, DurableKv>;
}

let binding: AuthStorageBinding | null = null;
const bindListeners = new Set<() => void>();

export function bindAuthStorage(next: AuthStorageBinding | null): void {
  binding = next;
  for (const listener of [...bindListeners]) {
    listener();
  }
}

/** Runs when storage is (re)bound — modules that cache a value read from storage reload it. */
export function onAuthStorageBound(listener: () => void): () => void {
  bindListeners.add(listener);
  return () => {
    bindListeners.delete(listener);
  };
}

export const isAuthStorageBound = (): boolean => binding !== null;

/** The variant's main instance (frozen `storage.mmkvId`): contract keys such as `baseUrl` and `authResponse` live here. */
export const mainKv = (): DurableKv | null => binding?.main ?? null;

/**
 * Where a persisted store lives: its own instance when the variant declares one with the store's name (Dispatch and
 * BigBoard keep `auth-storage` and `security-storage` instances), otherwise the main instance (Responder, Unit, IC).
 * The key inside is always the store name — part of the frozen storage identity.
 */
export const storeKv = (storeName: string): DurableKv | null => binding?.instances?.get(storeName) ?? binding?.main ?? null;

/** zustand `persist` storage that resolves its instance at call time (no-op until storage is bound). */
export function lateBoundStateStorage(resolve: () => DurableKv | null): StateStorage {
  return {
    getItem: (name) => {
      const kv = resolve();
      return kv ? createGuardedStateStorage(kv).getItem(name) : null;
    },
    setItem: (name, value) => {
      const kv = resolve();
      if (kv) {
        void createGuardedStateStorage(kv).setItem(name, value);
      }
    },
    removeItem: (name) => {
      const kv = resolve();
      if (kv) {
        void createGuardedStateStorage(kv).removeItem(name);
      }
    },
  };
}
