import type { ApiContext } from '@resgrid/api';

import type { ApprovalRequestData, ApprovalStatusData, PasskeyCeremonyData, SsoBeginData } from '../mfa/types';
import { OPERATOR_ACTIVITY_HEADER } from '../session/client-headers';
import type { SsoRoundTripInput } from './account-security';
import { authData } from './auth-request';
import { sessionsEndpoints } from './endpoints';

// ---------------------------------------------------------------------------------------------------------------------
// The shared-device session calls (passkey plan section 10.5, workbook section 8): bearer, and the only API paths a
// locked session may still use. Unlocking resumes the same session, so the tokens are kept throughout.
// ---------------------------------------------------------------------------------------------------------------------

/** `GET sessions/current` and `complete-unlock` (`CurrentSessionResultData`). */
export interface CurrentSessionData {
  Operator: string | null;
  Client: string | null;
  Shared: boolean;
  Locked: boolean;
  LockVersion: number;
  LockReason: 'explicit' | 'idle' | null;
  IdleLockMinutes: number;
  IdleLocksAt: string | null;
  ShiftEndsAt: string | null;
  InstallationLabel: string | null;
}

/** The server's view of this session. `activity` reports real operator input, which moves the idle deadline; polling never sends it. */
export const getCurrentSession = (ctx: ApiContext, activity = false): Promise<CurrentSessionData> => authData(ctx, sessionsEndpoints.current, {}, activity ? { headers: { [OPERATOR_ACTIVITY_HEADER]: '1' } } : {});

export const lockSession = (ctx: ApiContext): Promise<{ Locked: boolean; LockVersion: number }> => authData(ctx, sessionsEndpoints.lock);

/** Ends this operator's shift on the installation; the caller then drops tokens, caches and sockets. A body is required. */
export const endShift = (ctx: ApiContext, switchOperator: boolean): Promise<{ Ended: boolean }> => authData(ctx, sessionsEndpoints.endShift, { body: { SwitchOperator: switchOperator } });

export interface UnlockOptionsData {
  Operator: string | null;
  LockVersion: number;
  /** Empty means no quick unlock: the shift has to end. */
  Methods: string[];
  Preferred: string | null;
  /** Never started on its own on a shared installation: the operator chooses it. */
  Passkey: PasskeyCeremonyData | null;
}

export const getUnlockOptions = (ctx: ApiContext, lockVersion: number): Promise<UnlockOptionsData> => authData(ctx, sessionsEndpoints.unlockOptions, { body: { LockVersion: lockVersion } });

export const requestUnlockApproval = (ctx: ApiContext, lockVersion: number): Promise<ApprovalRequestData> => authData(ctx, sessionsEndpoints.requestUnlockApproval, { body: { LockVersion: lockVersion } });

export const getUnlockApprovalStatus = (ctx: ApiContext, approvalRequestId: string): Promise<ApprovalStatusData> => authData(ctx, sessionsEndpoints.unlockApprovalStatus, { params: { approvalRequestId } });

export const cancelUnlockApproval = (ctx: ApiContext, approvalRequestId: string): Promise<ApprovalStatusData> => authData(ctx, sessionsEndpoints.cancelUnlockApproval, { params: { approvalRequestId } });

/** Begins the provider's own sign-in for this lock (the broker asks who is signing in, every time). */
export const beginUnlockSso = (ctx: ApiContext, lockVersion: number, input: SsoRoundTripInput): Promise<SsoBeginData> =>
  authData(ctx, sessionsEndpoints.beginUnlockSso, {
    body: { LockVersion: lockVersion, Platform: input.platform, ReturnTarget: input.returnTarget, State: input.state, CodeChallenge: input.codeChallenge, CodeChallengeMethod: 'S256' },
  });

export type CompleteUnlockInput =
  | { Method: 'totp'; Code: string }
  | { Method: 'passkey'; RequestId: string; Credential: Record<string, unknown> }
  | { Method: 'passkey_approval'; ApprovalRequestId: string }
  | { Method: 'federated'; SsoTransactionId: string; SsoCode: string; CodeVerifier: string };

/** Unlocks the same session; the result names the operator. */
export const completeUnlock = (ctx: ApiContext, lockVersion: number, input: CompleteUnlockInput): Promise<CurrentSessionData> =>
  authData(ctx, sessionsEndpoints.completeUnlock, { body: { LockVersion: lockVersion, ...input } });

// ---- The member's own sessions (account security) ---------------------------------------------------------------------

export type SessionSummaryData = Record<string, unknown>;

export const listSessions = (ctx: ApiContext): Promise<SessionSummaryData[]> => authData(ctx, sessionsEndpoints.list);

export const revokeSession = (ctx: ApiContext, sessionId: string): Promise<unknown> => authData(ctx, sessionsEndpoints.revoke, { params: { sessionId } });

export const revokeOtherSessions = (ctx: ApiContext): Promise<unknown> => authData(ctx, sessionsEndpoints.revokeOthers);

export const revokeAllSessions = (ctx: ApiContext): Promise<unknown> => authData(ctx, sessionsEndpoints.revokeAll);
