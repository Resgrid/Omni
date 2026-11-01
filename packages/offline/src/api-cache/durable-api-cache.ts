import { CONTRACT_KEYS } from '../kv/contract-keys';
import type { DurableKv } from '../kv/durable-kv';
import { type Clock, systemClock } from '../util/ids';
import { getOfflineLogger } from '../util/logger';

/**
 * Who cached responses belong to (IC `cache-scope.ts` format, stored at `api_cache_scope`; `server`
 * is an Omni addition). Entries written under another identity are never served.
 */
export interface ApiCacheScope {
  userId: string | null;
  departmentId: string | null;
  server?: string | null;
}

export interface ApiCacheEntry<T = unknown> {
  value: T;
  storedAt: number;
  ttlMs: number;
  /** storedAt + ttl has passed; the value may still be served as a stale offline fallback. */
  expired: boolean;
  ageMs: number;
}

/**
 * Structural twin of the api workstream's `ApiCacheStore { get, set, delete, keys }` — implemented
 * here without importing @resgrid/api (offline and api are both layer L2).
 */
export interface ApiCacheStoreLike {
  get(key: string): unknown;
  set(key: string, value: unknown): void;
  delete(key: string): void;
  keys(): string[];
}

interface StoredEntry {
  v: 1;
  data: unknown;
  storedAt: number;
  ttl: number;
  scope: string;
}

interface LegacyEntry {
  data: unknown;
  timestamp: number;
  expiresIn: number;
}

export interface DurableApiCacheOptions {
  kv: DurableKv;
  now?: Clock;
  /** TTL when `set` is called without one; per-variant policy (manifest `offline.cacheTtl`). */
  defaultTtlMs?: number;
  /** Entry cap; `prune()` drops the oldest beyond it (Unit prunes at 200). */
  maxEntries?: number;
}

const isStored = (value: unknown): value is StoredEntry => typeof value === 'object' && value !== null && (value as StoredEntry).v === 1 && typeof (value as StoredEntry).storedAt === 'number';
const isLegacy = (value: unknown): value is LegacyEntry => typeof value === 'object' && value !== null && typeof (value as LegacyEntry).timestamp === 'number' && typeof (value as LegacyEntry).expiresIn === 'number';

const MINUTE = 60_000;
/** Per-variant default TTLs: IC caches 1–2 days, the others minutes to hours (plan §5.5). */
export const API_CACHE_TTL_DEFAULTS = { short: 15 * MINUTE, long: 24 * 60 * MINUTE } as const;

export const apiCacheTtlFromManifest = (offline: { cacheTtl: 'short' | 'long' }): number => API_CACHE_TTL_DEFAULTS[offline.cacheTtl];

/**
 * Durable API response cache over MMKV, keeping the legacy key layout readable: entries under
 * `api_cache_<key>`, the scope record at `api_cache_scope` (which `clear()` keeps — IC fix). Values
 * are stamped with the scope identity and their TTL; expired values stay on disk for offline reads.
 */
export class DurableApiCache implements ApiCacheStoreLike {
  private readonly kv: DurableKv;
  private readonly now: Clock;
  private readonly defaultTtlMs: number;
  private readonly maxEntries: number;
  private scopeMemo: ApiCacheScope | null = null;

  constructor(options: DurableApiCacheOptions) {
    this.kv = options.kv;
    this.now = options.now ?? systemClock;
    this.defaultTtlMs = options.defaultTtlMs ?? 5 * MINUTE;
    this.maxEntries = options.maxEntries ?? 200;
  }

  private storageKey(key: string): string {
    return `${CONTRACT_KEYS.apiCachePrefix}${key}`;
  }

  private isEntryKey(storageKey: string): boolean {
    return storageKey.startsWith(CONTRACT_KEYS.apiCachePrefix) && storageKey !== CONTRACT_KEYS.apiCacheScope;
  }

  // ------------------------------------------------------------ scope

  getScope(): ApiCacheScope {
    if (this.scopeMemo) return this.scopeMemo;
    const stored = this.kv.getJSON<Partial<ApiCacheScope>>(CONTRACT_KEYS.apiCacheScope, { deleteOnCorrupt: false });
    this.scopeMemo = {
      userId: typeof stored?.userId === 'string' ? stored.userId : null,
      departmentId: typeof stored?.departmentId === 'string' ? stored.departmentId : null,
      server: typeof stored?.server === 'string' ? stored.server : null,
    };
    return this.scopeMemo;
  }

  /** Identity string entries are stamped with. */
  getScopeIdentity(): string {
    const scope = this.getScope();
    return `${scope.server ?? 'noserver'}|${scope.departmentId ?? 'nodept'}|${scope.userId ?? 'anon'}`;
  }

