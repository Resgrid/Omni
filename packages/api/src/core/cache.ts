type MaybePromise<T> = T | Promise<T>;

/**
 * Key/value storage behind the API cache. Values are serialized strings so an MMKV-backed store can keep reading
 * entries the legacy apps wrote (`api_cache_*` keys, `{ data, timestamp, expiresIn }` JSON). `@resgrid/offline`
 * provides the durable implementation; {@link createMemoryCacheStore} is for tests and web fallbacks.
 */
export interface ApiCacheStore {
  get(key: string): MaybePromise<string | null | undefined>;
  set(key: string, value: string): MaybePromise<void>;
  delete(key: string): MaybePromise<void>;
  keys(): MaybePromise<string[]>;
}

export interface ApiCacheEntry<T = unknown> {
  data: T;
  /** Epoch ms when stored. */
  timestamp: number;
  /** TTL in ms. */
  expiresIn: number;
}

/** Prefix of every cache key (legacy contract key). */
export const API_CACHE_PREFIX = 'api_cache_';
/** Key the data layer keeps the cache scope (user/department) under; `clear()` never deletes it. */
export const API_CACHE_SCOPE_KEY = 'api_cache_scope';
/** Hard cap on entries: endpoints with varying params (ids, dates) create a key per combination. */
export const DEFAULT_MAX_CACHE_ENTRIES = 200;
/** How long an expired entry is kept as an offline fallback before `prune()` removes it. */
export const DEFAULT_STALE_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export type CacheParams = Record<string, unknown>;

export interface ApiCacheOptions {
  store: ApiCacheStore;
  /**
   * Namespace for the current server + signed-in identity, e.g. `${baseUrl}_${departmentId}_${userId}`. Entries from
   * another server, user or department are never served. Read before and after each request: a response belongs to
   * the identity that asked for it.
   */
  getScope: () => string;
  maxEntries?: number;
  staleRetentionMs?: number;
  now?: () => number;
}

export interface ApiCache {
  getScopeIdentity(): string;
  /** A fresh (unexpired) entry, or null. Expired entries stay on disk for {@link ApiCache.getStale}. */
  get<T>(endpoint: string, params?: CacheParams): Promise<T | null>;
  /** The last stored value regardless of TTL (offline fallback), or null. */
  getStale<T>(endpoint: string, params?: CacheParams): Promise<T | null>;
  set<T>(endpoint: string, data: T, params: CacheParams | undefined, ttlMs: number): Promise<void>;
  remove(endpoint: string, params?: CacheParams): Promise<void>;
  /** Removes entries for an endpoint under every param combination in the current scope. */
  removeEndpoint(endpoint: string): Promise<void>;
  /** Drops corrupt entries and entries expired longer than the stale retention, then enforces the entry cap (oldest first). */
  prune(): Promise<void>;
  /** Removes every cache entry (all scopes) but keeps `api_cache_scope`. */
  clear(): Promise<void>;
}

const isCacheEntry = (value: unknown): value is ApiCacheEntry => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const item = value as Partial<ApiCacheEntry>;
  return Object.prototype.hasOwnProperty.call(item, 'data') && typeof item.timestamp === 'number' && Number.isFinite(item.timestamp) && typeof item.expiresIn === 'number' && Number.isFinite(item.expiresIn);
};

/** Query string in the legacy cache-key format (`?a=1&b=2`, URLSearchParams order). */
const queryOf = (params?: CacheParams): string => {
  if (!params) {
    return '';
  }
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) {
      continue;
    }
    search.append(key, value instanceof Date ? value.toISOString() : String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
};

export const createApiCache = (options: ApiCacheOptions): ApiCache => {
  const { store, getScope } = options;
  const maxEntries = options.maxEntries ?? DEFAULT_MAX_CACHE_ENTRIES;
  const staleRetentionMs = options.staleRetentionMs ?? DEFAULT_STALE_RETENTION_MS;
  const now = options.now ?? Date.now;

  const keyFor = (endpoint: string, params?: CacheParams): string => `${API_CACHE_PREFIX}${getScope()}_${endpoint}${queryOf(params)}`;

  const read = async (key: string): Promise<ApiCacheEntry | null> => {
    const raw = await store.get(key);
    if (!raw) {
      return null;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // A corrupt or truncated entry would otherwise break this endpoint for good.
      await store.delete(key);
      return null;
    }
    if (!isCacheEntry(parsed)) {
      await store.delete(key);
      return null;
    }
    return parsed;
  };

  return {
    getScopeIdentity: getScope,

    async get<T>(endpoint: string, params?: CacheParams): Promise<T | null> {
      const entry = await read(keyFor(endpoint, params));
      if (!entry || now() - entry.timestamp > entry.expiresIn) {
        return null;
      }
      return entry.data as T;
    },

    async getStale<T>(endpoint: string, params?: CacheParams): Promise<T | null> {
      const entry = await read(keyFor(endpoint, params));
      return entry ? (entry.data as T) : null;
    },

    async set<T>(endpoint: string, data: T, params: CacheParams | undefined, ttlMs: number): Promise<void> {
      const entry: ApiCacheEntry<T> = { data, timestamp: now(), expiresIn: ttlMs };
      await store.set(keyFor(endpoint, params), JSON.stringify(entry));
    },

    async remove(endpoint: string, params?: CacheParams): Promise<void> {
      await store.delete(keyFor(endpoint, params));
    },

    async removeEndpoint(endpoint: string): Promise<void> {
      const base = keyFor(endpoint);
      const keys = await store.keys();
      for (const key of keys) {
        if (key === base || key.startsWith(`${base}?`)) {
          await store.delete(key);
        }
      }
    },

    async prune(): Promise<void> {
      const time = now();
      const live: { key: string; timestamp: number }[] = [];
      for (const key of await store.keys()) {
        if (!key.startsWith(API_CACHE_PREFIX) || key === API_CACHE_SCOPE_KEY) {
          continue;
        }
        const entry = await read(key);
        if (!entry) {
          continue;
        }
        if (time - entry.timestamp > entry.expiresIn + staleRetentionMs) {
          await store.delete(key);
        } else {
          live.push({ key, timestamp: entry.timestamp });
        }
      }
      if (live.length > maxEntries) {
        live.sort((a, b) => a.timestamp - b.timestamp);
        for (const { key } of live.slice(0, live.length - maxEntries)) {
          await store.delete(key);
        }
      }
    },

    async clear(): Promise<void> {
      for (const key of await store.keys()) {
        if (key.startsWith(API_CACHE_PREFIX) && key !== API_CACHE_SCOPE_KEY) {
          await store.delete(key);
        }
      }
    },
  };
};

/** In-memory {@link ApiCacheStore} (tests, web fallback when durable storage is unavailable). */
export const createMemoryCacheStore = (initial?: Record<string, string>): ApiCacheStore & { snapshot(): Record<string, string> } => {
  const map = new Map<string, string>(Object.entries(initial ?? {}));
  return {
    get: (key) => map.get(key) ?? null,
    set: (key, value) => {
      map.set(key, value);
    },
    delete: (key) => {
      map.delete(key);
    },
    keys: () => [...map.keys()],
    snapshot: () => Object.fromEntries(map),
  };
};
