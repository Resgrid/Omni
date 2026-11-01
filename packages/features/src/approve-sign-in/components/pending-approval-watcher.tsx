import { useAuthStore } from '@resgrid/auth';
import { useCapability } from '@resgrid/config';

import { usePendingApprovalCheck } from '../hooks/use-pending-approval-check';

/**
 * Mount once inside the signed-in `(app)` tree (Responder's `(app)/_layout` ran `usePendingApprovalCheck(status ===
 * 'signedIn')`): opens the approve screen when a request is waiting. Renders nothing; inert in variants without
 * `capabilities.push.approveSignIns`.
 */
export function PendingApprovalWatcher(): null {
  const push = useCapability('push');
  const isSignedIn = useAuthStore((state) => state.status === 'signedIn');
  usePendingApprovalCheck(push.approveSignIns && isSignedIn);
  return null;
}
