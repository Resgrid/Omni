import { clearStepUp, dataProtectionStore, ensureGrant, isStepUpActive, openStepUpPrompt, useHasGrantToken, useStepUpExpiresAt } from '@resgrid/auth';
import { useCallback } from 'react';

export interface ProtectedRevealState {
  /** A live grant is held: values fetched now come back decrypted. */
  isRevealed: boolean;
  isRequesting: boolean;
  /** Obtains a grant (silently when the department exempted this app, else via the single step-up prompt). */
  reveal: () => Promise<void>;
  /** Drops the grant at once. */
  conceal: () => void;
}

/**
 * Reveal / conceal for protected values (Dispatch baseline). The token is part of the invariant, not just the expiry:
 * without it a request carries no grant header and values come back redacted. `Date.now()` is read at render; the
 * store's expiry timer drops the token when the absolute window ends, which re-renders here.
 */
export const useProtectedReveal = (onRevealed?: () => void): ProtectedRevealState => {
  const expiresAt = useStepUpExpiresAt();
  const hasGrantToken = useHasGrantToken();
  const isRequesting = dataProtectionStore((state) => state.isRequestingGrant);
  const isRevealed = hasGrantToken && expiresAt != null && Date.now() < expiresAt;

  const reveal = useCallback(async () => {
    if (isStepUpActive()) {
      onRevealed?.();
      return;
    }
    const outcome = await ensureGrant();
    if (outcome === 'granted') {
      onRevealed?.();
      return;
    }
    // 'unavailable' prompts too: the prompt is where the member learns grants are not configured.
    openStepUpPrompt();
  }, [onRevealed]);

  const conceal = useCallback(() => clearStepUp(), []);

  return { isRevealed, isRequesting, reveal, conceal };
};
