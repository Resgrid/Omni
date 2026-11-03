import type { CalendarItemResultData, ChecklistDefinition, ChecklistDue, ChecklistDuePage, ChecklistHistory, ChecklistTarget } from '@resgrid/models';

import { ChecklistRunState } from './checklist-form';

// Pure search and filter rules for the checklists screen. They only narrow what the server already returned for this
// person or unit; nothing here widens access.

/** `ChecklistOccurrenceState` (Core): a scheduled check's place in its life. */
export const ChecklistOccurrenceState = { InProgress: 0, AwaitingWitness: 1, Submitted: 2, Scheduled: 3, Missed: 4, Skipped: 5, Cancelled: 6 } as const;

export type DueFilter = 'all' | 'missed' | 'inProgress' | 'scheduled';
export const DUE_FILTERS: readonly DueFilter[] = ['all', 'missed', 'inProgress', 'scheduled'];

export type HistoryFilter = 'all' | 'passed' | 'failed' | 'awaitingWitness' | 'inProgress';
export const HISTORY_FILTERS: readonly HistoryFilter[] = ['all', 'passed', 'failed', 'awaitingWitness', 'inProgress'];

export type BadgeTone = 'error' | 'warning' | 'success' | 'info' | 'muted';

const normalize = (value: string): string => value.trim().toLowerCase();

/** Every word of the query appears in one of the fields (case-insensitive), so "engine daily" finds "Daily rig check · Engine 41". An empty query matches. */
export const matchesQuery = (query: string, fields: readonly (string | null | undefined)[]): boolean => {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = fields.filter((field): field is string => !!field).map(normalize);
  return words.every((word) => haystack.some((field) => field.includes(word)));
};

/** Which due filter a scheduled check falls under; `null` for states the due list does not filter on. */
export const dueCategory = (state: number): Exclude<DueFilter, 'all'> | null => {
  if (state === ChecklistOccurrenceState.Missed) return 'missed';
  if (state === ChecklistOccurrenceState.InProgress || state === ChecklistOccurrenceState.AwaitingWitness) return 'inProgress';
  if (state === ChecklistOccurrenceState.Scheduled) return 'scheduled';
  return null;
};

const OCCURRENCE_STATE: Record<number, { labelKey: string; tone: BadgeTone }> = {
  [ChecklistOccurrenceState.InProgress]: { labelKey: 'checklists.labels.InProgress', tone: 'info' },
  [ChecklistOccurrenceState.AwaitingWitness]: { labelKey: 'checklists.labels.AwaitingWitness', tone: 'warning' },
  [ChecklistOccurrenceState.Submitted]: { labelKey: 'checklists.labels.Submitted', tone: 'success' },
  [ChecklistOccurrenceState.Scheduled]: { labelKey: 'checklists.labels.Scheduled', tone: 'muted' },
  [ChecklistOccurrenceState.Missed]: { labelKey: 'checklists.labels.Missed', tone: 'error' },
  [ChecklistOccurrenceState.Skipped]: { labelKey: 'checklists.labels.Skipped', tone: 'muted' },
  [ChecklistOccurrenceState.Cancelled]: { labelKey: 'checklists.labels.Cancelled', tone: 'muted' },
};

/** The badge for a scheduled check's state; `null` for a state this app does not know yet. */
export const occurrenceStateBadge = (state: number): { labelKey: string; tone: BadgeTone } | null => OCCURRENCE_STATE[state] ?? null;

export const dueFilterCounts = (rows: readonly ChecklistDue[]): Record<DueFilter, number> => {
  const counts: Record<DueFilter, number> = { all: rows.length, missed: 0, inProgress: 0, scheduled: 0 };
  for (const row of rows) {
    const category = dueCategory(row.State);
    if (category) counts[category] += 1;
  }
  return counts;
};

export const filterDueChecks = (rows: readonly ChecklistDue[], query: string, filter: DueFilter): ChecklistDue[] =>
  rows.filter((row) => (filter === 'all' || dueCategory(row.State) === filter) && matchesQuery(query, [row.Name, row.Target.Name]));

export interface StartableChecklist {
  definition: ChecklistDefinition;
  /** The targets to offer: all of them when the checklist's name matches, otherwise the ones whose name does. */
  targets: ChecklistTarget[];
}

export const filterDefinitions = (definitions: readonly ChecklistDefinition[], query: string): StartableChecklist[] =>
  definitions.flatMap((definition) => {
    if (matchesQuery(query, [definition.PublishedForm.Name])) return [{ definition, targets: definition.Targets }];
    const targets = definition.Targets.filter((target) => matchesQuery(query, [definition.PublishedForm.Name, target.Name]));
    return targets.length > 0 ? [{ definition, targets }] : [];
  });

/** Checklist names by definition id, from what the due page already carries (history rows only have the id). */
export const checklistNames = (due: ChecklistDuePage | null): Map<string, string> => {
  const names = new Map<string, string>();
  for (const occurrence of due?.Occurrences ?? []) if (occurrence.Name) names.set(occurrence.DefinitionId, occurrence.Name);
  for (const definition of due?.Definitions ?? []) if (definition.PublishedForm.Name) names.set(definition.Id, definition.PublishedForm.Name);
  return names;
};

/** A run's outcome for the history list. A submitted run without a score (nothing applicable) is just "Submitted". */
export const historyOutcome = (row: Pick<ChecklistHistory, 'State' | 'Passed'>): Exclude<HistoryFilter, 'all'> | 'submitted' => {
  if (row.State === ChecklistRunState.InProgress) return 'inProgress';
  if (row.State === ChecklistRunState.AwaitingWitness) return 'awaitingWitness';
  if (row.Passed === true) return 'passed';
  if (row.Passed === false) return 'failed';
  return 'submitted';
};

const HISTORY_OUTCOME: Record<ReturnType<typeof historyOutcome>, { labelKey: string; tone: BadgeTone }> = {
  inProgress: { labelKey: 'checklists.labels.InProgress', tone: 'info' },
  awaitingWitness: { labelKey: 'checklists.labels.AwaitingWitness', tone: 'warning' },
  passed: { labelKey: 'checklists.labels.Passed', tone: 'success' },
  failed: { labelKey: 'checklists.labels.Failed', tone: 'error' },
  submitted: { labelKey: 'checklists.labels.Submitted', tone: 'muted' },
};

export const historyOutcomeBadge = (row: Pick<ChecklistHistory, 'State' | 'Passed'>): { labelKey: string; tone: BadgeTone } => HISTORY_OUTCOME[historyOutcome(row)];

export const filterHistory = (rows: readonly ChecklistHistory[], query: string, filter: HistoryFilter, names: ReadonlyMap<string, string>): ChecklistHistory[] =>
  rows.filter((row) => (filter === 'all' || historyOutcome(row) === filter) && matchesQuery(query, [names.get(row.DefinitionId), row.TargetName]));

/** Redacted calendar entries carry no title to search, so they only show while the query is empty. */
export const filterCalendarEntries = (entries: readonly CalendarItemResultData[], query: string): CalendarItemResultData[] => entries.filter((entry) => matchesQuery(query, entry.IsRedacted ? [] : [entry.Title]));
