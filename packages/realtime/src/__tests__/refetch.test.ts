import { emitRealtimeEvent } from '../event-bus';
import {
  createDebouncedRealtimeRefetch,
  createIncidentCommandRefresh,
  createKeyedRealtimeRefetch,
  createRealtimeRefetch,
  type RealtimeRefetchContext,
  subscribeIncidentCommandRefresh,
  subscribeRealtimeRefetch,
} from '../refetch';
import { flush, resetRealtime } from './helpers/realtime-test-env';

interface Deferred {
  promise: Promise<void>;
  resolve: () => void;
  reject: (error: Error) => void;
}

const deferred = (): Deferred => {
  let resolve: () => void = () => undefined;
  let reject: (error: Error) => void = () => undefined;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

describe('realtime refetch helpers', () => {
  beforeEach(async () => {
    await resetRealtime();
  });

  it('runs one request in flight plus one trailing re-run, always bypassing caches', async () => {
    const pending: Deferred[] = [];
    const contexts: RealtimeRefetchContext[] = [];
    const fetcher = jest.fn((context: RealtimeRefetchContext) => {
      contexts.push(context);
      const next = deferred();
      pending.push(next);
      return next.promise;
    });
    const refetch = createRealtimeRefetch(fetcher);

    const first = refetch();
    const second = refetch();
    const third = refetch();
    expect(fetcher).toHaveBeenCalledTimes(1);

    pending[0].resolve();
    await flush();
    expect(fetcher).toHaveBeenCalledTimes(2);

    pending[1].resolve();
    await Promise.all([first, second, third]);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(contexts.every((context) => context.bypassCache === true && context.forceRefresh === true)).toBe(true);

    void refetch();
    expect(fetcher).toHaveBeenCalledTimes(3);
    pending[2].resolve();
  });

  it('logs failures instead of throwing into event handlers, and a failure still releases the slot', async () => {
    const fetcher = jest.fn().mockRejectedValueOnce(new Error('500')).mockResolvedValue(undefined);
    const refetch = createRealtimeRefetch(fetcher);
    await expect(refetch()).resolves.toBeUndefined();
    await refetch();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('refetches on any subscribed event and stops after unsubscribe', async () => {
    const fetcher = jest.fn().mockResolvedValue(undefined);
    const unsubscribe = subscribeRealtimeRefetch(['unitStatusUpdated', 'eventingHubJoined'], fetcher);

    emitRealtimeEvent('unitStatusUpdated', '4');
    await flush();
    emitRealtimeEvent('eventingHubJoined', { hub: 'eventing', rejoin: true, at: 1 });
    await flush();
    emitRealtimeEvent('callsUpdated', '1');
    await flush();
    expect(fetcher).toHaveBeenCalledTimes(2);

    unsubscribe();
    emitRealtimeEvent('unitStatusUpdated', '4');
    await flush();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('keeps one flight per key', async () => {
    const gates = new Map<string, Deferred[]>();
    const fetcher = jest.fn((key: string) => {
      const gate = deferred();
      gates.set(key, [...(gates.get(key) ?? []), gate]);
      return gate.promise;
    });
    const refresh = createKeyedRealtimeRefetch(fetcher);

    const a1 = refresh('a');
    const a2 = refresh('a');
    const b1 = refresh('b');
    expect(fetcher.mock.calls.map(([key]) => key)).toEqual(['a', 'b']);

    gates.get('a')?.[0].resolve();
    await flush();
    expect(fetcher.mock.calls.map(([key]) => key)).toEqual(['a', 'b', 'a']);
    gates.get('a')?.[1].resolve();
    gates.get('b')?.[0].resolve();
    await Promise.all([a1, a2, b1]);
  });

  it('debounces a burst into a single run', async () => {
    jest.useFakeTimers();
    try {
      const fetcher = jest.fn().mockResolvedValue(undefined);
      const debounced = createDebouncedRealtimeRefetch(fetcher, 2000);
      debounced.trigger();
      jest.advanceTimersByTime(1500);
      debounced.trigger();
      jest.advanceTimersByTime(1999);
      expect(fetcher).not.toHaveBeenCalled();
      jest.advanceTimersByTime(1);
      expect(fetcher).toHaveBeenCalledTimes(1);
      debounced.trigger();
      debounced.cancel();
      jest.advanceTimersByTime(5000);
      expect(fetcher).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  describe('IC coalesced board refresh', () => {
    it('refreshes a tracked board and debounces a full sync for untracked incidents', async () => {
      jest.useFakeTimers();
      try {
        const refreshBoard = jest.fn().mockResolvedValue(undefined);
        const syncAll = jest.fn().mockResolvedValue(undefined);
        const refresh = createIncidentCommandRefresh({ refreshBoard, syncAll, isTracked: (callId) => callId === '10' });

        refresh.handleIncidentCommandUpdated('10');
        refresh.handleIncidentCommandUpdated('99');
        refresh.handleIncidentCommandUpdated(null);
        expect(refreshBoard).toHaveBeenCalledWith('10', { bypassCache: true, forceRefresh: true });
        expect(syncAll).not.toHaveBeenCalled();

        jest.advanceTimersByTime(2000);
        expect(syncAll).toHaveBeenCalledTimes(1);
        refresh.dispose();
      } finally {
        jest.useRealTimers();
      }
    });

    it('subscribes to incidentCommandUpdated and resyncs after a rejoin', async () => {
      jest.useFakeTimers();
      try {
        const refreshBoard = jest.fn().mockResolvedValue(undefined);
        const syncAll = jest.fn().mockResolvedValue(undefined);
        const unsubscribe = subscribeIncidentCommandRefresh({ refreshBoard, syncAll, isTracked: () => true, fullSyncDebounceMs: 500 });

        emitRealtimeEvent('incidentCommandUpdated', '5');
        emitRealtimeEvent('eventingHubJoined', { hub: 'eventing', rejoin: false, at: 1 });
        jest.advanceTimersByTime(500);
        expect(syncAll).not.toHaveBeenCalled();
        emitRealtimeEvent('eventingHubJoined', { hub: 'eventing', rejoin: true, at: 2 });
        jest.advanceTimersByTime(500);
        expect(syncAll).toHaveBeenCalledTimes(1);
        expect(refreshBoard).toHaveBeenCalledWith('5', expect.objectContaining({ bypassCache: true }));

        unsubscribe();
        emitRealtimeEvent('incidentCommandUpdated', '6');
        expect(refreshBoard).toHaveBeenCalledTimes(1);
      } finally {
        jest.useRealTimers();
      }
    });
  });
});
