import { createTestContext, httpError, lastRequest, networkError, ok } from '../../__tests__/helpers';
import { NoActiveSessionError } from '../api-error';
import { defineEndpoints } from '../endpoint';
import { cachedRequest, cachedRequestWithSource, createCachedEndpoint, invalidateEndpoint, isEmptyPayload, request } from '../request';

const E = defineEndpoints('test', {
  getCall: { method: 'GET', path: '/Calls/GetCall', query: ['callId'] },
  getPoi: { method: 'GET', path: '/Mapping/GetPoi/{poiId}', cacheTtlMs: 60_000 },
  getUnits: { method: 'GET', path: '/Units/GetAllUnits', cacheTtlMs: 60_000, query: ['type'] },
  saveCall: { method: 'POST', path: '/Calls/SaveCall', body: 'json' },
  ack: { method: 'POST', path: '/Chat/Ack', query: ['messageId'] },
  upload: { method: 'POST', path: '/Chat/UploadAttachment', query: ['channelId'], body: 'multipart' },
  token: { method: 'POST', path: '/Connect/token', body: 'form', anonymous: true },
  system: { method: 'GET', path: '/Config/GetSystemConfig', anonymous: true },
});

describe('request()', () => {
  it('builds path and query from one params object, encoding once', async () => {
    const { ctx, adapter } = createTestContext();
    await request(ctx, E.getCall, { params: { callId: 'a b/1' } });
    expect(lastRequest(adapter).url).toBe('/Calls/GetCall?callId=a+b%2F1');
    await request(ctx, E.getPoi, { params: { poiId: 'x/y' } });
    expect(lastRequest(adapter).url).toBe('/Mapping/GetPoi/x%2Fy');
  });

  it('refuses parameters the registry does not declare (registry cannot drift from what is sent)', async () => {
    const { ctx, adapter } = createTestContext();
    await expect(request(ctx, E.getCall, { params: { callId: '1', _t: 123 } })).rejects.toThrow('Parameter "_t" is not declared for test.getCall');
    expect(adapter).not.toHaveBeenCalled();
  });

  it('throws when a path parameter is missing', async () => {
    const { ctx } = createTestContext();
    await expect(request(ctx, E.getPoi, { params: {} })).rejects.toThrow('Missing path parameter "poiId"');
  });

  it('sends JSON bodies, form bodies and FormData', async () => {
    const { ctx, adapter } = createTestContext();
    await request(ctx, E.saveCall, { body: { Name: 'Fire' } });
    expect(JSON.parse(lastRequest(adapter).data as string)).toEqual({ Name: 'Fire' });
    expect(lastRequest(adapter).method).toBe('post');

    await request(ctx, E.token, { body: { grant_type: 'refresh_token', refresh_token: 'r' } });
    expect(String(lastRequest(adapter).data)).toBe('grant_type=refresh_token&refresh_token=r');
    expect(lastRequest(adapter).headers['Content-Type']).toBe('application/x-www-form-urlencoded');

    const form = new FormData();
    form.append('file', 'abc');
    await request(ctx, E.upload, { params: { channelId: 'c1' }, body: form });
    expect(lastRequest(adapter).data).toBe(form);
    expect(lastRequest(adapter).headers['Content-Type']).toBe('multipart/form-data');
  });

  it('sends no body for body-less POSTs', async () => {
    const { ctx, adapter } = createTestContext();
    await request(ctx, E.ack, { params: { messageId: 'm1' } });
    expect(lastRequest(adapter).data).toBeUndefined();
  });

  it('returns not_found envelopes as data (HTTP 200)', async () => {
    const { ctx, adapter } = createTestContext();
    adapter.mockImplementation(async (config) => ok(config, { Status: 'not_found', Data: null }));
    await expect(request(ctx, E.getCall, { params: { callId: '9' } })).resolves.toEqual({ Status: 'not_found', Data: null });
  });

  it('sends anonymous endpoints without a session', async () => {
    const { ctx, adapter, auth } = createTestContext();
    auth.accessToken = null;
    auth.active = false;
    await request(ctx, E.system);
    expect(lastRequest(adapter).headers.Authorization).toBeUndefined();
    await expect(request(ctx, E.getCall, { params: { callId: '1' } })).rejects.toBeInstanceOf(NoActiveSessionError);
  });

  it('applies a per-call timeout', async () => {
    const { ctx, adapter } = createTestContext();
    await request(ctx, E.saveCall, { body: {} }, { timeoutMs: 60_000 });
    expect(lastRequest(adapter).timeout).toBe(60_000);
  });
});

