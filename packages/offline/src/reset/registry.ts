import { getOfflineLogger } from '../util/logger';

export type ResetReason = 'logout' | 'auth-rejected' | 'department-switch' | 'server-switch' | 'clear-all-data';

export type ResetFunction = (reason: ResetReason) => void | Promise<void>;

/**
 * What a wipe must reach (Responder `registerStoreReset` + Dispatch `teardownSignedInSession`):
 * - teardowns run first — hubs, LiveKit rooms, audio, polling timers, push listeners;
 * - store resets put registered zustand stores back to their initial state;
 * - wipe tables are the SQLite caches/working sets cleared on every wipe;
 * - preserved keys survive in MMKV (device preferences; per-variant additions such as BigBoard layouts).
 */
export interface ResetRegistry {
  registerStoreReset(name: string, reset: ResetFunction): () => void;
  unregisterStoreReset(name: string): void;
  registerTeardown(name: string, teardown: ResetFunction): () => void;
  /** Keys kept on every wipe, in every instance or only in `instanceId`. */
  registerPreservedKeys(keys: readonly string[], options?: { instanceId?: string }): void;
  registerWipeTable(table: string): () => void;
  getStoreResets(): ReadonlyMap<string, ResetFunction>;
  getTeardowns(): ReadonlyMap<string, ResetFunction>;
  getPreservedKeys(instanceId: string): string[];
  getWipeTables(): string[];
  getRegisteredStoreNames(): string[];
  getRegisteredStoreCount(): number;
  clear(): void;
}

export function createResetRegistry(): ResetRegistry {
  const storeResets = new Map<string, ResetFunction>();
  const teardowns = new Map<string, ResetFunction>();
  const preservedEverywhere = new Set<string>();
  const preservedPerInstance = new Map<string, Set<string>>();
  const wipeTables = new Set<string>();

  return {
    registerStoreReset(name, reset) {
      storeResets.set(name, reset);
      getOfflineLogger().debug({ message: 'Store registered for reset', context: { storeName: name } });
      return () => {
        if (storeResets.get(name) === reset) storeResets.delete(name);
      };
    },
    unregisterStoreReset(name) {
      storeResets.delete(name);
    },
    registerTeardown(name, teardown) {
      teardowns.set(name, teardown);
      return () => {
        if (teardowns.get(name) === teardown) teardowns.delete(name);
      };
    },
    registerPreservedKeys(keys, options) {
      if (options?.instanceId) {
        const set = preservedPerInstance.get(options.instanceId) ?? new Set<string>();
        keys.forEach((key) => set.add(key));
        preservedPerInstance.set(options.instanceId, set);
      } else {
        keys.forEach((key) => preservedEverywhere.add(key));
      }
    },
    registerWipeTable(table) {
      wipeTables.add(table);
      return () => wipeTables.delete(table);
    },
    getStoreResets: () => storeResets,
    getTeardowns: () => teardowns,
    getPreservedKeys: (instanceId) => [...preservedEverywhere, ...(preservedPerInstance.get(instanceId) ?? [])],
    getWipeTables: () => Array.from(wipeTables),
    getRegisteredStoreNames: () => Array.from(storeResets.keys()),
    getRegisteredStoreCount: () => storeResets.size,
    clear() {
      storeResets.clear();
      teardowns.clear();
      preservedEverywhere.clear();
      preservedPerInstance.clear();
      wipeTables.clear();
    },
  };
}

/** Process-wide registry; stores register at module load, as in Responder. */
export const defaultResetRegistry = createResetRegistry();

export const registerStoreReset = (name: string, reset: ResetFunction): (() => void) => defaultResetRegistry.registerStoreReset(name, reset);
export const unregisterStoreReset = (name: string): void => defaultResetRegistry.unregisterStoreReset(name);
export const registerTeardown = (name: string, teardown: ResetFunction): (() => void) => defaultResetRegistry.registerTeardown(name, teardown);
export const registerPreservedKeys = (keys: readonly string[], options?: { instanceId?: string }): void => defaultResetRegistry.registerPreservedKeys(keys, options);
export const registerWipeTable = (table: string): (() => void) => defaultResetRegistry.registerWipeTable(table);
export const getRegisteredStoreNames = (): string[] => defaultResetRegistry.getRegisteredStoreNames();
export const getRegisteredStoreCount = (): number => defaultResetRegistry.getRegisteredStoreCount();
