// @resgrid/features/approve-sign-in — Responder as the approver (passkey plan §7.9, `capabilities.push.approveSignIns`):
// the approve screen (one implementation, from auth-ui, with the other session/MFA screens), the foreground check that
// opens it when a request is waiting, and its route and nav entry. Route file:
// `export { ApproveSignInScreen as default } from '@resgrid/features/approve-sign-in';`.
export { PendingApprovalWatcher } from './components/pending-approval-watcher';
export { PENDING_APPROVAL_CHECK_INTERVAL_MS, usePendingApprovalCheck } from './hooks/use-pending-approval-check';
export { approveSignInNav, type FeatureNavEntry } from './nav';
export { APPROVE_SIGN_IN_ROUTE_PATTERNS, approveSignInRoutes } from './routes';
export { ApproveSignInScreen, type ApproveSignInScreenProps } from '@resgrid/features/auth-ui';
