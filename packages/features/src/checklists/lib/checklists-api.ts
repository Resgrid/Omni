import { getChecklistHistory, getChecklistRun, getChecklistRunImage, getDepartmentCalendarItemsInRange, getDueChecklists } from '@resgrid/api';
import { getDataApiContext, unwrapItem, unwrapList } from '@resgrid/data';
import type { CalendarItemResultData, ChecklistDuePage, ChecklistHistory, ChecklistRun } from '@resgrid/models';

/*
 * Checklist reads @resgrid/data does not hold yet. Deliberately uncached and never persisted: due lists, runs and
 * evidence can carry protected (ADP) answers, and the shared client attaches only the in-memory grant.
 * TODO(data): `useChecklistsStore` gains `fetchDue` / `fetchHistory` and the legacy encrypted working set
 * (`checklists-ciphertext-v1`, plan §8.5).
 */

const EMPTY_DUE: ChecklistDuePage = { Occurrences: [], Definitions: [], HasMoreOccurrences: false, HasMoreDefinitions: false };

/** One page of due checks and on-demand definitions — for a unit (Unit app) or the signed-in member. */
export async function fetchDueChecklists(page: number, unitId?: string | null): Promise<ChecklistDuePage> {
  const params = unitId ? { Page: page, UnitId: unitId } : { Page: page, ForCurrentUser: true };
  return unwrapItem(await getDueChecklists(getDataApiContext(), params)) ?? EMPTY_DUE;
}

export async function fetchChecklistHistory(page: number, unitId?: string | null): Promise<{ rows: ChecklistHistory[]; hasMore: boolean }> {
  const result = await getChecklistHistory(getDataApiContext(), unitId ? { Page: page, UnitId: unitId } : { Page: page });
  return { rows: unwrapList(result), hasMore: result?.HasMore === true };
}

/** Previews a scheduled occurrence without creating a run (Core requires exactly one of `id` / `occurrenceId`). */
export async function previewChecklistOccurrence(occurrenceId: string): Promise<ChecklistRun | null> {
  return unwrapItem(await getChecklistRun(getDataApiContext(), { occurrenceId }));
}

/** A run's evidence photo as a `data:` URI, held in memory only (never a shared cache file). */
export async function fetchChecklistEvidence(fileId: string): Promise<string> {
  return getChecklistRunImage(getDataApiContext(), fileId);
}

/** Checklist occurrences on the department calendar for one month (virtual entries only). */
export async function fetchChecklistCalendar(start: string, end: string): Promise<CalendarItemResultData[]> {
  return unwrapList(await getDepartmentCalendarItemsInRange(getDataApiContext(), { start, end, includeChecklists: true })).filter((entry) => entry.IsVirtual === true);
}
