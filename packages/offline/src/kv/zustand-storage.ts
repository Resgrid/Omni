import type { StateStorage } from 'zustand/middleware';

import { getOfflineLogger } from '../util/logger';
import type { DurableKv } from './durable-kv';

export interface GuardedStateStorageOptions {
  /**
   * Drop a persisted blob that is not valid JSON instead of handing it to zustand, whose rehydrate
   * would throw and leave the store uninitialized (default true).
   */
  validateJson?: boolean;
}

/**
 * zustand `persist` storage over a DurableKv (Dispatch/BigBoard guarded storage + Unit corrupt-value
 * handling). Reads and writes never throw: a failed write (quota, closed instance) is logged and the
 * in-memory store keeps working. Persisted store names are part of the frozen identity — keep them.
 *
 * ```ts
 * persist(creator, { name: 'core-storage', storage: createJSONStorage(() => createGuardedStateStorage(kv)) })
 * ```
 */
export function createGuardedStateStorage(kv: DurableKv, options: GuardedStateStorageOptions = {}): StateStorage {
  const validateJson = options.validateJson !== false;
  return {
    getItem: (name) => {
      const value = kv.getString(name);
      if (value === undefined) return null;
      if (validateJson) {
        try {
          JSON.parse(value);
        } catch {
          getOfflineLogger().warn({ message: 'Dropped corrupt persisted store state', context: { instance: kv.id, store: name } });
          kv.delete(name);
          return null;
        }
      }
      return value;
    },
    setItem: (name, value) => {
      if (!kv.set(name, value)) {
        getOfflineLogger().warn({ message: 'Persisted store state was not saved', context: { instance: kv.id, store: name } });
      }
    },
    removeItem: (name) => {
      kv.delete(name);
    },
  };
}
