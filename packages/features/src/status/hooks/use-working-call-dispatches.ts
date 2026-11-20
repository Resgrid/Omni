import { useCallsStore } from '@resgrid/data';
import type { CallResultData, DispatchedEventResultData } from '@resgrid/models';
import { useEffect } from 'react';

const NO_DISPATCHES: Readonly<Record<string, DispatchedEventResultData[]>> = {};

/**
 * A status set on a unit's behalf (Dispatch, the unit detail): the dispatches of every call it may go to, read while
 * `enabled` (cached reads are reused), so `resolveUnitWorkingCall` names the one call a unit is dispatched to only once it
 * has seen every open call's dispatches. Empty when not enabled.
 */
export function useWorkingCallDispatches(calls: readonly Pick<CallResultData, 'CallId'>[], enabled: boolean): Readonly<Record<string, readonly DispatchedEventResultData[] | undefined>> {
  const idsKey = enabled ? calls.map((call) => call.CallId).join(',') : '';

  useEffect(() => {
    if (idsKey) void useCallsStore.getState().fetchCallDispatches(idsKey.split(','));
  }, [idsKey]);

  return useCallsStore((state) => (enabled ? state.callDispatches : NO_DISPATCHES));
}
