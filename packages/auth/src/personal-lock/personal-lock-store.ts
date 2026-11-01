import { registerStoreReset } from '@resgrid/offline';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { authLogger } from '../runtime/logger';
import { lateBoundStateStorage, mainKv } from '../runtime/storage';
import { authCapabilities } from '../runtime/variant';
import { useAuthStore } from '../session/auth-store';
import { isSharedInstallation } from '../session/shared-installation';
import { hasPasswordVerification, verifyPassword } from './password-verifier';

// ---------------------------------------------------------------------------------------------------------------------
// The personal inactivity lock (Dispatch; `capabilities.auth.personalLock`). Off on a shared installation (which has the
// server's shared-session lock instead) and for SSO sessions (no password verifier). Unlike Dispatch, the lock state is
// PERSISTED: killing the app no longer skips the lock, and a cold start after the timeout opens locked.
// ---------------------------------------------------------------------------------------------------------------------

export const PERSONAL_LOCK_STORE_NAME = 'personal-lock-storage';
export const DEFAULT_INACTIVITY_TIMEOUT_MINUTES = 60;

export interface PersonalLockState {
  isLocked: boolean;
  /** Minutes of inactivity before locking; 0 turns the automatic lock off. */
  lockTimeout: number;
  lastActivityTime: number;
  /** Failed unlock attempts since the last success (shown, never a lockout: the server is not involved). */
  failedAttempts: number;
}

const INITIAL: PersonalLockState = { isLocked: false, lockTimeout: DEFAULT_INACTIVITY_TIMEOUT_MINUTES, lastActivityTime: Date.now(), failedAttempts: 0 };

export const personalLockStore = create<PersonalLockState>()(
  persist(() => ({ ...INITIAL }), {
    name: PERSONAL_LOCK_STORE_NAME,
    storage: createJSONStorage(() => lateBoundStateStorage(mainKv)),
    skipHydration: true,
    partialize: (state) => ({ isLocked: state.isLocked, lockTimeout: state.lockTimeout, lastActivityTime: state.lastActivityTime }),
    // Nothing persisted yet: the build's configured default timeout applies (set by initAuth before hydration).
    merge: (persisted, current) => ({ ...current, lockTimeout: INITIAL.lockTimeout, ...((persisted as Partial<PersonalLockState> | undefined) ?? {}) }),
  })
);

/** Whether the personal lock applies to this session right now. */
export const isPersonalLockEnabled = (): boolean => {
  try {
    if (!authCapabilities().personalLock || isSharedInstallation()) {
      return false;
    }
  } catch {
    return false;
  }
  const auth = useAuthStore.getState();
  return auth.status === 'signedIn' && auth.authMethod === 'password' && hasPasswordVerification();
};

export const setDefaultInactivityTimeout = (minutes: number): void => {
  if (Number.isFinite(minutes) && minutes >= 0) {
    INITIAL.lockTimeout = minutes;
  }
};

export const updateActivity = (now: number = Date.now()): void => {
  if (!personalLockStore.getState().isLocked) {
    personalLockStore.setState({ lastActivityTime: now });
  }
};

export const setLockTimeout = (minutes: number): void => {
  const sanitized = Number.isFinite(minutes) ? Math.max(0, Math.floor(minutes)) : 0;
  personalLockStore.setState({ lockTimeout: sanitized });
};

/** True when the inactivity window has passed (and the lock applies). */
export const shouldLock = (now: number = Date.now()): boolean => {
  const { isLocked, lockTimeout, lastActivityTime } = personalLockStore.getState();
  if (isLocked || lockTimeout === 0 || !isPersonalLockEnabled()) {
    return false;
  }
  return now - lastActivityTime >= lockTimeout * 60_000;
};

export const lockPersonalSession = (): void => {
  if (!isPersonalLockEnabled()) {
    return;
  }
  authLogger.info({ message: 'Personal lock engaged' });
  personalLockStore.setState({ isLocked: true });
};

export type UnlockResult = 'unlocked' | 'wrong_password' | 'no_verifier';

/**
 * Unlocks with the password, checked offline against the salted verifier. With no verifier (it was lost, or this session
 * signed in another way) the lock cannot be passed: the member signs in again (`no_verifier`).
 */
export async function unlockPersonalSession(password: string, now: number = Date.now()): Promise<UnlockResult> {
  const verdict = await verifyPassword(password);
  if (verdict === null) {
    return 'no_verifier';
  }
  if (!verdict) {
    personalLockStore.setState((state) => ({ failedAttempts: state.failedAttempts + 1 }));
    return 'wrong_password';
  }
  personalLockStore.setState({ isLocked: false, lastActivityTime: now, failedAttempts: 0 });
  return 'unlocked';
}

/** At launch, after hydration: a persisted lock stays locked, and a session idle past the timeout opens locked. */
export const applyPersonalLockAtLaunch = (now: number = Date.now()): void => {
  if (!isPersonalLockEnabled()) {
    personalLockStore.setState({ isLocked: false, failedAttempts: 0 });
    return;
  }
  if (!personalLockStore.getState().isLocked && shouldLock(now)) {
    lockPersonalSession();
  }
};

export function resetPersonalLock(): void {
  personalLockStore.setState({ isLocked: false, lastActivityTime: Date.now(), failedAttempts: 0 });
}

registerStoreReset('auth.personal-lock', () => resetPersonalLock());

// A new sign-in starts unlocked with fresh activity.
useAuthStore.subscribe((state, previous) => {
  if (state.status === 'signedIn' && previous.status !== 'signedIn' && state.userId !== previous.userId) {
    resetPersonalLock();
  }
});

export const usePersonalLock = (): PersonalLockState => personalLockStore((state) => state);
