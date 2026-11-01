import { useEffect, useRef } from 'react';

import { dataProtectionStore } from './grant-store';

/** A re-fetch at grant expiry waits this much past it, so the request cannot still go out with the grant attached. */
export const GRANT_EXPIRY_MARGIN_MS = 1000;

/**
 * Re-fetches protected data whenever what the server will reveal changes (IC): when the grant changes (a step-up replaces
 * REDACTED values; a conceal or sign-out puts them back) and when it expires. A remounted panel whose held grant already
 * expired refreshes at once, because its cache may still contain revealed values. Pass a stable `refresh` (useCallback).
 */
export const useProtectedGrantRefresh = (refresh: () => void): void => {
  const grantToken = dataProtectionStore((state) => state.grantToken);
  const stepUpExpiresAt = dataProtectionStore((state) => state.stepUpExpiresAt);

  const previousGrant = useRef(grantToken);
  useEffect(() => {
    if (previousGrant.current !== grantToken) {
      previousGrant.current = grantToken;
      refresh();
    }
  }, [grantToken, refresh]);

  useEffect(() => {
    if (!grantToken) {
      return undefined;
    }
    const remaining = stepUpExpiresAt == null ? 0 : stepUpExpiresAt - Date.now();
    if (remaining <= 0) {
      refresh();
      return undefined;
    }
    const timer = setTimeout(refresh, remaining + GRANT_EXPIRY_MARGIN_MS);
    return () => clearTimeout(timer);
  }, [grantToken, stepUpExpiresAt, refresh]);
};
