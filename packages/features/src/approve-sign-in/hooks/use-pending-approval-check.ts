import { fetchPendingApproval } from '@resgrid/auth';
import { logger } from '@resgrid/core/logging/logger';
import { routerPushWithRetry } from '@resgrid/core/navigation/router';
import { usePathname } from 'expo-router';
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { APPROVE_SIGN_IN_ROUTE_PATTERNS, approveSignInRoutes } from '../routes';

/** At most one lookup per this interval (foreground bursts, app switching). */
export const PENDING_APPROVAL_CHECK_INTERVAL_MS = 15000;

/**
 * A push can be late or never arrive (passkey plan section 7.9): whenever Responder comes to the foreground it asks the
 * server whether a request is waiting for this member, and opens the approval screen if one is (Responder
 * `usePendingApprovalCheck`). `fetchPendingApproval` answers null for variants that are not approvers and on any
 * failure, so the check never surfaces errors; a lookup that finishes after sign-out (or any disable) opens nothing.
 */
export function usePendingApprovalCheck(enabled: boolean): void {
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);

  // Only a committed screen counts: a render React discards must not stop (or start) navigation.
  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    if (!enabled) return undefined;
    let active = true;
    let lastCheck = Number.NEGATIVE_INFINITY;

    const check = async (): Promise<void> => {
      const now = Date.now();
      if (now - lastCheck < PENDING_APPROVAL_CHECK_INTERVAL_MS) return;
      lastCheck = now;
      const pending = await fetchPendingApproval();
      if (!active || !pending || pathnameRef.current === APPROVE_SIGN_IN_ROUTE_PATTERNS.approveSignIn) return;
      try {
        await routerPushWithRetry(approveSignInRoutes.approveSignIn());
      } catch {
        logger.warn({ message: 'Could not open the waiting approval request' });
      }
    };

    void check();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void check();
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, [enabled]);
}
