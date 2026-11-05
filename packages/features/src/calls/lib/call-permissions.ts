import type { VariantManifest } from '@resgrid/config';
import type { CallResultData } from '@resgrid/models';

import { CallState, isClosedCall, isPendingCall, isScheduledCall } from './call-time';

export type CallsCapability = VariantManifest['capabilities']['calls'];

/** The member's call rights, from the rights DTO (`useSecurity()`). */
export interface CallRights {
  isAdmin: boolean;
  /** Create Call permission: also what grants Core's Call_Update and Call_Delete claims. */
  canCreateCalls: boolean;
  /** Create Call plus Close Call (`canCloseCalls` in @resgrid/auth). */
  canCloseCalls: boolean;
  /** Create Call plus Delete Call (`canDeleteCalls` in @resgrid/auth). */
  canDeleteCalls: boolean;
}

/** What this member may do with calls in this app; every call action and its sheet is gated on these. */
export interface CallPermissions {
  /** New call (Calls/SaveCall). */
  canCreate: boolean;
  /** Edit the call (Calls/EditCall): active or pending calls only. */
  canEdit: boolean;
  /** Dispatch a pending or scheduled call now (Calls/DispatchCallNow). */
  canDispatch: boolean;
  /** Add resources to an active call (Calls/EditCall). */
  canDispatchMore: boolean;
  /** Move a scheduled call's dispatch time (Calls/UpdateScheduledDispatchTime). */
  canReschedule: boolean;
  /** Close an open call, or cancel a pending one (Calls/CloseCall). */
  canClose: boolean;
  /** Delete the call (Calls/DeleteCall). */
  canDelete: boolean;
}

export interface CallPermissionInput {
  calls: CallsCapability;
  rights: CallRights;
  /** The signed-in member's user id. */
  userId: string | null | undefined;
  /** The call acted on; without one only `canCreate` can be true. */
  call?: Pick<CallResultData, 'State' | 'DispatchedOnUtc' | 'ScheduledOnUtc' | 'ReportingUserId'> | null;
  now?: number;
}

const NO_CALL_ACTIONS = { canEdit: false, canDispatch: false, canDispatchMore: false, canReschedule: false, canClose: false, canDelete: false } as const;

/**
 * Whether the member logged this call. A server that predates `ReportingUserId` leaves it undefined: the app then cannot
 * tell and offers the action, which the server still refuses for someone else's call. A null id (an email or API import)
 * is nobody's.
 */
export function isCallReporter(call: Pick<CallResultData, 'ReportingUserId'>, userId: string | null | undefined): boolean {
  if (call.ReportingUserId === undefined) return true;

  if (!call.ReportingUserId || !userId) return false;

  return call.ReportingUserId.toLowerCase() === userId.toLowerCase();
}

/**
 * The call actions this member may take, mirroring Core's checks so the app never offers one the server refuses:
 * - create: the Create Call permission;
 * - edit, add resources, reschedule and dispatch now: the Call_Update claim (Create Call permission) and being a
 *   department admin or the call's reporting user (`CanUserEditCallAsync`); EditCall takes active and pending calls only;
 * - close (and cancel pending): Create Call plus the Close Call permission, on a call that is not closed;
 * - delete: Create Call plus the Delete Call permission.
 * The variant's `calls` capability decides which apps offer each action at all. Close and delete permissions locked to
 * the member's group are checked per call by the server, which can still refuse; the sheets show that refusal.
 */
export function resolveCallPermissions({ calls, rights, userId, call, now = Date.now() }: CallPermissionInput): CallPermissions {
  const canCreate = calls.create !== 'none' && rights.canCreateCalls;

  if (!call) return { canCreate, ...NO_CALL_ACTIONS };

  const mayChange = rights.canCreateCalls && (rights.isAdmin || isCallReporter(call, userId));
  const isOpen = call.State === CallState.Active || isPendingCall(call);
  const mayDispatch = calls.dispatch && mayChange;

  return {
    canCreate,
    canEdit: calls.create !== 'none' && mayChange && isOpen,
    canDispatch: mayDispatch && isOpen,
    canDispatchMore: mayDispatch && call.State === CallState.Active,
    canReschedule: mayDispatch && isScheduledCall(call, now),
    canClose: calls.close && rights.canCloseCalls && !isClosedCall(call),
    canDelete: calls.create !== 'none' && rights.canDeleteCalls,
  };
}
