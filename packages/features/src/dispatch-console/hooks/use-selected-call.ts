import { useCallDetailStore, useCallsStore } from '@resgrid/data';
import type { CallExtraDataResultData, CallResultData, DispatchedEventResultData } from '@resgrid/models';
import { useEffect, useMemo } from 'react';

import type { ConsoleCallFilter } from '../lib/console-filters';
import { useConsoleStore } from './use-console-store';

const NO_DISPATCHES: DispatchedEventResultData[] = [];

export interface SelectedCall {
  callId: string | null;
  call: CallResultData | null;
  extraData: CallExtraDataResultData | null;
  /** The filter the resource panels apply (null when the console is not filtered to a call). */
  callFilter: ConsoleCallFilter | null;
  isLoading: boolean;
}

/**
 * The call the console is filtered to: its row from the active list, and its dispatches and activity from the call
 * detail store (fetched bypassing caches when the filter turns on; refreshed by call pushes in `useConsoleData`).
 */
export function useSelectedCall(): SelectedCall {
  const callId = useConsoleStore((state) => (state.isCallFilterActive ? state.selectedCallId : null));
  const listCall = useCallsStore((state) => (callId ? state.calls.find((call) => call.CallId === callId) : undefined));
  const record = useCallDetailStore((state) => (callId ? state.details[callId] : undefined));
  const isLoading = useCallDetailStore((state) => state.loading.detail === true);
  const dispatchesFromList = useCallsStore((state) => (callId ? state.callDispatches[callId] : undefined));

  useEffect(() => {
    if (callId) void useCallDetailStore.getState().fetchCallDetail(callId, { bypassCache: true });
  }, [callId]);

  const extraData = record?.extraData ?? null;
  const dispatches = extraData?.Dispatches ?? dispatchesFromList ?? NO_DISPATCHES;
  const callFilter = useMemo<ConsoleCallFilter | null>(() => (callId ? { callId, dispatches } : null), [callId, dispatches]);

  return { callId, call: listCall ?? record?.call ?? null, extraData, callFilter, isLoading };
}
