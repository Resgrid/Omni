import { CONTRACT_KEYS } from './contract-keys';
import type { KvBackend, KvBackendConfig, KvBackendFactory } from './types';

/** The `Storage` surface used (localStorage, or an in-memory stand-in). */
export interface StorageLike {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * How keys are laid out in localStorage:
 * - `mmkv-prefixed` — `${id}\${key}`, exactly what react-native-mmkv's web build writes, so values a
 *   legacy web/Electron build stored stay readable (Responder, Unit, IC, Dispatch).
 * - `raw` — un-prefixed keys, BigBoard's legacy web/Electron storage (`lib/storage/index.web.tsx`).
 */
export type WebKeyLayout = 'mmkv-prefixed' | 'raw';

export interface WebKvBackendOptions {
  id: string;
  layout: WebKeyLayout;
  storage?: StorageLike;
  /**
   * Raw layout only: legacy keys this app wrote before the key ledger existed. Defaults to the
   * contract keys, `api_cache_*` and the given extra names (persisted store names).
   */
  legacyOwnedKey?: (key: string) => boolean;
}

const MMKV_WEB_SEPARATOR = '\\';
/** Raw layout: the keys this adapter has written, so a wipe never has to guess at origin-wide keys. */
export const RAW_LAYOUT_LEDGER_KEY = '__resgrid_kv_keys';

const memoryStorage = (): StorageLike => {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    key: (index) => Array.from(map.keys())[index] ?? null,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
};

let fallbackStorage: StorageLike | null = null;

/** localStorage when reachable (it throws in some privacy modes), else a process-lifetime memory map. */
export function getDefaultWebStorage(): StorageLike {
  try {
    const candidate = (globalThis as { localStorage?: StorageLike }).localStorage;
    if (candidate) {
      candidate.getItem('__resgrid_probe');
      return candidate;
    }
  } catch {
    // Access denied: fall through to memory.
  }
  fallbackStorage ??= memoryStorage();
  return fallbackStorage;
}

const allStorageKeys = (storage: StorageLike): string[] => {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key !== null) keys.push(key);
  }
  return keys;
};

export const defaultLegacyOwnedKey =
  (extra: readonly string[] = []) =>
  (key: string): boolean =>
    key.startsWith(CONTRACT_KEYS.apiCachePrefix) || (Object.values(CONTRACT_KEYS) as string[]).includes(key) || extra.includes(key);

/**
 * Web/Electron backend over localStorage. It never calls `localStorage.clear()`: that is origin-wide
 * and would also remove keys other code owns (BigBoard lesson). `clearAll()` exists only for the
 * prefixed layout, where the instance's keys are unambiguous.
 */
export function createWebKvBackend(options: WebKvBackendOptions): KvBackend {
  const storage = options.storage ?? getDefaultWebStorage();
  const { id, layout } = options;

  if (id.includes(MMKV_WEB_SEPARATOR)) {
    throw new Error('Storage instance id cannot contain a backslash.');
  }

  const read = (key: string): string | undefined => storage.getItem(key) ?? undefined;

  const parseNumber = (raw: string | undefined): number | undefined => {
    if (raw === undefined) return undefined;
    const value = Number(raw);
    return Number.isNaN(value) ? undefined : value;
  };

  const parseBoolean = (raw: string | undefined): boolean | undefined => (raw === undefined ? undefined : raw === 'true' || raw === '1');

  if (layout === 'mmkv-prefixed') {
    const prefix = `${id}${MMKV_WEB_SEPARATOR}`;
    const full = (key: string): string => {
      if (key.includes(MMKV_WEB_SEPARATOR)) throw new Error('Storage key cannot contain a backslash.');
      return `${prefix}${key}`;
    };
    const ownKeys = (): string[] => allStorageKeys(storage).filter((key) => key.startsWith(prefix));
    return {
      id,
      getString: (key) => read(full(key)),
      getNumber: (key) => parseNumber(read(full(key))),
      getBoolean: (key) => parseBoolean(read(full(key))),
      set: (key, value) => storage.setItem(full(key), String(value)),
      delete: (key) => storage.removeItem(full(key)),
      contains: (key) => storage.getItem(full(key)) !== null,
      getAllKeys: () => ownKeys().map((key) => key.slice(prefix.length)),
      clearAll: () => ownKeys().forEach((key) => storage.removeItem(key)),
    };
  }

  const isLegacyOwned = options.legacyOwnedKey ?? defaultLegacyOwnedKey();
  const readLedger = (): Set<string> => {
    try {
      const raw = storage.getItem(RAW_LAYOUT_LEDGER_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      return new Set(Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === 'string') : []);
    } catch {
      return new Set();
    }
  };
  const writeLedger = (ledger: Set<string>): void => storage.setItem(RAW_LAYOUT_LEDGER_KEY, JSON.stringify(Array.from(ledger)));

  return {
    id,
    getString: (key) => read(key),
    getNumber: (key) => parseNumber(read(key)),
    getBoolean: (key) => parseBoolean(read(key)),
    set: (key, value) => {
      storage.setItem(key, String(value));
      const ledger = readLedger();
      if (!ledger.has(key)) {
        ledger.add(key);
        writeLedger(ledger);
      }
    },
    delete: (key) => {
      storage.removeItem(key);
      const ledger = readLedger();
      if (ledger.delete(key)) writeLedger(ledger);
    },
    contains: (key) => storage.getItem(key) !== null,
    getAllKeys: () => {
      const ledger = readLedger();
      const keys = new Set<string>();
      for (const key of allStorageKeys(storage)) {
        if (key === RAW_LAYOUT_LEDGER_KEY || key.includes(MMKV_WEB_SEPARATOR)) continue;
        if (ledger.has(key) || isLegacyOwned(key)) keys.add(key);
      }
      return Array.from(keys);
    },
    // No clearAll: see the function comment.
  };
}

export function createWebKvBackendFactory(options: { layout: WebKeyLayout; storage?: StorageLike; legacyOwnedKey?: (key: string) => boolean }): KvBackendFactory {
  return (config: KvBackendConfig) => createWebKvBackend({ id: config.id, layout: options.layout, storage: options.storage, legacyOwnedKey: options.legacyOwnedKey });
}
