import { API_CACHE_PREFIX, type ApiCache, type ApiCacheStore, createApiCache } from '@resgrid/api';
import type { DurableApiCache } from '@resgrid/offline';

/** How long the durable layer keeps a bridged entry; the API cache applies the real TTL from the entry itself. */
const BRIDGE_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

const strip = (key: string): string => (key.startsWith(API_CACHE_PREFIX) ? key.slice(API_CACHE_PREFIX.length) : key);

/**
 * `@resgrid/api`'s cache over `@resgrid/offline`'s durable cache (what `initAuth({ apiCache })` expects): entries live
 * in the variant's MMKV under the legacy `api_cache_*` keys, and the scope identity (server + department + user) is the
 * one auth sets on the durable cache, so another user's or server's entries are never served.
 */
export function createApiCacheBridge(durable: DurableApiCache): ApiCache {
  const store: ApiCacheStore = {
    get: (key) => {
      const value = durable.get<unknown>(strip(key));
      return typeof value === 'string' ? value : null;
    },
    set: (key, value) => {
      durable.set(strip(key), value, BRIDGE_RETENTION_MS);
    },
    delete: (key) => {
      durable.delete(strip(key));
    },
    // DurableApiCache lists logical keys (prefix removed); the API cache works with full storage keys.
    keys: () => durable.keys().map((key) => `${API_CACHE_PREFIX}${key}`),
  };
  return createApiCache({ store, getScope: () => durable.getScopeIdentity() });
}
