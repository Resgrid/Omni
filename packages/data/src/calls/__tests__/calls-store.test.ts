import { getActiveCalls, getAllCallPriorities, getAllCallTypes, getAllPendingScheduledCalls, getCall, getCallExtraData, getCallLocationHistory, getNewCallData, getPendingCalls, saveCall } from '@resgrid/api';
import type { CallResultData } from '@resgrid/models';
import { defaultResetRegistry } from '@resgrid/offline';

import { createDataTestRuntime, type DataTestRuntime, flush, httpError, manifest, networkError, notFound, ok, persisted } from '../../__tests__/helpers';
import { setDataStorage } from '../../core/persist';
import { setDataVariant } from '../../core/runtime';
import { CALL_CREATE_EVENT, configureCallsCachePolicy, selectCallListWithQueued, selectUnacknowledgedSyncedCalls, useCallsStore } from '../calls-store';

jest.mock('@resgrid/api', () => ({
  ...jest.requireActual('@resgrid/api'),
  getActiveCalls: jest.fn(),
  getAllCallPriorities: jest.fn(),
  getAllCallTypes: jest.fn(),
  getCallExtraData: jest.fn(),
  getNewCallData: jest.fn(),
  getPendingCalls: jest.fn(),
  getAllPendingScheduledCalls: jest.fn(),
  saveCall: jest.fn(),
  getCall: jest.fn(),
  getCallLocationHistory: jest.fn(),
}));

const call = (CallId: string, overrides: Partial<CallResultData> = {}): CallResultData =>
  ({ CallId, Name: `Call ${CallId}`, State: 0, Number: `C-${CallId}`, LoggedOnUtc: '2026-10-31T11:00:00Z', ...overrides }) as CallResultData;

const request = { name: 'Structure fire', nature: 'Smoke showing', priority: 2, latitude: 39.1, longitude: -104.8, address: '1 Main St' };

let runtime: DataTestRuntime;

beforeEach(async () => {
  jest.mocked(getActiveCalls).mockResolvedValue(ok([call('1'), call('2')]) as never);
  jest.mocked(getAllCallPriorities).mockResolvedValue(ok([{ Id: 1, Name: 'High' }]) as never);
  jest.mocked(getAllCallTypes).mockResolvedValue(ok([{ Id: 'a', Name: 'Fire' }]) as never);
  jest.mocked(getCallExtraData).mockResolvedValue(ok({ Dispatches: [] }) as never);
  jest.mocked(getCallLocationHistory).mockResolvedValue(ok({ Calls: [] }) as never);
  configureCallsCachePolicy(null);
  runtime = await createDataTestRuntime({ variant: 'unit' });
  await defaultResetRegistry.getStoreResets().get('data.calls')?.('logout');
});

