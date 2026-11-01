import { getActiveDepartmentId, getBaseApiUrl, securityStore, useAuthStore } from '@resgrid/auth';
import type { DataSessionScope } from '@resgrid/data';
import type { NotificationsSession } from '@resgrid/notifications';
import { CONTRACT_KEYS, readLegacyString } from '@resgrid/offline';

import { useActiveSessionStore } from './active-session';
import { getShellRuntime } from './runtime-holder';

/**
 * Session getters injected into the platform packages (they never import auth). Read at call time, never cached, so a
 * sign-out, department switch or unit change is seen immediately.
 */

let activeUnitProvider: (() => string | null) | null = null;

/** Unit: the module that owns unit selection provides the active unit (default: the legacy `activeUnitId` key). */
export function setActiveUnitProvider(provider: (() => string | null) | null): void {
  activeUnitProvider = provider;
}

export function isSessionSignedIn(): boolean {
  const state = useAuthStore.getState();
  return state.status === 'signedIn' && !!state.accessToken;
}

export function getSessionUserId(): string | null {
  return isSessionSignedIn() ? useAuthStore.getState().userId : null;
}

export function getActiveUnitId(): string | null {
  try {
    if (activeUnitProvider) {
      return activeUnitProvider();
    }
    const selected = useActiveSessionStore.getState().activeUnitId;
    if (selected) {
      return selected;
    }
    const main = getShellRuntime().offline?.storage.main;
    const value = main ? readLegacyString(main, CONTRACT_KEYS.activeUnitId) : null;
    return value && value.trim() !== '' ? value : null;
  } catch {
    return null;
  }
}

const toPositiveInt = (value: string | number | null | undefined): number | null => {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
};

/** server + department + user (+ unit) — the scope every offline record and outbox item is keyed by. */
export function getSessionScope(): DataSessionScope | null {
  const userId = getSessionUserId();
  if (!userId) {
    return null;
  }
  const departmentId = toPositiveInt(getActiveDepartmentId());
  if (departmentId === null) {
    return null;
  }
  const unitId = toPositiveInt(getActiveUnitId());
  return { server: getBaseApiUrl(), departmentId, userId, ...(unitId === null ? {} : { unitId }) };
}

/** The session as notifications needs it (Novu subscriber, push registration). */
export function getNotificationsSession(): NotificationsSession | null {
  const userId = getSessionUserId();
  const rights = securityStore.getState().rights;
  if (!userId || !rights?.DepartmentCode) {
    return null;
  }
  return {
    userId,
    departmentId: rights.DepartmentId || null,
    departmentCode: rights.DepartmentCode,
    rights: { NovuSubscriberHash: rights.NovuSubscriberHash ?? null, NovuICSubscriberHash: rights.NovuICSubscriberHash ?? null },
  };
}
