import { getOfflineLogger } from '../util/logger';
import type { KvBackend } from './types';

export type KeyFilter = Iterable<string> | ((key: string) => boolean);

export interface GetJsonOptions<T> {
  /** Narrow the parsed value; a value that fails is treated like a corrupt one. */
  validate?: (value: unknown) => value is T;
  /** Delete a value that does not parse (Unit behaviour, default true). Contract keys read leniently pass false. */
  deleteOnCorrupt?: boolean;
}

export interface ClearResult {
  removed: number;
  preserved: number;
}

const toPredicate = (filter: KeyFilter | undefined): ((key: string) => boolean) => {
  if (!filter) return () => false;
  if (typeof filter === 'function') return filter;
  const set = new Set(filter);
  return (key) => set.has(key);
};

/**
 * Durable key-value store over one MMKV instance (or its web stand-in).
 *
 * - Every backend call is guarded (Dispatch/BigBoard): a storage failure is logged by key name and
 *   returns the fallback instead of crashing a render or a store rehydration.
 * - Corrupt JSON is dropped so callers get a clean miss (Unit), unless the caller asks to keep it.
 * - `clear()` never clears more than this instance, and honours a preserve list (device preferences).
 */
export class DurableKv {
  constructor(readonly backend: KvBackend) {}

  get id(): string {
    return this.backend.id;
  }

  private guard<T>(operation: string, key: string | null, fn: () => T, fallback: T): T {
    try {
      return fn();
    } catch (error) {
      getOfflineLogger().error({ message: 'Durable storage operation failed', context: { instance: this.backend.id, operation, key, error: error instanceof Error ? error.name : typeof error } });
      return fallback;
    }
  }

  getString(key: string): string | undefined {
    return this.guard('getString', key, () => this.backend.getString(key), undefined);
  }

  getNumber(key: string): number | undefined {
    return this.guard(
      'getNumber',
      key,
      () => {
        const value = this.backend.getNumber(key);
        return value === undefined || Number.isNaN(value) ? undefined : value;
      },
      undefined
    );
  }

  getBoolean(key: string): boolean | undefined {
    return this.guard('getBoolean', key, () => this.backend.getBoolean(key), undefined);
  }

  set(key: string, value: string | number | boolean): boolean {
    return this.guard(
      'set',
      key,
      () => {
        this.backend.set(key, value);
        return true;
      },
      false
    );
  }

  getJSON<T>(key: string, options: GetJsonOptions<T> = {}): T | null {
    const raw = this.getString(key);
    if (raw === undefined || raw === '') return null;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (options.validate && !options.validate(parsed)) {
        throw new TypeError('validation failed');
      }
      return parsed as T;
    } catch {
      if (options.deleteOnCorrupt !== false) {
        getOfflineLogger().warn({ message: 'Dropped corrupt stored value', context: { instance: this.backend.id, key } });
        this.delete(key);
      }
      return null;
    }
  }

  setJSON(key: string, value: unknown): boolean {
    let serialized: string;
    try {
      serialized = JSON.stringify(value);
    } catch {
      getOfflineLogger().error({ message: 'Value could not be serialized for storage', context: { instance: this.backend.id, key } });
      return false;
    }
    if (serialized === undefined) {
      this.delete(key);
      return true;
    }
    return this.set(key, serialized);
  }

  delete(key: string): void {
    this.guard('delete', key, () => this.backend.delete(key), undefined);
  }

  contains(key: string): boolean {
    return this.guard('contains', key, () => this.backend.contains(key), false);
  }

  keys(): string[] {
    return this.guard('getAllKeys', null, () => this.backend.getAllKeys(), []);
  }

  /** Delete every key the filter matches. */
  deleteWhere(filter: (key: string) => boolean): number {
    let removed = 0;
    for (const key of this.keys()) {
      if (filter(key)) {
        this.delete(key);
        removed++;
      }
    }
    return removed;
  }

  /**
   * Clear this instance except the preserved keys. Uses the backend's own instance-scoped clear when
   * it has one (snapshot preserved values → clearAll → restore, Responder's order), otherwise deletes
   * key by key. Never touches other instances or, on web, keys outside this instance.
   */
  clear(options: { preserve?: KeyFilter } = {}): ClearResult {
    const isPreserved = toPredicate(options.preserve);
    const keys = this.keys();
    const preservedKeys = keys.filter(isPreserved);

    if (this.backend.clearAll && preservedKeys.length === 0) {
      this.guard('clearAll', null, () => this.backend.clearAll?.(), undefined);
      return { removed: keys.length, preserved: 0 };
    }

    let removed = 0;
    for (const key of keys) {
      if (!isPreserved(key)) {
        this.delete(key);
        removed++;
      }
    }
    return { removed, preserved: preservedKeys.length };
  }

  /** Rough size of this instance's content (key + value characters); MMKV exposes no exact size. */
  sizeEstimateBytes(): number {
    let total = 0;
    for (const key of this.keys()) {
      const value = this.getString(key);
      total += key.length + (value === undefined ? 8 : value.length);
    }
    return total;
  }

  trim(): void {
    this.guard('trim', null, () => this.backend.trim?.(), undefined);
  }
}
