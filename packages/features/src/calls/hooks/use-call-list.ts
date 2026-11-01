import { type CallListItem, queuedCallToListItem, selectActiveCalls, useCallsStore } from '@resgrid/data';
import { type RealtimeEventName, useRealtimeRefetch } from '@resgrid/realtime';
import { useCallback, useEffect, useMemo } from 'react';

/** Call pushes plus the eventing hub rejoin (the hub replays nothing, so catch up after an outage). */
export const CALL_LIST_REFRESH_EVENTS: readonly RealtimeEventName[] = ['callsUpdated', 'callAdded', 'callClosed', 'eventingHubJoined'];

export interface UseCallListOptions {
  /** Load and refresh the pending/scheduled queues (`capabilities.calls.queues`). */
  queues: boolean;
  /** Subscribe to call pushes (off in tests and when another surface already refreshes). */
  realtime?: boolean;
}

export interface CallListData {
  /** This device's queued (not yet accepted) calls first, then the active calls. */
  activeCalls: CallListItem[];
  pendingCalls: CallListItem[];
  scheduledCalls: CallListItem[];
  isLoading: boolean;
  hasError: boolean;
  refresh: () => Promise<void>;
}

/**
 * The call list's data: persisted store reads (works offline), queued calls merged first, and an id-only realtime
 * ping → cache-bypassing refetch (resgrid-realtime-push). Selects raw slices and derives with useMemo: a selector
 * that builds a new array on every read would re-render forever.
 */
export function useCallList({ queues, realtime = true }: UseCallListOptions): CallListData {
  const calls = useCallsStore((state) => state.calls);
  const queuedCalls = useCallsStore((state) => state.queuedCalls);
  const pending = useCallsStore((state) => state.pendingCalls);
  const scheduled = useCallsStore((state) => state.scheduledCalls);
  const isLoading = useCallsStore((state) => state.loading.calls === true);
  const hasError = useCallsStore((state) => !!state.errors.calls);
  const fetchCalls = useCallsStore((state) => state.fetchCalls);
  const fetchCallPriorities = useCallsStore((state) => state.fetchCallPriorities);
  const fetchPendingCalls = useCallsStore((state) => state.fetchPendingCalls);
  const fetchScheduledCalls = useCallsStore((state) => state.fetchScheduledCalls);

  useEffect(() => {
    void fetchCalls();
    void fetchCallPriorities();
    if (queues) {
      void fetchPendingCalls();
      void fetchScheduledCalls();
    }
  }, [fetchCalls, fetchCallPriorities, fetchPendingCalls, fetchScheduledCalls, queues]);

  const refresh = useCallback(async () => {
    const tasks: Promise<void>[] = [fetchCalls({ bypassCache: true })];
    if (queues) tasks.push(fetchPendingCalls({ bypassCache: true }), fetchScheduledCalls({ bypassCache: true }));
    await Promise.all(tasks);
  }, [fetchCalls, fetchPendingCalls, fetchScheduledCalls, queues]);

  useRealtimeRefetch(CALL_LIST_REFRESH_EVENTS, refresh, realtime);

  const activeCalls = useMemo<CallListItem[]>(
    () => [
      ...Object.values(queuedCalls)
        .sort((a, b) => b.createdAt - a.createdAt)
        .map(queuedCallToListItem),
      ...selectActiveCalls({ calls }),
    ],
    [calls, queuedCalls]
  );

  return { activeCalls, pendingCalls: pending, scheduledCalls: scheduled, isLoading, hasError, refresh };
}
