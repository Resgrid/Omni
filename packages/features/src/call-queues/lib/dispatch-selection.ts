import type { DispatchSelection } from '@resgrid/features/calls';
import type { DispatchedEventResultData } from '@resgrid/models';

/** Which picker bucket a dispatch record belongs to (Core sends "User"/"Personnel", "Group", "Role", "Unit", or P/G/R/U). */
const bucketOf = (type: string | null | undefined): keyof Omit<DispatchSelection, 'everyone'> | null => {
  const value = (type ?? '').trim().toLowerCase();
  if (value === 'p' || value.includes('user') || value.includes('personnel')) return 'users';
  if (value === 'g' || value.includes('group')) return 'groups';
  if (value === 'r' || value.includes('role')) return 'roles';
  if (value === 'u' || value.includes('unit')) return 'units';
  return null;
};

/** A call's current dispatches as a picker selection (proposed recipients of a pending call; the base of "add resources"). */
export function dispatchesToSelection(dispatches: readonly DispatchedEventResultData[] | null | undefined): DispatchSelection {
  const selection: DispatchSelection = { everyone: false, users: [], groups: [], roles: [], units: [] };
  for (const dispatch of dispatches ?? []) {
    if (!dispatch?.Id) continue;
    const bucket = bucketOf(dispatch.Type);
    if (bucket && !selection[bucket].includes(dispatch.Id)) selection[bucket].push(dispatch.Id);
  }
  return selection;
}

/**
 * Unions newly picked resources with existing ones. Keeps "add resources" purely additive: existing dispatches are never
 * read as removed by the server's EditCall diff, so only the new resources are notified.
 */
export function mergeDispatchSelections(existing: DispatchSelection, added: DispatchSelection): DispatchSelection {
  if (existing.everyone || added.everyone) return { everyone: true, users: [], groups: [], roles: [], units: [] };
  const union = (a: readonly string[], b: readonly string[]): string[] => Array.from(new Set([...a, ...b]));
  return { everyone: false, users: union(existing.users, added.users), groups: union(existing.groups, added.groups), roles: union(existing.roles, added.roles), units: union(existing.units, added.units) };
}

/** Recipients in a selection; "everyone" counts as one. */
export const selectionSize = (selection: DispatchSelection): number => (selection.everyone ? 1 : selection.users.length + selection.groups.length + selection.roles.length + selection.units.length);