describe('calls store: fetch', () => {
  it('loads calls, priorities and types into separate slices', async () => {
    await useCallsStore.getState().init();
    const state = useCallsStore.getState();
    expect(state.calls.map((c) => c.CallId)).toEqual(['1', '2']);
    expect(state.callPriorities).toHaveLength(1);
    expect(state.callTypes).toHaveLength(1);
    expect(state.loading.calls).toBe(false);
    expect(state.errors.calls).toBeNull();
    expect(state.fetchedAt.calls).toBe(runtime.clock.now());
  });

  it('records a translatable error code per slice and keeps the other slices', async () => {
    jest.mocked(getAllCallTypes).mockRejectedValue(networkError());
    await useCallsStore.getState().init();
    const state = useCallsStore.getState();
    expect(state.calls).toHaveLength(2);
    expect(state.errors.types).toEqual({ code: 'network', messageKey: 'errors.data.network' });
    expect(state.errors.calls).toBeNull();
  });

  it('treats a not_found envelope as an empty list, not an error', async () => {
    jest.mocked(getActiveCalls).mockResolvedValue(notFound([]) as never);
    await useCallsStore.getState().fetchCalls();
    expect(useCallsStore.getState().calls).toEqual([]);
    expect(useCallsStore.getState().errors.calls).toBeNull();
  });

  it('turns a failure envelope into a rejected error', async () => {
    jest.mocked(getActiveCalls).mockResolvedValue({ Data: [], Status: 'failure' } as never);
    await useCallsStore.getState().fetchCalls();
    expect(useCallsStore.getState().errors.calls?.code).toBe('rejected');
  });

  it('passes bypassCache to the cached endpoint as forceRefresh (realtime pings)', async () => {
    await useCallsStore.getState().fetchCalls({ bypassCache: true });
    expect(getActiveCalls).toHaveBeenLastCalledWith(expect.anything(), { forceRefresh: true });
    await useCallsStore.getState().fetchCalls();
    expect(getActiveCalls).toHaveBeenLastCalledWith(expect.anything(), { forceRefresh: false });
  });

  it('always bypasses the cache on the Dispatch console variant', async () => {
    setDataVariant(manifest('dispatch'));
    await useCallsStore.getState().fetchCalls();
    expect(getActiveCalls).toHaveBeenLastCalledWith(expect.anything(), { forceRefresh: true });
  });

  it('loads Unit/IC new-call form data and dedupes per-call dispatches (IC)', async () => {
    jest.mocked(getNewCallData).mockResolvedValue(ok({ Priorities: [{ Id: 9 }], CallTypes: [], DestinationPois: [{ PoiId: 3 }], PoiTypes: [{ PoiTypeId: 1 }] }) as never);
    jest.mocked(getCallExtraData).mockResolvedValue(
      ok({
        Dispatches: [
          { Id: 'u1', Name: 'Engine 1' },
          { Id: 'u1', Name: 'Engine 1' },
        ],
      }) as never
    );
    await useCallsStore.getState().fetchCallFormData();
    await useCallsStore.getState().fetchCallDispatches(['1']);
    const state = useCallsStore.getState();
    expect(state.destinationPois).toHaveLength(1);
    expect(state.callPriorities[0].Id).toBe(9);
    expect(state.callDispatches['1']).toHaveLength(1);
  });

  it('does not cache a failed dispatch fetch as empty (Unit)', async () => {
    jest.mocked(getCallExtraData).mockRejectedValue(networkError());
    await useCallsStore.getState().fetchCallDispatches(['1']);
    expect(useCallsStore.getState().callDispatches['1']).toBeUndefined();
  });

  it('evicts per-call extras for calls that are no longer open', async () => {
    await useCallsStore.getState().fetchCalls();
    await useCallsStore.getState().prefetchCallExtras(['1', '2']);
    expect(Object.keys(useCallsStore.getState().callExtrasById)).toEqual(['1', '2']);
    jest.mocked(getActiveCalls).mockResolvedValue(ok([call('2')]) as never);
    await useCallsStore.getState().fetchCalls();
    expect(Object.keys(useCallsStore.getState().callExtrasById)).toEqual(['2']);
  });

  it('refreshes the pending list always and the scheduled list only once loaded (Dispatch)', async () => {
    jest.mocked(getPendingCalls).mockResolvedValue(ok([call('p', { State: 8 })]) as never);
    jest.mocked(getAllPendingScheduledCalls).mockResolvedValue(ok([call('s')]) as never);
    await useCallsStore.getState().refreshQueuedCallLists();
    expect(getAllPendingScheduledCalls).not.toHaveBeenCalled();
    await useCallsStore.getState().fetchScheduledCalls();
    await useCallsStore.getState().refreshQueuedCallLists();
    expect(getAllPendingScheduledCalls).toHaveBeenCalledTimes(2);
    expect(useCallsStore.getState().pendingCalls).toHaveLength(1);
  });
});

describe('calls store: persistence and reset', () => {
  it('persists data and sync metadata only (no loading flags or errors)', async () => {
    await useCallsStore.getState().fetchCalls();
    const blob = persisted(runtime.kv, 'calls-storage');
    expect(blob?.version).toBe(1);
    expect(Object.keys(blob?.state ?? {})).toEqual(expect.arrayContaining(['calls', 'queuedCalls', 'fetchedAt']));
    expect(blob?.state).not.toHaveProperty('loading');
    expect(blob?.state).not.toHaveProperty('errors');
  });

  it("migrates IC's v0 calls-storage (lastFetchedAt) on rehydrate", async () => {
    runtime.kv.set('calls-storage', JSON.stringify({ state: { calls: [call('legacy')], callPriorities: [], callTypes: [], callDispatches: {}, lastFetchedAt: 1234 }, version: 0 }));
    await setDataStorage(runtime.kv);
    expect(useCallsStore.getState().calls[0].CallId).toBe('legacy');
    expect(useCallsStore.getState().fetchedAt.calls).toBe(1234);
  });

  it('resets on wipe and drops answers that land after the reset', async () => {
    let resolve: (value: unknown) => void = () => undefined;
    jest.mocked(getActiveCalls).mockImplementation(() => new Promise((r) => (resolve = r)) as never);
    const pending = useCallsStore.getState().fetchCalls();
    await defaultResetRegistry.getStoreResets().get('data.calls')?.('logout');
    resolve(ok([call('late')]));
    await pending;
    expect(useCallsStore.getState().calls).toEqual([]);
  });
});

