import { API_CACHE_SCOPE_KEY, createApiCache, createMemoryCacheStore } from '../cache';

const setup = (options: { maxEntries?: number; staleRetentionMs?: number } = {}) => {
  const store = createMemoryCacheStore();
  let time = 1_000_000;
  const scope = { value: 'https://api.example.com/api/v4_dept1_user1' };
  const cache = createApiCache({ store, getScope: () => scope.value, now: () => time, ...options });
  return {
    store,
    cache,
    scope,
    advance: (ms: number) => {
      time += ms;
    },
  };
};

describe('createApiCache', () => {
  it('uses the legacy key format so durable stores keep reading old entries', async () => {
    const { cache, store } = setup();
    await cache.set('/Units/GetAllUnits', { Data: [1] }, { type: 2, empty: undefined }, 60_000);
    expect(Object.keys(store.snapshot())).toEqual(['api_cache_https://api.example.com/api/v4_dept1_user1_/Units/GetAllUnits?type=2']);
    expect(JSON.parse(Object.values(store.snapshot())[0])).toEqual({ data: { Data: [1] }, timestamp: 1_000_000, expiresIn: 60_000 });
  });

  it('serves fresh entries, hides expired ones but keeps them for the stale fallback', async () => {
    const { cache, advance } = setup();
    await cache.set('/Groups/GetAllGroups', { Data: ['a'] }, undefined, 1_000);
    expect(await cache.get('/Groups/GetAllGroups')).toEqual({ Data: ['a'] });
    advance(1_001);
    expect(await cache.get('/Groups/GetAllGroups')).toBeNull();
    expect(await cache.getStale('/Groups/GetAllGroups')).toEqual({ Data: ['a'] });
  });

  it('scopes entries by server and identity', async () => {
    const { cache, scope } = setup();
    await cache.set('/Contacts/GetAllContacts', { Data: ['mine'] }, undefined, 60_000);
    scope.value = 'https://api.example.com/api/v4_dept1_user2';
    expect(await cache.get('/Contacts/GetAllContacts')).toBeNull();
    expect(await cache.getStale('/Contacts/GetAllContacts')).toBeNull();
  });

  it('evicts corrupt and malformed entries instead of throwing forever', async () => {
    const { cache, store } = setup();
    const key = 'api_cache_https://api.example.com/api/v4_dept1_user1_/Notes/GetAllNotes';
    await store.set(key, '{not json');
    expect(await cache.get('/Notes/GetAllNotes')).toBeNull();
    expect(store.snapshot()[key]).toBeUndefined();
    await store.set(key, JSON.stringify({ data: 1 }));
    expect(await cache.getStale('/Notes/GetAllNotes')).toBeNull();
    expect(store.snapshot()[key]).toBeUndefined();
  });

  it('removes every param combination of an endpoint', async () => {
    const { cache, store } = setup();
    await cache.set('/Routes/GetRoutePlans', 1, undefined, 60_000);
    await cache.set('/Routes/GetRoutePlans', 2, { unitId: 5 }, 60_000);
    await cache.set('/Routes/GetRoutePlansForUnit', 3, undefined, 60_000);
    await cache.removeEndpoint('/Routes/GetRoutePlans');
    expect(Object.keys(store.snapshot())).toEqual(['api_cache_https://api.example.com/api/v4_dept1_user1_/Routes/GetRoutePlansForUnit']);
  });

  it('prunes entries past the stale retention and caps the entry count (oldest first)', async () => {
    const { cache, store, advance } = setup({ maxEntries: 2, staleRetentionMs: 10_000 });
    await cache.set('/A', 1, undefined, 1_000);
    advance(5);
    await cache.set('/B', 2, undefined, 60_000);
    advance(5);
    await cache.set('/C', 3, undefined, 60_000);
    advance(5);
    await cache.set('/D', 4, undefined, 60_000);
    advance(11_001); // /A is now expired beyond its stale retention
    await cache.prune();
    const keys = Object.keys(store.snapshot()).map((key) => key.split('_').pop());
    expect(keys.sort()).toEqual(['/C', '/D']);
  });

  it('clear() removes all cache entries but keeps api_cache_scope and unrelated keys', async () => {
    const { cache, store } = setup();
    await store.set(API_CACHE_SCOPE_KEY, '{"userId":"u1"}');
    await store.set('auth-storage', 'x');
    await cache.set('/Units/GetAllUnits', 1, undefined, 60_000);
    await cache.clear();
    expect(Object.keys(store.snapshot()).sort()).toEqual(['api_cache_scope', 'auth-storage']);
  });

  it('works with an async store', async () => {
    const map = new Map<string, string>();
    const cache = createApiCache({
      store: {
        get: async (key) => map.get(key) ?? null,
        set: async (key, value) => {
          map.set(key, value);
        },
        delete: async (key) => {
          map.delete(key);
        },
        keys: async () => [...map.keys()],
      },
      getScope: () => 's',
    });
    await cache.set('/X', { Data: [1] }, undefined, 60_000);
    expect(await cache.get('/X')).toEqual({ Data: [1] });
  });
});