  /**
   * Merge in what is known about the session (login, department resolved, server switch). When the
   * identity changes, every cached entry of the previous identity is dropped.
   */
  setScope(scope: Partial<ApiCacheScope>): void {
    const before = this.getScopeIdentity();
    const current = this.getScope();
    const next: ApiCacheScope = {
      userId: scope.userId !== undefined ? scope.userId : current.userId,
      departmentId: scope.departmentId !== undefined ? scope.departmentId : current.departmentId,
      server: scope.server !== undefined ? scope.server : (current.server ?? null),
    };
    this.scopeMemo = next;
    this.kv.setJSON(CONTRACT_KEYS.apiCacheScope, next);
    if (this.getScopeIdentity() !== before) {
      const removed = this.clear();
      getOfflineLogger().info({ message: 'API cache scope changed; previous entries dropped', context: { removed } });
    }
  }

  /** Forget the scope and every entry (logout). */
  reset(): void {
    this.clear();
    this.kv.delete(CONTRACT_KEYS.apiCacheScope);
    this.scopeMemo = null;
  }

  // ------------------------------------------------------------ entries

  private read(key: string): StoredEntry | null {
    const raw = this.kv.getJSON<unknown>(this.storageKey(key));
    if (raw === null) return null;
    if (isStored(raw)) return raw;
    if (isLegacy(raw)) {
      // Legacy entries carry no stamp; their key already embeds the identity they were written under.
      return { v: 1, data: raw.data, storedAt: raw.timestamp, ttl: raw.expiresIn, scope: this.getScopeIdentity() };
    }
    return null;
  }

  /** The entry with its metadata, whether fresh or expired — or undefined when absent or another identity's. */
  getEntry<T = unknown>(key: string): ApiCacheEntry<T> | undefined {
    const entry = this.read(key);
    if (!entry || entry.scope !== this.getScopeIdentity()) return undefined;
    const ageMs = Math.max(0, this.now() - entry.storedAt);
    return { value: entry.data as T, storedAt: entry.storedAt, ttlMs: entry.ttl, ageMs, expired: ageMs > entry.ttl };
  }

  /** `ApiCacheStore.get`: the stored value for this identity, fresh or stale (callers check `getEntry` for freshness). */
  get<T = unknown>(key: string): T | undefined {
    return this.getEntry<T>(key)?.value;
  }

  /** Only a value within its TTL. */
  getFresh<T = unknown>(key: string): T | undefined {
    const entry = this.getEntry<T>(key);
    return entry && !entry.expired ? entry.value : undefined;
  }

  /** The value even when expired — the offline fallback (IC `getStale`). */
  getStale<T = unknown>(key: string): ApiCacheEntry<T> | undefined {
    return this.getEntry<T>(key);
  }

  set(key: string, value: unknown, ttlMs: number = this.defaultTtlMs): void {
    if (value === undefined) return;
    const entry: StoredEntry = { v: 1, data: value, storedAt: this.now(), ttl: ttlMs, scope: this.getScopeIdentity() };
    this.kv.setJSON(this.storageKey(key), entry);
  }

  delete(key: string): void {
    this.kv.delete(this.storageKey(key));
  }

  /** Logical keys (without the `api_cache_` prefix), scope record excluded. */
  keys(): string[] {
    return this.kv
      .keys()
      .filter((storageKey) => this.isEntryKey(storageKey))
      .map((storageKey) => storageKey.slice(CONTRACT_KEYS.apiCachePrefix.length));
  }

  /** Drop every entry; the scope record stays (IC fix: the others deleted their own scope key). */
  clear(): number {
    return this.kv.deleteWhere((storageKey) => this.isEntryKey(storageKey));
  }

  /** Keep the newest `maxEntries`; drop entries of other identities first. */
  prune(maxEntries: number = this.maxEntries): number {
    const identity = this.getScopeIdentity();
    const entries: { key: string; storedAt: number }[] = [];
    let removed = 0;
    for (const key of this.keys()) {
      const entry = this.read(key);
      if (!entry || entry.scope !== identity) {
        this.delete(key);
        removed++;
        continue;
      }
      entries.push({ key, storedAt: entry.storedAt });
    }
    entries.sort((a, b) => b.storedAt - a.storedAt);
    for (const entry of entries.slice(maxEntries)) {
      this.delete(entry.key);
      removed++;
    }
    return removed;
  }

  sizeBytes(): number {
    let total = 0;
    for (const key of this.keys()) {
      total += key.length + (this.kv.getString(this.storageKey(key))?.length ?? 0);
    }
    return total;
  }
}

export function createDurableApiCache(options: DurableApiCacheOptions): DurableApiCache {
  return new DurableApiCache(options);
}
