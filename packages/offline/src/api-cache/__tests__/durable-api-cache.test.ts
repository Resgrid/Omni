import { createClock, type TestClock } from '../../__tests__/helpers';
import { DurableKv } from '../../kv/durable-kv';
import { createMemoryKvBackend } from '../../kv/memory-backend';
import { API_CACHE_TTL_DEFAULTS, apiCacheTtlFromManifest, createDurableApiCache, type DurableApiCache } from '../durable-api-cache';

describe('DurableApiCache', () => {
  let kv: DurableKv;
  let clock: TestClock;
  let cache: DurableApiCache;

  beforeEach(() => {
    kv = new DurableKv(createMemoryKvBackend('ResgridIC'));
    clock = createClock();
    cache = createDurableApiCache({ kv, now: clock.now, defaultTtlMs: 60_000, maxEntries: 2 });
    cache.setScope({ userId: 'u1', departmentId: '1', server: 'https://api.resgrid.com' });
  });

  it('stores JSON with storedAt/ttl/scope metadata under the legacy api_cache_ prefix', () => {
    cache.set('units', [{ UnitId: '1' }]);
    const stored = JSON.parse(kv.getString('api_cache_units') as string);
    expect(stored).toEqual({ v: 1, data: [{ UnitId: '1' }], storedAt: clock.now(), ttl: 60_000, scope: 'https://api.resgrid.com|1|u1' });
    expect(cache.get('units')).toEqual([{ UnitId: '1' }]);
    expect(cache.keys()).toEqual(['units']);
  });

  it('serves fresh values within the TTL and stale ones only as a fallback', () => {
    cache.set('calls', ['c'], 1_000);
    expect(cache.getFresh('calls')).toEqual(['c']);
    clock.advance(1_001);
    expect(cache.getFresh('calls')).toBeUndefined();
    expect(cache.getStale('calls')).toMatchObject({ value: ['c'], expired: true, ageMs: 1_001, ttlMs: 1_000 });
    expect(cache.get('calls')).toEqual(['c']);
  });

  it('reads entries written by the legacy cache managers', () => {
    kv.setJSON('api_cache_legacy', { data: { a: 1 }, timestamp: clock.now() - 10, expiresIn: 5 });
    expect(cache.getStale('legacy')).toMatchObject({ value: { a: 1 }, expired: true });
  });

  it("never serves another identity's entries, and drops them when the identity changes", () => {
    cache.set('units', ['mine']);
    kv.setJSON('api_cache_foreign', { v: 1, data: ['theirs'], storedAt: clock.now(), ttl: 60_000, scope: 'x|2|u2' });
    expect(cache.get('foreign')).toBeUndefined();

    cache.setScope({ userId: 'u2' });
    expect(cache.get('units')).toBeUndefined();
    expect(cache.keys()).toEqual([]);
    expect(kv.getJSON('api_cache_scope')).toEqual({ userId: 'u2', departmentId: '1', server: 'https://api.resgrid.com' });
  });

  it('merges partial scope updates without clearing when the identity is unchanged', () => {
    cache.set('units', ['x']);
    cache.setScope({ departmentId: '1' });
    expect(cache.get('units')).toEqual(['x']);
  });

  it('clear() keeps the scope record (IC fix)', () => {
    cache.set('a', 1);
    cache.set('b', 2);
    expect(cache.clear()).toBe(2);
    expect(kv.contains('api_cache_scope')).toBe(true);
    expect(cache.getScope().userId).toBe('u1');
  });

  it('reset() forgets entries and the scope (logout)', () => {
    cache.set('a', 1);
    cache.reset();
    expect(kv.keys()).toEqual([]);
    expect(cache.getScope()).toEqual({ userId: null, departmentId: null, server: null });
  });

  it('prunes to the newest entries, dropping foreign ones first', () => {
    cache.set('old', 1);
    clock.advance(10);
    cache.set('mid', 2);
    clock.advance(10);
    cache.set('new', 3);
    kv.setJSON('api_cache_foreign', { v: 1, data: 0, storedAt: clock.now(), ttl: 1, scope: 'other' });
    expect(cache.prune()).toBe(2);
    expect(cache.keys().sort()).toEqual(['mid', 'new']);
  });

  it('ignores undefined values and reports its size', () => {
    cache.set('nothing', undefined);
    expect(cache.keys()).toEqual([]);
    cache.set('x', 'abc');
    expect(cache.sizeBytes()).toBeGreaterThan(0);
  });

  it('derives per-variant TTLs from the manifest', () => {
    expect(apiCacheTtlFromManifest({ cacheTtl: 'long' })).toBe(API_CACHE_TTL_DEFAULTS.long);
    expect(apiCacheTtlFromManifest({ cacheTtl: 'short' })).toBe(API_CACHE_TTL_DEFAULTS.short);
  });
});
