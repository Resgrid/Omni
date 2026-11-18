import { isApiError, type ReleaseResourceKind, V4FailureError } from '@resgrid/api';
import { type CallExtraDataResultData, type CallResultData, DestinationEntityTypes, type DispatchedEventResultData, type PersonnelInfoResultData, type UnitInfoResultData } from '@resgrid/models';

import { dispatchKind } from './call-dispatch';
import { type CallRights, type CallsCapability, mayChangeCall } from './call-permissions';
import { CallState, isScheduledCall } from './call-time';
import { getCallCloseErrorMessage } from './close-call';
import { isFinalRefusal } from './server-refusal';

/**
 * Releasing (standing down) a unit or person from an open call that stays open, and who is on a call once some were
 * released. Every screen that asks "is this unit or person on the call?" (the dispatch console's call-filtered lists,
 * the call detail, the Unit app's active call) reads it here, so they agree.
 */

/** A call's current dispatches and what was released from it (`GetCallExtraData`). */
export interface CallResourceLists {
  callId: string;
  dispatches: readonly DispatchedEventResultData[];
  /** `ReleasedUnits`; missing (an older server, or the extra data has not loaded) reads as none. */
  releasedUnits?: readonly DispatchedEventResultData[];
  /** `ReleasedPersonnel`; missing reads as none. */
  releasedPersonnel?: readonly DispatchedEventResultData[];
}

/** The unit fields the matching reads; a `UnitInfoResultData` fits. */
export type CallUnitCandidate = Pick<UnitInfoResultData, 'UnitId' | 'Name'> & Partial<Pick<UnitInfoResultData, 'ActiveCallId' | 'CurrentDestinationId' | 'CurrentDestinationType'>>;

/** The person fields the matching reads; a `PersonnelInfoResultData` fits. */
export type CallPersonCandidate = Pick<PersonnelInfoResultData, 'UserId'> & Partial<Pick<PersonnelInfoResultData, 'StatusDestinationId' | 'StatusDestinationType' | 'GroupId' | 'Roles'>>;

const NONE: readonly DispatchedEventResultData[] = [];

/** The units released from the call; an older server that omits the list reads as none. */
export const getReleasedUnits = (extraData: Pick<CallExtraDataResultData, 'ReleasedUnits'> | null | undefined): readonly DispatchedEventResultData[] => extraData?.ReleasedUnits ?? NONE;

/** The people released from the call; an older server that omits the list reads as none. */
export const getReleasedPersonnel = (extraData: Pick<CallExtraDataResultData, 'ReleasedPersonnel'> | null | undefined): readonly DispatchedEventResultData[] => extraData?.ReleasedPersonnel ?? NONE;

/** An id or name as the server may send it (ids are strings; some older rows carry numbers). */
type IdValue = string | number | null | undefined;

const normalize = (value: IdValue): string => (value === null || value === undefined ? '' : String(value).trim().toLowerCase());

const sameId = (a: IdValue, b: IdValue): boolean => {
  const left = normalize(a);

  return left.length > 0 && left === normalize(b);
};

const matchesUnit = (entry: DispatchedEventResultData, unit: CallUnitCandidate): boolean => sameId(entry.Id, unit.UnitId) || sameId(entry.Name, unit.Name);

/**
 * A status pointing at the call: its destination is the call (or an untyped destination with the call's id, saved before
 * destinations were typed). A station or POI whose id equals the call's never counts.
 */
const pointsAtCall = (destinationId: IdValue, destinationType: number | null | undefined, callId: string): boolean => {
  if (!sameId(destinationId, callId)) return false;
  const type = destinationType ?? DestinationEntityTypes.None;

  return type === DestinationEntityTypes.Call || type === DestinationEntityTypes.None;
};

/** What a dispatch entry would release: its unit or person; null for a group or role, which stays on the call. */
export const releaseKindOf = (type: string): ReleaseResourceKind | null => {
  const kind = dispatchKind(type);

  if (kind === 'unit') return 'unit';

  return kind === 'personnel' ? 'personnel' : null;
};

/** The unit is one of the call's unit dispatches (by id, else by name). Only these can be released. */
export const isUnitDispatchedToCall = (unit: CallUnitCandidate, dispatches: readonly DispatchedEventResultData[]): boolean => dispatches.some((entry) => dispatchKind(entry.Type) === 'unit' && matchesUnit(entry, unit));

/** The unit was released from the call and has not been dispatched to it again (a new dispatch wins). */
export const isUnitReleasedFromCall = (unit: CallUnitCandidate, lists: CallResourceLists): boolean =>
  !isUnitDispatchedToCall(unit, lists.dispatches) && (lists.releasedUnits ?? NONE).some((entry) => matchesUnit(entry, unit));

/**
 * The unit is on the call: dispatched to it, or its active call or status destination is the call and it was not
 * released. A released unit's status still points at the call (the release status is linked to it), so the destination
 * alone never brings it back.
 */
export const isUnitOnCall = (unit: CallUnitCandidate, lists: CallResourceLists): boolean => {
  if (isUnitDispatchedToCall(unit, lists.dispatches)) return true;

  if (isUnitReleasedFromCall(unit, lists)) return false;

  return sameId(unit.ActiveCallId, lists.callId) || pointsAtCall(unit.CurrentDestinationId, unit.CurrentDestinationType, lists.callId);
};

/** The person was dispatched to the call by name (a personnel entry with their user id). */
export const isPersonDispatchedToCall = (person: CallPersonCandidate, dispatches: readonly DispatchedEventResultData[]): boolean =>
  dispatches.some((entry) => dispatchKind(entry.Type) === 'personnel' && sameId(entry.Id, person.UserId));

