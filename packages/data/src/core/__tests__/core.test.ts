import { V4FailureError } from '@resgrid/api';
import { DurableKv } from '@resgrid/offline';
import { createMemoryKvBackend } from '@resgrid/offline/testing';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { httpError, networkError } from '../../__tests__/helpers';
import { assertV4Success, unwrapItem, unwrapList } from '../envelope';
import { isConnectivityError, toDataError } from '../errors';
import { createKeyedFlight } from '../keyed-flight';
import { classifyDataWriteError } from '../outbox';
import { dataPersistOptions, registerPersistedStore, setDataStorage } from '../persist';
import { DataNotConfiguredError, defaultIdGenerator, getDataApiContext, resetDataRuntimeForTests, setDataLocationProvider } from '../runtime';
import { gpsFields, statusTimestamps } from '../status-fields';

afterEach(() => resetDataRuntimeForTests());

describe('envelope helpers', () => {
  it('maps not_found to empty and failure to V4FailureError', () => {
    expect(unwrapList({ Data: [1], Status: 'success' })).toEqual([1]);
    expect(unwrapList({ Data: [1], Status: 'not_found' })).toEqual([]);
    expect(unwrapList(null)).toEqual([]);
    expect(unwrapItem({ Data: { a: 1 }, Status: 'NotFound' })).toBeNull();
    expect(() => unwrapList({ Data: [], Status: 'failure' })).toThrow(V4FailureError);
    expect(() => assertV4Success({ Status: 'failure' })).toThrow(V4FailureError);
    expect(assertV4Success({ Status: 'created', Id: '1' })).toEqual({ Status: 'created', Id: '1' });
  });
});

describe('errors and classification', () => {
  it('maps API errors to translatable codes without bodies', () => {
    expect(toDataError(networkError())).toEqual({ code: 'network', messageKey: 'errors.data.network' });
    expect(toDataError(httpError(403))).toMatchObject({ code: 'forbidden', status: 403 });
    expect(toDataError(httpError(409)).code).toBe('conflict');
    expect(toDataError(httpError(503)).code).toBe('server');
    expect(toDataError(new V4FailureError({ Status: 'failure' })).code).toBe('rejected');
    expect(toDataError(new DataNotConfiguredError('api')).code).toBe('not_configured');
    expect(isConnectivityError(toDataError(networkError()))).toBe(true);
  });

  it('classifies writes: network waits, 401 refreshes auth, 4xx dead-letters, 5xx/429 retry', () => {
    expect(classifyDataWriteError(networkError())).toBe('network');
    expect(classifyDataWriteError(httpError(401))).toBe('auth');
    expect(classifyDataWriteError(httpError(400))).toBe('permanent');
    expect(classifyDataWriteError(httpError(429))).toBe('retry');
    expect(classifyDataWriteError(httpError(500))).toBe('retry');
    expect(classifyDataWriteError(new V4FailureError({ Status: 'failure' }))).toBe('permanent');
  });

  it('throws a typed error when the API context is not configured', () => {
    expect(() => getDataApiContext()).toThrow(DataNotConfiguredError);
  });
});

describe('keyed flight', () => {
  it('shares an in-flight request and queues one trailing run for realtime pings', async () => {
    const flight = createKeyedFlight();
    let calls = 0;
    let release: () => void = () => undefined;
    const fn = () =>
      new Promise<number>((resolve) => {
        calls++;
        const n = calls;
        release = () => resolve(n);
      });
    const a = flight.run('k', fn);
    const b = flight.run('k', fn);
    const c = flight.run('k', fn, { trailing: true });
    const d = flight.run('k', fn, { trailing: true });
    expect(a).toBe(b);
    expect(c).toBe(d);
    release();
    await expect(a).resolves.toBe(1);
    await new Promise((resolve) => setImmediate(resolve));
    release();
    await expect(c).resolves.toBe(2);
    expect(calls).toBe(2);
  });
});

describe('late-bound persistence', () => {
  it('writes nothing before storage is set, then rehydrates every registered store from it', async () => {
    const useStore = create<{ value: number; loading: boolean; bump: () => void }>()(
      persist((set) => ({ value: 0, loading: false, bump: () => set((s) => ({ value: s.value + 1, loading: true })) }), dataPersistOptions({ name: 'omni-test', partialize: (s) => ({ value: s.value }) }))
    );
    registerPersistedStore('omni-test', useStore);
    const kv = new DurableKv(createMemoryKvBackend('persist-test'));
    kv.set('omni-test', JSON.stringify({ state: { value: 41 }, version: 0 }));
    useStore.getState().bump();
    expect(kv.getString('omni-test')).toContain('41');
    await setDataStorage(kv);
    expect(useStore.getState().value).toBe(41);
    useStore.getState().bump();
    expect(JSON.parse(kv.getString('omni-test') ?? '{}')).toEqual({ state: { value: 42 }, version: 0 });
    await setDataStorage(null);
  });
});

describe('status fields', () => {
  it('stamps the moment of the status and fills GPS from the location provider, never 0,0', () => {
    expect(statusTimestamps(Date.UTC(2026, 9, 31, 12))).toEqual({ Timestamp: '2026-10-31T12:00:00.000Z', TimestampUtc: 'Sat, 31 Oct 2026 12:00:00 GMT' });
    expect(gpsFields().Latitude).toBe('');
    setDataLocationProvider(() => ({ latitude: 39.5, longitude: -104.9, accuracy: 5 }));
    expect(gpsFields()).toMatchObject({ Latitude: '39.5', Longitude: '-104.9', Accuracy: '5', Speed: '' });
    expect(gpsFields({ latitude: 0, longitude: 0 }).Latitude).toBe('');
  });

  it('generates RFC 4122 v4 ids', () => {
    expect(defaultIdGenerator()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
