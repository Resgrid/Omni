import { authRoutes } from '@resgrid/features/auth-ui';

/**
 * Approve a sign-in (Responder only, `capabilities.push.approveSignIns`). One canonical path shared with the auth
 * screens (`authRoutes.approveSignIn`); the push tap may pass the request id (the screen always reloads the pending one).
 */
export const APPROVE_SIGN_IN_ROUTE_PATTERNS = {
  approveSignIn: '/approve-sign-in',
} as const;

export const approveSignInRoutes = {
  approveSignIn: (id?: string | null): string => authRoutes.approveSignIn(id),
} as const;
