import { FeatureFlagKeys, type FeatureFlagStatus, useFeatureFlagStatus } from '@resgrid/auth';
import { useCapability } from '@resgrid/config';
import { toDataError } from '@resgrid/data';
import { useStatusContext } from '@resgrid/features/status';
import type { ChecklistDuePage, ChecklistHistory } from '@resgrid/models';
import { useRealtimeEvent } from '@resgrid/realtime';
import { useCallback, useEffect, useRef, useState } from 'react';

import { checklistErrorKey } from '../lib/checklist-form';
import { fetchChecklistHistory, fetchDueChecklists } from '../lib/checklists-api';

/** `Checklists.System` as a tri-state (unknown waits; unknown flags are disabled once flags load). */
export const useChecklistsFlagStatus = (): FeatureFlagStatus => useFeatureFlagStatus(FeatureFlagKeys.ChecklistsSystem);

/** Unit checks its own apparatus (the device's active unit); every other app checks for the signed-in member. */
export function useChecklistUnitId(): string | null {
  const status = useCapability('status');
  const { activeUnitId } = useStatusContext();
  return status.subject === 'unit' ? activeUnitId : null;
}

export interface DueChecklistsState {
  due: ChecklistDuePage | null;
  isLoading: boolean;
  /** `checklists.errors.<key>` of the last failure, or null. */
  errorKey: string | null;
  reload: () => Promise<void>;
}

/**
 * One page of due checks, held in memory only (it can carry protected names). Realtime `checklistUpdated` pings are
 * invalidation hints: the page is re-read through the normal scoped request, never taken from the event.
 */
export function useDueChecklists(enabled: boolean, page: number, unitId: string | null): DueChecklistsState {
  const [due, setDue] = useState<ChecklistDuePage | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const sequence = useRef(0);

  const reload = useCallback(async () => {
    if (!enabled) return;
    sequence.current += 1;
    const mine = sequence.current;
    setIsLoading(true);
    setErrorKey(null);
    try {
      const next = await fetchDueChecklists(page, unitId);
      if (mine === sequence.current) setDue(next);
    } catch (error) {
      if (mine !== sequence.current) return;
      const key = checklistErrorKey(toDataError(error));
      setErrorKey(key);
      // A refusal (locked, denied) conceals what was shown; a connection failure keeps the last page on screen.
      if (key !== 'offline' && key !== 'retry') setDue(null);
    } finally {
      if (mine === sequence.current) setIsLoading(false);
    }
  }, [enabled, page, unitId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useRealtimeEvent('checklistUpdated', () => void reload(), enabled);

  return { due, isLoading, errorKey, reload };
}

export interface ChecklistHistoryState {
  rows: ChecklistHistory[];
  hasMore: boolean;
  page: number;
  isLoading: boolean;
  errorKey: string | null;
  load: (page: number) => Promise<void>;
}

/** Completed and in-progress runs, page by page, loaded on demand. */
export function useChecklistHistory(unitId: string | null): ChecklistHistoryState {
  const [rows, setRows] = useState<ChecklistHistory[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const load = useCallback(
    async (next: number) => {
      setIsLoading(true);
      setErrorKey(null);
      try {
        const result = await fetchChecklistHistory(next, unitId);
        setRows(result.rows);
        setHasMore(result.hasMore);
        setPage(next);
      } catch (error) {
        setErrorKey(checklistErrorKey(toDataError(error)));
      } finally {
        setIsLoading(false);
      }
    },
    [unitId]
  );

  return { rows, hasMore, page, isLoading, errorKey, load };
}
