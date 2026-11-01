import { approveRequest, denyRequest, getApprovalOptions, getPendingApproval, type PendingApprovalData } from '../api/account-security';
import { toMfaProblem } from '../errors/mfa-errors';
import { getPasskeyAssertion } from '../passkeys/passkey';
import { isPasskeyCeremonyError } from '../passkeys/passkey-errors';
import { getAuthApiContext } from '../runtime/api-context';
import { authLogger } from '../runtime/logger';
import { canApproveSignIns } from '../runtime/variant';

// ---------------------------------------------------------------------------------------------------------------------
// Responder as the approver (plan section 7.9; `capabilities.push.approveSignIns`): another app's sign-in, step-up or
// unlock asks the member's Responder; the member compares the number shown on the other screen and approves with a
// Responder passkey, or denies. Every other variant refuses with `approval_unavailable` without calling the server.
// ---------------------------------------------------------------------------------------------------------------------

export type ApproverResult = { ok: true; state: string } | { ok: false; code: string };

const notAvailable: ApproverResult = { ok: false, code: 'approval_unavailable' };

export const approverEnabled = (): boolean => {
  try {
    return canApproveSignIns();
  } catch {
    return false;
  }
};

/** The request waiting for this member's decision, or null (none, or this variant is not an approver). */
export async function fetchPendingApproval(): Promise<PendingApprovalData | null> {
  if (!approverEnabled()) {
    return null;
  }
  try {
    return await getPendingApproval(getAuthApiContext());
  } catch (error) {
    authLogger.warn({ message: 'Pending approval lookup failed', context: { errorType: toMfaProblem(error).code } });
    return null;
  }
}

/** Approves with this app's passkey; `matchNumber` is the number the member typed from the other screen. */
export async function approvePendingRequest(approvalRequestId: string, matchNumber: string): Promise<ApproverResult> {
  if (!approverEnabled()) {
    return notAvailable;
  }
  const ctx = getAuthApiContext();
  try {
    const ceremony = await getApprovalOptions(ctx, approvalRequestId);
    const credential = await getPasskeyAssertion(ceremony.Options);
    const decided = await approveRequest(ctx, approvalRequestId, matchNumber.trim(), ceremony.RequestId, credential);
    return { ok: true, state: decided.State };
  } catch (error) {
    return { ok: false, code: isPasskeyCeremonyError(error) ? `passkey_${error.reason}` : toMfaProblem(error).code };
  }
}

export async function denyPendingRequest(approvalRequestId: string, reason: 'declined' | 'not_me'): Promise<ApproverResult> {
  if (!approverEnabled()) {
    return notAvailable;
  }
  try {
    const decided = await denyRequest(getAuthApiContext(), approvalRequestId, reason);
    return { ok: true, state: decided.State };
  } catch (error) {
    return { ok: false, code: toMfaProblem(error).code };
  }
}
