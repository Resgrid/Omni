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

const uniqueById = <T extends { Id: string }>(rows: readonly T[]): T[] => {
  const seen = new Set<string>();
  return rows.filter((row) => {
    if (seen.has(row.Id)) return false;
    seen.add(row.Id);
    return true;
  });
};

/** Pages of `GetDueChecklists` as one list: occurrences and definitions each page on their own `HasMore…`. */
export const mergeDuePages = (pages: readonly ChecklistDuePage[]): ChecklistDuePage => ({
  Occurrences: uniqueById(pages.flatMap((page) => page.Occurrences)),
  Definitions: uniqueById(pages.flatMap((page) => page.Definitions)),
  HasMoreOccurrences: pages[pages.length - 1]?.HasMoreOccurrences === true,
  HasMoreDefinitions: pages[pages.length - 1]?.HasMoreDefinitions === true,
});

export interface DueChecklistsState {
  /** Every page loaded so far, merged. */
  due: ChecklistDuePage | null;
  isLoading: boolean;
  isLoadingMore: boolean;
  /** `checklists.errors.<key>` of the last failure, or null. */
  errorKey: string | null;
  /** Re-reads every page loaded so far. */
  reload: () => Promise<void>;
  /** Appends the next page (the server pages occurrences and definitions together). */
  loadMore: () => Promise<void>;
}

/**
 * Due checks and on-demand definitions, held in memory only (they can carry protected names). Realtime
 * `checklistUpdated` pings are invalidation hints: the pages are re-read through the normal scoped request, never
 * taken from the event.
 */
export function useDueChecklists(enabled: boolean, unitId: string | null): DueChecklistsState {
  const [pages, setPages] = useState<ChecklistDuePage[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const sequence = useRef(0);
  const pageCount = useRef(1);

  const fail = useCallback((error: unknown) => {
    const key = checklistErrorKey(toDataError(error));
    setErrorKey(key);
    // A refusal (locked, denied) conceals what was shown; a connection failure keeps the last pages on screen.
    if (key !== 'offline' && key !== 'retry') setPages(null);
  }, []);

  const reload = useCallback(async () => {
    if (!enabled) return;
    sequence.current += 1;
    const mine = sequence.current;
    setIsLoading(true);
    setErrorKey(null);
    try {
      const next = await Promise.all(Array.from({ length: pageCount.current }, (_, page) => fetchDueChecklists(page, unitId)));
      if (mine === sequence.current) setPages(next);
    } catch (error) {
      if (mine === sequence.current) fail(error);
    } finally {
      if (mine === sequence.current) setIsLoading(false);
    }
  }, [enabled, unitId, fail]);

  const loadMore = useCallback(async () => {
    if (!enabled || !pages || isLoadingMore) return;
    const mine = sequence.current;
    setIsLoadingMore(true);
    setErrorKey(null);
    try {
      const next = await fetchDueChecklists(pages.length, unitId);
      // A reload started meanwhile: this page belongs to the old list.
      if (mine !== sequence.current) return;
      pageCount.current = pages.length + 1;
      setPages([...pages, next]);
    } catch (error) {
      if (mine === sequence.current) fail(error);
    } finally {
      setIsLoadingMore(false);
    }
  }, [enabled, pages, isLoadingMore, unitId, fail]);

  useEffect(() => {
    pageCount.current = 1;
    void reload();
  }, [reload]);

  useRealtimeEvent('checklistUpdated', () => void reload(), enabled);

  return { due: pages ? mergeDuePages(pages) : null, isLoading, isLoadingMore, errorKey, reload, loadMore };
}

export interface ChecklistHistoryState {
  rows: ChecklistHistory[];
  hasMore: boolean;
  /** A first page was read (history loads on demand). */
  loaded: boolean;
  /** Reading the first page (first load or refresh). */
  isLoading: boolean;
  isLoadingMore: boolean;
  errorKey: string | null;
  /** Reads the first page again, replacing what was shown. */
  reload: () => Promise<void>;
  /** Appends the next page. */
  loadMore: () => Promise<void>;
}

/** Completed and in-progress runs, newest first, loaded on demand and extended page by page. */
export function useChecklistHistory(unitId: string | null): ChecklistHistoryState {
  const [rows, setRows] = useState<ChecklistHistory[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState<'first' | 'more' | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const sequence = useRef(0);

  const read = useCallback(
    async (next: number, previous: ChecklistHistory[]) => {
      sequence.current += 1;
      const mine = sequence.current;
      setLoading(next === 0 ? 'first' : 'more');
      setErrorKey(null);
      try {
        const result = await fetchChecklistHistory(next, unitId);
        if (mine !== sequence.current) return;
        setRows(uniqueById([...previous, ...result.rows]));
        setHasMore(result.hasMore);
        setPage(next);
        setLoaded(true);
      } catch (error) {
        if (mine === sequence.current) setErrorKey(checklistErrorKey(toDataError(error)));
      } finally {
        if (mine === sequence.current) setLoading(null);
      }
    },
    [unitId]
  );

  const reload = useCallback(() => read(0, []), [read]);
  const loadMore = useCallback(async () => {
    if (hasMore && loading == null) await read(page + 1, rows);
  }, [hasMore, loading, page, rows, read]);

  return { rows, hasMore, loaded, isLoading: loading === 'first', isLoadingMore: loading === 'more', errorKey, reload, loadMore };
}
