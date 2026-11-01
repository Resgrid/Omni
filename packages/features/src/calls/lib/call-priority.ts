import type { CallPriorityResultData } from '@resgrid/models';

/**
 * Call priorities (resgrid-domain): the built-in Low 0, Medium 1, High 2, Emergency 3 — or the department's own
 * priorities (name, colour, tone, BaseType 0–3), which replace the built-ins when the department defines any.
 */
export const BUILT_IN_PRIORITIES = [
  { id: 0, labelKey: 'calls.priorities.low', color: '#2563EB' },
  { id: 1, labelKey: 'calls.priorities.medium', color: '#16A34A' },
  { id: 2, labelKey: 'calls.priorities.high', color: '#EA580C' },
  { id: 3, labelKey: 'calls.priorities.emergency', color: '#DC2626' },
] as const;

export interface PriorityOption {
  id: number;
  /** Department name, or a translation key for a built-in priority. */
  label: string;
  isLabelKey: boolean;
  color: string;
  isDefault: boolean;
}

/** Selectable priorities: the department's (sorted, not deleted) when it has any, otherwise the built-ins. */
export function priorityOptions(priorities: readonly CallPriorityResultData[]): PriorityOption[] {
  const department = priorities.filter((priority) => !priority.IsDeleted);
  if (department.length > 0) {
    return [...department].sort((a, b) => a.Sort - b.Sort || a.Id - b.Id).map((priority) => ({ id: priority.Id, label: priority.Name, isLabelKey: false, color: priority.Color || '', isDefault: priority.IsDefault }));
  }
  return BUILT_IN_PRIORITIES.map((priority) => ({ id: priority.id, label: priority.labelKey, isLabelKey: true, color: priority.color, isDefault: priority.id === 0 }));
}

/** The priority a call shows: the department priority with that id, else the built-in one, else none. */
export function resolvePriority(priorities: readonly CallPriorityResultData[], priorityId: number): PriorityOption | null {
  return priorityOptions(priorities).find((option) => option.id === priorityId) ?? null;
}

/** The default priority for a new call (department default, else the first option). */
export function defaultPriorityId(priorities: readonly CallPriorityResultData[]): number {
  const options = priorityOptions(priorities);
  return (options.find((option) => option.isDefault) ?? options[0])?.id ?? 0;
}