describe('offline call creation', () => {
  it('online: sends SaveCall with the client GUID as idempotency key and keeps no queued record', async () => {
    jest.mocked(saveCall).mockResolvedValue({ Id: '500', Status: 'success' } as never);
    jest.mocked(getCall).mockResolvedValue(ok(call('500', { Number: '26-500' })) as never);
    jest.mocked(getActiveCalls).mockResolvedValue(ok([call('500', { Number: '26-500' }), call('1')]) as never);
    const result = await useCallsStore.getState().createCall(request);
    expect(result.outcome).toBe('sent');
    expect(saveCall).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ Name: 'Structure fire', Geolocation: '39.1,-104.8', IdempotencyKey: result.id, ClientCallId: result.id }));
    await flush();
    const state = useCallsStore.getState();
    expect(state.queuedCalls).toEqual({});
    expect(state.calls[0].CallId).toBe('500');
    expect(state.syncedCalls[result.id]).toMatchObject({ callId: '500', number: '26-500', possibleDuplicate: false });
  });

  it('offline: keeps a local "queued" record shown in the call list, then the server call replaces it on drain', async () => {
    runtime.connectivity.setOnline(false);
    await useCallsStore.getState().fetchCalls();
    const result = await useCallsStore.getState().createCall(request);
    expect(result.outcome).toBe('queued');
    expect(saveCall).not.toHaveBeenCalled();

    const list = selectCallListWithQueued(useCallsStore.getState());
    expect(list[0]).toMatchObject({ CallId: result.id, Number: '', Name: 'Structure fire', queued: { localId: result.id, state: 'queued' } });
    expect(persisted(runtime.kv, 'calls-storage')?.state.queuedCalls).toHaveProperty(result.id);

    jest.mocked(saveCall).mockResolvedValue({ Id: '501', Status: 'success' } as never);
    jest.mocked(getCall).mockResolvedValue(ok(call('501', { Number: '26-501' })) as never);
    runtime.connectivity.setOnline(true);
    const drain = await runtime.outbox.drain();
    expect(drain.sent).toEqual([result.id]);
    await flush();

    const state = useCallsStore.getState();
    expect(state.queuedCalls[result.id]).toBeUndefined();
    expect(selectCallListWithQueued(state).some((item) => item.queued)).toBe(false);
    expect(selectUnacknowledgedSyncedCalls(state)).toEqual([expect.objectContaining({ localId: result.id, callId: '501', number: '26-501' })]);
    useCallsStore.getState().acknowledgeSyncedCall(result.id);
    expect(selectUnacknowledgedSyncedCalls(useCallsStore.getState())).toEqual([]);
  });

  it('network failure while online keeps the call queued (not rejected)', async () => {
    jest.mocked(saveCall).mockRejectedValue(networkError());
    const result = await useCallsStore.getState().createCall(request);
    expect(result.outcome).toBe('queued');
    expect(useCallsStore.getState().queuedCalls[result.id].state).toBe('queued');
  });

  it('a server rejection stays in Pending sync (dead-lettered) with the local record marked rejected, and can be corrected', async () => {
    jest.mocked(saveCall).mockRejectedValue(httpError(400));
    const result = await useCallsStore.getState().createCall(request);
    expect(result.outcome).toBe('rejected');
    expect(useCallsStore.getState().queuedCalls[result.id].state).toBe('rejected');
    const [row] = await runtime.rows();
    expect(row).toMatchObject({ id: result.id, type: CALL_CREATE_EVENT, state: 'dead' });

    jest.mocked(saveCall).mockResolvedValue({ Id: '502', Status: 'success' } as never);
    jest.mocked(getCall).mockResolvedValue(ok(call('502')) as never);
    const corrected = await useCallsStore.getState().correctQueuedCall(result.id, { ...request, name: 'Structure fire (corrected)' });
    expect(corrected).toBe(true);
    await flush();
    expect(saveCall).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ Name: 'Structure fire (corrected)', IdempotencyKey: result.id }));
    expect(useCallsStore.getState().queuedCalls[result.id]).toBeUndefined();
  });

  it('discarding a rejected call from Pending sync removes the local record', async () => {
    jest.mocked(saveCall).mockRejectedValue(httpError(422));
    const result = await useCallsStore.getState().createCall(request);
    await runtime.outbox.discard(result.id, { confirmed: true });
    expect(useCallsStore.getState().queuedCalls[result.id]).toBeUndefined();
  });

  it('flags a possible duplicate after sync (another call at the location within the window)', async () => {
    jest.mocked(saveCall).mockResolvedValue({ Id: '503', Status: 'success' } as never);
    jest.mocked(getCall).mockResolvedValue(ok(call('503')) as never);
    jest.mocked(getCallLocationHistory).mockResolvedValue(
      ok({
        Calls: [
          { CallId: '503', State: 0, LoggedOnUtc: '2026-10-31T12:00:00Z' },
          { CallId: '77', State: 1, LoggedOnUtc: '2026-10-31T11:40:00' },
          { CallId: '12', State: 1, LoggedOnUtc: '2026-10-01T11:40:00Z' },
        ],
      }) as never
    );
    const result = await useCallsStore.getState().createCall(request);
    await flush();
    expect(useCallsStore.getState().syncedCalls[result.id]).toMatchObject({ possibleDuplicate: true, duplicateCallIds: ['77'] });
  });

  it("is never replayed by another user's session", async () => {
    runtime.connectivity.setOnline(false);
    const result = await useCallsStore.getState().createCall(request);
    runtime.setScope({ server: 'https://api.resgrid.com', departmentId: 1, userId: 'user-b' });
    runtime.connectivity.setOnline(true);
    const drain = await runtime.outbox.drain();
    expect(drain.sent).toEqual([]);
    expect(drain.held).toBe(1);
    expect(saveCall).not.toHaveBeenCalled();
    expect(result.outcome).toBe('queued');
  });
});
