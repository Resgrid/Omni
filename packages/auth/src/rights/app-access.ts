import type { DepartmentRightsResultData } from '@resgrid/models';

import { authLogger } from '../runtime/logger';
import { authCapabilities } from '../runtime/variant';
import { useAuthStore } from '../session/auth-store';
import { getCurrentRights } from './security-store';

export type AppAccessDecision = 'allowed' | 'denied' | 'unknown';

/** The right this variant requires (`capabilities.auth.appAccessRight`: IC `CanLoginToCommandApp`, Dispatch `CanLoginToDispatchApp`), or null. */
export const requiredAppAccessRight = (): 'CanLoginToCommandApp' | 'CanLoginToDispatchApp' | null => {
  try {
    return authCapabilities().appAccessRight;
  } catch {
    return null;
  }
};

/**
 * Whether the rights let this member use this app. Deliberately strict about what denies: only an explicit `false`.
 * Rights that failed to load, or a server old enough to omit the field, leave the session alone rather than locking a
 * commander or dispatcher out (IC/Dispatch). Variants without an access right are always allowed.
 */
export const checkAppAccess = (rights: DepartmentRightsResultData | null = getCurrentRights()): AppAccessDecision => {
  const right = requiredAppAccessRight();
  if (!right) {
    return 'allowed';
  }
  if (!rights) {
    return 'unknown';
  }
  const value = (rights as unknown as Record<string, unknown>)[right];
  return value === false ? 'denied' : 'allowed';
};

/**
 * The app-access gate (ShellGate step): signs a denied member straight back out — the server refuses them the app's
 * endpoints anyway, and an app that loads and then fails every request is far less clear. The caller shows the
 * (already-translated) denial message and stops initializing when this returns true.
 */
export async function enforceAppAccess(onDenied?: () => void): Promise<boolean> {
  if (checkAppAccess() !== 'denied') {
    return false;
  }
  authLogger.warn({ message: 'Member is not authorized to use this app; signing out', context: { right: requiredAppAccessRight() } });
  onDenied?.();
  await useAuthStore.getState().logout('app_access_denied', 'access-denied');
  return true;
}
