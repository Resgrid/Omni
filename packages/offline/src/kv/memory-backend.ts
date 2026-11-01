import type { KvBackend, KvBackendConfig, KvBackendFactory } from './types';

/**
 * In-memory backend: tests, server-side rendering and the last-resort fallback when no durable
 * storage is reachable. Values keep their written type, like MMKV.
 */
export function createMemoryKvBackend(id: string, initial?: Record<string, string | number | boolean>): KvBackend {
  const data = new Map<string, string | number | boolean>(Object.entries(initial ?? {}));
  return {
    id,
    getString: (key) => {
      const value = data.get(key);
      return typeof value === 'string' ? value : undefined;
    },
    getNumber: (key) => {
      const value = data.get(key);
      return typeof value === 'number' ? value : undefined;
    },
    getBoolean: (key) => {
      const value = data.get(key);
      return typeof value === 'boolean' ? value : undefined;
    },
    set: (key, value) => {
      data.set(key, value);
    },
    delete: (key) => {
      data.delete(key);
    },
    contains: (key) => data.has(key),
    getAllKeys: () => Array.from(data.keys()),
    clearAll: () => data.clear(),
  };
}

/** Factory keeping one in-memory instance per id for the life of the process. */
export function createMemoryKvBackendFactory(): KvBackendFactory {
  const instances = new Map<string, KvBackend>();
  return (config: KvBackendConfig) => {
    const existing = instances.get(config.id);
    if (existing) return existing;
    const backend = createMemoryKvBackend(config.id);
    instances.set(config.id, backend);
    return backend;
  };
}