describe('isEmptyPayload', () => {
  it.each([
    [null, true],
    [undefined, true],
    [[], true],
    [{ Data: [] }, true],
    [{ Data: null }, true],
    [{ Status: 'not_found', Data: [1] }, true],
    [{ Status: 'NotFound' }, false],
    [{ Data: [1] }, false],
    [{ Data: { Id: 1 } }, false],
    [{ Status: 'success' }, false],
    ['text', false],
  ])('%p -> %p', (payload, expected) => {
    expect(isEmptyPayload(payload)).toBe(expected);
  });
});

describe('cached requests (Unit cached client + IC offline fallback)', () => {
  const units = { Status: 'success', Data: [{ UnitId: '1' }] };

  it('serves a fresh cache hit without a request, until forceRefresh', async () => {
    const { ctx, adapter } = createTestContext();
    adapter.mockImplementation(async (config) => ok(config, units));
    await cachedRequest(ctx, E.getUnits);
    await expect(cachedRequestWithSource(ctx, E.getUnits)).resolves.toEqual({ data: units, source: 'cache' });
    expect(adapter).toHaveBeenCalledTimes(1);
    await expect(cachedRequestWithSource(ctx, E.getUnits, {}, { forceRefresh: true })).resolves.toEqual({ data: units, source: 'network' });
    expect(adapter).toHaveBeenCalledTimes(2);
  });

  it('keys cached entries by resolved path and query', async () => {
    const { ctx, store, adapter } = createTestContext();
    adapter.mockImplementation(async (config) => ok(config, units));
    await cachedRequest(ctx, E.getPoi, { params: { poiId: 7 } });
    await cachedRequest(ctx, E.getUnits, { params: { type: 2 } });
    expect(Object.keys(store.snapshot()).map((key) => key.replace(/^api_cache_.*?_user1_/, ''))).toEqual(['/Mapping/GetPoi/7', '/Units/GetAllUnits?type=2']);
  });

  it('never stores an empty or not_found payload, and evicts a previous entry when one arrives', async () => {
    const { ctx, store, adapter } = createTestContext();
    adapter.mockImplementationOnce(async (config) => ok(config, units));
    await cachedRequest(ctx, E.getUnits);
    expect(Object.keys(store.snapshot())).toHaveLength(1);
    adapter.mockImplementationOnce(async (config) => ok(config, { Status: 'not_found', Data: [] }));
    await expect(cachedRequest(ctx, E.getUnits, {}, { forceRefresh: true })).resolves.toEqual({ Status: 'not_found', Data: [] });
    expect(Object.keys(store.snapshot())).toHaveLength(0);
  });

  it('serves the last stored value as stale when the network fails, and rethrows when there is none', async () => {
    const { ctx, adapter, scope } = createTestContext();
    adapter.mockImplementationOnce(async (config) => ok(config, units));
    await cachedRequest(ctx, E.getUnits);
    adapter.mockImplementation(async (config) => {
      throw networkError(config);
    });
    await expect(cachedRequestWithSource(ctx, E.getUnits, {}, { forceRefresh: true })).resolves.toEqual({ data: units, source: 'stale' });
    scope.value = 'another-identity';
    await expect(cachedRequestWithSource(ctx, E.getUnits, {}, { forceRefresh: true })).rejects.toMatchObject({ kind: 'network' });
  });

  it('does not serve stale data for a final 4xx answer', async () => {
    const { ctx, adapter } = createTestContext();
    adapter.mockImplementationOnce(async (config) => ok(config, units));
    await cachedRequest(ctx, E.getUnits);
    adapter.mockImplementation(async (config) => {
      throw httpError(config, 403);
    });
    await expect(cachedRequest(ctx, E.getUnits, {}, { forceRefresh: true })).rejects.toMatchObject({ status: 403 });
  });

  it('does not store a response under a new identity when the scope changes while it is pending', async () => {
    const { ctx, adapter, store, scope } = createTestContext();
    adapter.mockImplementation(async (config) => {
      scope.value = 'https://api.example.com/api/v4_dept1_user2';
      return ok(config, units);
    });
    await expect(cachedRequest(ctx, E.getUnits)).resolves.toEqual(units);
    expect(Object.keys(store.snapshot())).toHaveLength(0);
  });

  it('does not evict the new identity entry when an empty response lands after a scope change', async () => {
    const { ctx, adapter, store, scope, cache } = createTestContext();
    scope.value = 'next';
    await cache.set('/Units/GetAllUnits', units, undefined, 60_000);
    scope.value = 'first';
    adapter.mockImplementation(async (config) => {
      scope.value = 'next';
      return ok(config, { Status: 'not_found', Data: [] });
    });
    await cachedRequest(ctx, E.getUnits);
    expect(Object.keys(store.snapshot())).toEqual(['api_cache_next_/Units/GetAllUnits']);
  });

  it('applies the per-variant TTL policy and can bypass the cache', async () => {
    const { http, cache, adapter, store } = createTestContext();
    adapter.mockImplementation(async (config) => ok(config, units));
    const ttl = jest.fn((_path: string, defaultTtl: number) => defaultTtl * 48);
    await cachedRequest({ http, cache, cachePolicy: { ttlMs: ttl } }, E.getUnits);
    expect(ttl).toHaveBeenCalledWith('/Units/GetAllUnits', 60_000);
    expect(JSON.parse(Object.values(store.snapshot())[0]).expiresIn).toBe(2_880_000);

    await cachedRequest({ http, cache, cachePolicy: { enabled: () => false } }, E.getUnits);
    await cachedRequest({ http, cache, cachePolicy: { enabled: () => false } }, E.getUnits);
    expect(adapter).toHaveBeenCalledTimes(3);
  });

  it('works without a cache (plain request)', async () => {
    const { http, adapter } = createTestContext();
    adapter.mockImplementation(async (config) => ok(config, units));
    await cachedRequest({ http }, E.getUnits);
    await cachedRequest({ http }, E.getUnits);
    expect(adapter).toHaveBeenCalledTimes(2);
  });

  it('invalidates endpoints after writes', async () => {
    const { ctx, adapter, store } = createTestContext();
    adapter.mockImplementation(async (config) => ok(config, units));
    await cachedRequest(ctx, E.getUnits);
    await cachedRequest(ctx, E.getUnits, { params: { type: 1 } });
    await cachedRequest(ctx, E.getPoi, { params: { poiId: 3 } });
    await invalidateEndpoint(ctx, E.getUnits);
    await invalidateEndpoint(ctx, E.getPoi, { poiId: 3 });
    expect(Object.keys(store.snapshot())).toHaveLength(0);
  });

  it('createCachedEndpoint exposes source and invalidation', async () => {
    const { ctx, adapter } = createTestContext();
    adapter.mockImplementation(async (config) => ok(config, units));
    const endpoint = createCachedEndpoint<typeof units>(ctx, { definition: E.getUnits, ttlMs: 1 });
    await expect(endpoint.get()).resolves.toMatchObject({ source: 'network' });
    await endpoint.invalidate();
    await expect(endpoint.get()).resolves.toMatchObject({ source: 'network' });
    expect(adapter).toHaveBeenCalledTimes(2);
  });
});
