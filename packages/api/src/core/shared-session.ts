import { ApiErrorCodes } from './api-error';

/** The HTTP response an error carries, read by shape so any HTTP error (not only an AxiosError) is understood. */
const responseOf = (error: unknown): { status?: number; data?: unknown } | undefined => {
  const response = (error as { response?: unknown } | null | undefined)?.response;
  if (typeof response === 'object' && response !== null) {
    return response as { status?: number; data?: unknown };
  }
  // ApiError carries status/data directly.
  const direct = error as { status?: unknown; data?: unknown } | null | undefined;
  return typeof direct?.status === 'number' ? { status: direct.status, data: direct.data } : undefined;
};

/** What a 401 from the API said about a shared-device session: locked (unlock it), expired (the shift ran out), or neither. */
export type SharedSession401 = { kind: 'locked'; lockVersion: number | null } | { kind: 'expired' } | null;

/**
 * Classifies a 401 from a shared-device session. A locked session means "unlock", never "sign out" and never a refresh
 * (Core refuses refreshes while locked); an expired one ends the session for good.
 */
export const sharedSession401 = (error: unknown): SharedSession401 => {
  const response = responseOf(error);
  if (response?.status !== 401) {
    return null;
  }
  const body = response.data as { error?: unknown; lock_version?: unknown } | undefined;
  if (typeof body !== 'object' || body === null) {
    return null;
  }
  if (body.error === ApiErrorCodes.SharedSessionLocked) {
    return { kind: 'locked', lockVersion: typeof body.lock_version === 'number' ? body.lock_version : null };
  }
  if (body.error === ApiErrorCodes.SharedSessionExpired) {
    return { kind: 'expired' };
  }
  return null;
};

/**
 * A token refresh refused because the shared session is locked: `invalid_grant` (400) with `shared_session_locked: true`.
 * Not a sign-out: the tokens stay, the lock screen unlocks the same session and the refresh runs again afterwards.
 * Used by the auth workstream's refresh engine.
 */
export const isSharedSessionLockedRefresh = (error: unknown): boolean => {
  const response = responseOf(error);
  if (response?.status !== 400) {
    return false;
  }
  const body = response.data as { shared_session_locked?: unknown } | undefined;
  return typeof body === 'object' && body !== null && body.shared_session_locked === true;
};
