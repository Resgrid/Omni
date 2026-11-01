import type { ResetReason } from '@resgrid/offline';

/**
 * The API cache's identity (`@resgrid/offline` `DurableApiCache`): cache keys embed server + department + user, so a
 * second user (or department, or server) on the device can never be served the first one's cached data. `setScope`
 * drops every entry when the identity changes; `reset` forgets the scope and every entry (sign-out).
 */
export interface ApiCacheScopeTarget {
  setScope(scope: { userId?: string | null; departmentId?: string | null; server?: string | null }): void;
  reset?(): void;
  clear?(): unknown;
}

/** What the shell injects so sign-out can reach everything signed in (`@resgrid/offline` `initOffline()` provides both). */
export interface AuthServices {
  /** The scope wipe (`ScopeWiper.wipeScope`): teardowns → store resets → outbox policy → tables → MMKV except preferences. */
  wipeScope?: (reason: ResetReason) => Promise<unknown>;
  apiCache?: ApiCacheScopeTarget;
}

let services: AuthServices = {};

export function setAuthServices(next: AuthServices): void {
  services = { ...next };
}

export const authServices = (): AuthServices => services;

/** Updates the API cache scope; cache hygiene never breaks sign-in, sign-out or a department switch. */
export function applyApiCacheScope(scope: { userId?: string | null; departmentId?: string | null; server?: string | null }): boolean {
  try {
    services.apiCache?.setScope(scope);
    return true;
  } catch {
    return false;
  }
}
