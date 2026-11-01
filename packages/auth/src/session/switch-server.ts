import { authLogger } from '../runtime/logger';
import { applyApiCacheScope, authServices } from '../runtime/services';
import { useAuthStore } from './auth-store';
import { buildApiUrl, getBaseApiUrl, isSameServerUrl, type ServerUrlProblem, validateServerUrl, writeBaseApiUrl } from './server-url';

/** Work that must follow a server change (`invalidateConfigRequests`, map style tokens, …), registered by the stores that own it. */
export type ServerChangeListener = (change: { previousApiUrl: string; apiUrl: string }) => void | Promise<void>;

const listeners = new Set<ServerChangeListener>();

export const registerServerChangeListener = (listener: ServerChangeListener): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export type SwitchServerResult = { ok: true; apiUrl: string; changed: boolean } | { ok: false; reason: ServerUrlProblem };

/**
 * Changes the Resgrid server: Dispatch's validation (https only; http only to localhost in a development build), then
 * Responder's order — sign out FIRST, so sign-out's work for the old server (taking this device's push token off it) and
 * anything else the old session had in flight goes to the old server, never the new one (Unit and Dispatch switched
 * first) — then Unit's side effects: the API cache is dropped and re-scoped, and config requests in flight are
 * invalidated by the registered listeners.
 */
export async function switchServer(input: string, allowLocalHttp?: boolean): Promise<SwitchServerResult> {
  const validation = validateServerUrl(input, allowLocalHttp);
  if (!validation.ok) {
    return { ok: false, reason: validation.reason };
  }

  const previousApiUrl = getBaseApiUrl();
  const apiUrl = buildApiUrl(validation.baseUrl);
  if (isSameServerUrl(previousApiUrl, apiUrl)) {
    return { ok: true, apiUrl: previousApiUrl, changed: false };
  }

  const auth = useAuthStore.getState();
  if (auth.status === 'signedIn' || auth.accessToken || auth.refreshToken) {
    await auth.logout(undefined, 'server-switch');
  }

  writeBaseApiUrl(apiUrl);

  // Environment switch: nothing cached from the previous server may be served against the new one.
  try {
    authServices().apiCache?.reset?.();
  } catch {
    // Cache hygiene never blocks the switch; the scope below moves on regardless.
  }
  applyApiCacheScope({ server: apiUrl, userId: null, departmentId: null });

  for (const listener of [...listeners]) {
    try {
      await listener({ previousApiUrl, apiUrl });
    } catch (error) {
      authLogger.warn({ message: 'A server change listener failed', context: { errorType: error instanceof Error ? error.name : typeof error } });
    }
  }
  authLogger.info({ message: 'Server changed' });
  return { ok: true, apiUrl, changed: true };
}
