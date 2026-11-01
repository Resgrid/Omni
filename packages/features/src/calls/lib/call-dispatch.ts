import type { CallExtraDataResultData, DispatchedEventResultData } from '@resgrid/models';

/**
 * Who a call was sent to (Responder `lib/call-dispatch`): badge styling for the dispatch ticker, de-duplication and
 * the "assigned to me" check that outlines a card. Pure; the caller supplies the signed-in user's context.
 */

export interface CallAssignmentContext {
  userId: string | null;
  groupId: string | null;
  roleIds: string[];
  roleNames: string[];
  /** Units the user currently holds an active seat (unit role) on. */
  unitIds: string[];
}

export type DispatchKind = 'personnel' | 'unit' | 'group' | 'role' | 'other';

export interface DispatchTypeStyle {
  kind: DispatchKind;
  backgroundColor: string;
  textColor: string;
  /** Single-letter badge (not translated: a glyph, like the legacy apps). */
  label: string;
}

const normalize = (value: unknown): string => (value === null || value === undefined ? '' : String(value).trim().toLowerCase());

export const dispatchKind = (type: string): DispatchKind => {
  const normalized = normalize(type);
  if (normalized.includes('user') || normalized.includes('personnel')) return 'personnel';
  if (normalized.includes('unit')) return 'unit';
  if (normalized.includes('group') || normalized.includes('station')) return 'group';
  if (normalized.includes('role')) return 'role';
  return 'other';
};

const STYLES: Record<DispatchKind, Omit<DispatchTypeStyle, 'kind'>> = {
  personnel: { backgroundColor: '#2563EB', textColor: '#FFFFFF', label: 'P' },
  unit: { backgroundColor: '#D97706', textColor: '#FFFFFF', label: 'U' },
  group: { backgroundColor: '#059669', textColor: '#FFFFFF', label: 'G' },
  role: { backgroundColor: '#7C3AED', textColor: '#FFFFFF', label: 'R' },
  other: { backgroundColor: '#6B7280', textColor: '#FFFFFF', label: '•' },
};

export const getDispatchTypeStyle = (type: string): DispatchTypeStyle => {
  const kind = dispatchKind(type);
  return { kind, ...STYLES[kind] };
};

export const isUnitDispatchType = (type: string): boolean => dispatchKind(type) === 'unit';

/** One row per entity: the same dispatch can arrive twice (by id and by name). */
export const getUniqueDispatches = (dispatches: readonly DispatchedEventResultData[]): DispatchedEventResultData[] => {
  const seen = new Set<string>();
  return dispatches.filter((dispatch) => {
    const type = normalize(dispatch.Type);
    const nameKey = `name:${type}:${normalize(dispatch.Name)}`;
    const id = normalize(dispatch.Id);
    const idKey = id.length > 0 ? `id:${type}:${id}` : null;
    if (seen.has(nameKey) || (idKey !== null && seen.has(idKey))) return false;
    seen.add(nameKey);
    if (idKey !== null) seen.add(idKey);
    return true;
  });
};

export const isDispatchAssignedToUser = (dispatch: DispatchedEventResultData, context: CallAssignmentContext): boolean => {
  const id = normalize(dispatch.Id);
  const name = normalize(dispatch.Name);
  const groupId = normalize(dispatch.GroupId);
  const userId = normalize(context.userId);
  const userGroupId = normalize(context.groupId);
  const roleIds = new Set(context.roleIds.map(normalize));
  const roleNames = new Set(context.roleNames.map(normalize));

  switch (dispatchKind(dispatch.Type)) {
    case 'personnel':
      return id.length > 0 && id === userId;
    case 'group':
      return userGroupId.length > 0 && (id === userGroupId || groupId === userGroupId);
    case 'role':
      return roleIds.has(id) || roleNames.has(name);
    case 'unit':
      // A unit dispatch is the user's only when they hold an active seat on that unit.
      return id.length > 0 && new Set(context.unitIds.map(normalize)).has(id);
    default:
      return id.length > 0 && (id === userId || id === userGroupId || roleIds.has(id));
  }
};

export const isCurrentUserOnCall = (extra: Pick<CallExtraDataResultData, 'Dispatches'> | null | undefined, context: CallAssignmentContext | null | undefined): boolean => {
  if (!extra || !context || extra.Dispatches.length === 0) return false;
  return extra.Dispatches.some((dispatch) => isDispatchAssignedToUser(dispatch, context));
};
