import { useCallDetailStore, useCallsStore, useUnitsStore } from '@resgrid/data';
import { crewOnCall, getReleasedPersonnel, getReleasedUnits, newerDispatches } from '@resgrid/features/calls';
import type { CallExtraDataResultData, CallResultData, DispatchedEventResultData } from '@resgrid/models';
import { useEffect, useMemo } from 'react';

import type { ConsoleCallFilter } from '../lib/console-filters';
import { useConsoleStore } from './use-console-store';

const NO_DISPATCHES: DispatchedEventResultData[] = [];

export interface SelectedCall {
  callId: string | null;
  call: CallResultData | null;
  extraData: CallExtraDataResultData | null;
  /** The filter the resource panels apply (null when the console is not filtered to a call): its dispatches and who was released. */
  callFilter: ConsoleCallFilter | null;
  isLoading: boolean;
}

/**
 * The call the console is filtered to: its row from the active list, and its dispatches and activity from the call
 * detail store (fetched bypassing caches when the filter turns on; refreshed by call pushes in `useConsoleData`). The
 * dispatches are the newer of the detail's read and the call list's: a release re-reads both, and when the detail read
 * fails the list's newer copy still drops the released unit or person.
 */
export function useSelectedCall(): SelectedCall {
  const callId = useConsoleStore((state) => (state.isCallFilterActive ? state.selectedCallId : null));
  const listCall = useCallsStore((state) => (callId ? state.calls.find((call) => call.CallId === callId) : undefined));
  const record = useCallDetailStore((state) => (callId ? state.details[callId] : undefined));
  const isLoading = useCallDetailStore((state) => state.loading.detail === true);
  const dispatchesFromList = useCallsStore((state) => (callId ? state.callDispatches[callId] : undefined));
  const listFetchedAt = useCallsStore((state) => (callId ? state.callDispatchesFetchedAt[callId] : undefined));
  const units = useUnitsStore((state) => state.unitInfos);

  useEffect(() => {
    if (callId) void useCallDetailStore.getState().fetchCallDetail(callId, { bypassCache: true });
  }, [callId]);

  const extraData = record?.extraData ?? null;
  const dispatches = newerDispatches({ dispatches: extraData?.Dispatches, fetchedAt: record?.fetchedAt }, { dispatches: dispatchesFromList, fetchedAt: listFetchedAt }) ?? NO_DISPATCHES;
  // Until the extra data loads (or from an older server) nobody reads as released.
  const releasedUnits = getReleasedUnits(extraData);
  const releasedPersonnel = getReleasedPersonnel(extraData);
  // Members riding a dispatched unit are on the call too (Core releases them like anyone dispatched).
  const crewUserIds = useMemo(() => crewOnCall(units, dispatches), [dispatches, units]);

  const callFilter = useMemo<ConsoleCallFilter | null>(() => (callId ? { callId, dispatches, releasedUnits, releasedPersonnel, crewUserIds } : null), [callId, crewUserIds, dispatches, releasedPersonnel, releasedUnits]);

  return { callId, call: listCall ?? record?.call ?? null, extraData, callFilter, isLoading };
}