/** The call went to the person's group (station) or to one of their roles. */
const isReachedThroughGroupOrRole = (person: CallPersonCandidate, dispatches: readonly DispatchedEventResultData[]): boolean => {
  const roles = new Set((person.Roles ?? []).map(normalize).filter((role) => role.length > 0));

  return dispatches.some((entry) => {
    const kind = dispatchKind(entry.Type);

    if (kind === 'group') return sameId(entry.Id, person.GroupId) || sameId(entry.GroupId, person.GroupId);

    return kind === 'role' && roles.has(normalize(entry.Name));
  });
};

/** The person was released from the call and has not been dispatched to it by name again. */
export const isPersonReleasedFromCall = (person: CallPersonCandidate, lists: CallResourceLists): boolean =>
  !isPersonDispatchedToCall(person, lists.dispatches) && (lists.releasedPersonnel ?? NONE).some((entry) => sameId(entry.Id, person.UserId));

/**
 * The person is on the call: dispatched to it by name, through their group or one of their roles, or their status points
 * at it. Someone released from the call is not, even though the group or role they were reached through is still on
 * the call and their status may still point at it; dispatching them by name again brings them back.
 */
export const isPersonOnCall = (person: CallPersonCandidate, lists: CallResourceLists): boolean => {
  if (isPersonDispatchedToCall(person, lists.dispatches)) return true;

  if (isPersonReleasedFromCall(person, lists)) return false;

  return isReachedThroughGroupOrRole(person, lists.dispatches) || pointsAtCall(person.StatusDestinationId, person.StatusDestinationType, lists.callId);
};

/** The call fields that decide whether resources can be released from it, and by whom. */
export type ReleasableCall = Pick<CallResultData, 'State' | 'DispatchedOnUtc' | 'ScheduledOnUtc' | 'ReportingUserId'>;

/** Core releases only from an open call that has gone out: not a pending, scheduled, closed or cancelled one. */
export const canReleaseFromCall = (call: ReleasableCall, now: number = Date.now()): boolean => call.State === CallState.Active && !isScheduledCall(call, now);

export interface ReleasePermissionInput {
  calls: Pick<CallsCapability, 'releaseResources' | 'releaseOwnUnit'>;
  /** `capabilities.status.subject`: the crew's own unit is released only where the device sets a unit's status. */
  statusSubject: 'personnel' | 'unit';
  /** The device's active unit (Unit), whose status this crew sets. */
  activeUnitId: string | null;
  rights: CallRights;
  userId: string | null | undefined;
  call: ReleasableCall | null | undefined;
  now?: number;
}

export interface ReleasePermissions {
  /** Release any unit or person on the call: members who may edit it, in apps with `calls.releaseResources`. */
  canReleaseAny: boolean;
  /** The crew's own unit, releasable in apps with `calls.releaseOwnUnit` (the server checks it may set that unit's status). */
  ownUnitId: string | null;
}

const NO_RELEASE: ReleasePermissions = { canReleaseAny: false, ownUnitId: null };

/** Who may release whom from this call in this app, mirroring Core's checks. */
export function resolveReleasePermissions({ calls, statusSubject, activeUnitId, rights, userId, call, now = Date.now() }: ReleasePermissionInput): ReleasePermissions {
  if (!call || !canReleaseFromCall(call, now)) return NO_RELEASE;

  return {
    canReleaseAny: calls.releaseResources && mayChangeCall(rights, call, userId),
    ownUnitId: calls.releaseOwnUnit && statusSubject === 'unit' && activeUnitId ? activeUnitId : null,
  };
}

/**
 * Why a release failed, for the toast and whether the confirmation stays open:
 * - `refused`: the server said no (400 with its reason, which `message` carries when it is text written for a person);
 *   sending again cannot change it, so the dialog closes and the call is read again;
 * - `forbidden`: 401/403, the member may not release it;
 * - `offline`: no answer (no connection), the dialog stays open to try again;
 * - `retry`: a timeout, rate limit or server error, the dialog stays open.
 */
export type ReleaseFailure = { kind: 'refused'; message: string | null } | { kind: 'forbidden' } | { kind: 'offline' } | { kind: 'retry' };

export function classifyReleaseError(cause: unknown): ReleaseFailure {
  // A failure envelope (HTTP 200) is a refusal with no reason written for a person.
  if (cause instanceof V4FailureError) return { kind: 'refused', message: null };

  if (!isApiError(cause)) return { kind: 'retry' };

  if (cause.kind === 'network') return { kind: 'offline' };

  if (cause.kind === 'http' && (cause.status === 401 || cause.status === 403)) return { kind: 'forbidden' };

  // The same plain-text 400 body as a refused close; the helper drops HTML pages and bodies too long to be a reason.
  return isFinalRefusal(cause) ? { kind: 'refused', message: getCallCloseErrorMessage(cause) } : { kind: 'retry' };
}

/** Translation keys for a release, by what was released (participles agree with the unit or person in some languages). */
export const RELEASE_TEXT_KEYS: Record<ReleaseResourceKind, { success: string; statusKept: string; released: string; releasedOn: string; releasedOnBy: string }> = {
  unit: {
    success: 'calls.release.unit_success',
    statusKept: 'calls.release.unit_success_status_kept',
    released: 'calls.release.unit_released',
    releasedOn: 'calls.release.unit_released_on',
    releasedOnBy: 'calls.release.unit_released_on_by',
  },
  personnel: {
    success: 'calls.release.person_success',
    statusKept: 'calls.release.person_success_status_kept',
    released: 'calls.release.person_released',
    releasedOn: 'calls.release.person_released_on',
    releasedOnBy: 'calls.release.person_released_on_by',
  },
};
