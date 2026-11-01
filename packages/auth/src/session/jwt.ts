import { jwtDecode } from 'jwt-decode';

import type { ProfileModel } from './types';

// jwt-decode decodes base64url segments and UTF-8 claims correctly (IC decoded raw base64, which throws on '-'/'_' and
// garbled accented names; Unit/Responder hand-rolled the fix). An encrypted (JWE) access token is not decodable, which
// these helpers report as null rather than throwing.

const stripNulls = <T>(value: T): T => (typeof value === 'string' ? (value.replace(/\u0000+/g, '') as T) : value);

/** The payload of a JWT, or null when the token is not a decodable JWT. */
export const decodeJwtPayload = <T extends object = Record<string, unknown>>(token: string | null | undefined): T | null => {
  if (!token) {
    return null;
  }
  try {
    const payload = jwtDecode<T>(token);
    if (typeof payload !== 'object' || payload === null) {
      return null;
    }
    // Some identity providers pad claims with NULs (Unit's sanitizeJson); drop them from string claims.
    const cleaned: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
      cleaned[key] = stripNulls(value);
    }
    return cleaned as T;
  } catch {
    return null;
  }
};

/** A JWT's `exp` claim as epoch milliseconds; null when the token is not a decodable JWT or carries no numeric exp. */
export const getJwtExpiryMs = (token: string | null | undefined): number | null => {
  const payload = decodeJwtPayload<{ exp?: unknown }>(token);
  return typeof payload?.exp === 'number' && Number.isFinite(payload.exp) ? payload.exp * 1000 : null;
};

/** The member's profile from an id token; throws when there is none, which no sign-in may continue without. */
export const profileFromIdToken = (idToken: string | null | undefined): ProfileModel => {
  const profile = decodeJwtPayload<ProfileModel>(idToken);
  if (!profile || typeof profile.sub !== 'string' || profile.sub.length === 0) {
    throw new Error('Invalid authentication response: missing or malformed id token');
  }
  return profile;
};
