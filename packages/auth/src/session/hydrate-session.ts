import { CONTRACT_KEYS } from '@resgrid/offline';

import { authLogger } from '../runtime/logger';
import { applyApiCacheScope } from '../runtime/services';
import { mainKv, storeKv } from '../runtime/storage';
import { AUTH_STORE_NAME, readPersistedAuth, restoreSession, useAuthStore } from './auth-store';
import { decodeJwtPayload } from './jwt';
import { getBaseApiUrl } from './server-url';
import type { AuthResponse, ProfileModel } from './types';

interface PersistEnvelope {
  state: Record<string, unknown>;
  version: number;
}

const readEnvelope = (raw: string | undefined): PersistEnvelope | null => {
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<PersistEnvelope>;
    return typeof parsed === 'object' && parsed !== null && typeof parsed.state === 'object' && parsed.state !== null ? { state: parsed.state, version: typeof parsed.version === 'number' ? parsed.version : 0 } : null;
  } catch {
    return null;
  }
};

/** Responder stamped `obtained_at` on the stored token response; with `expires_in` that gives the access-token expiry. */
const expiryFromLegacyResponse = (response: AuthResponse | null): string | null =>
  response && typeof response.obtained_at === 'number' && typeof response.expires_in === 'number' ? String(response.obtained_at + response.expires_in * 1000) : null;

/**
 * Upgrade continuity: makes the persisted session readable whatever legacy build wrote it, then rehydrates and restores.
 *
 * - The persisted store is always `auth-storage` (zustand envelope `{ state, version: 0 }`), in the variant's
 *   `auth-storage` instance (Dispatch, BigBoard) or its main instance (Responder, Unit, IC) — read as-is.
 * - Responder, Unit and IC also kept the raw token response under `authResponse` in the main instance. When the store
 *   blob is missing or unreadable but that copy has a refresh token, the session is rebuilt from it; when the blob lacks
 *   an access-token expiry (Responder's shape), the copy's `obtained_at + expires_in` supplies one.
 * - The persisted identity stamps the API cache scope before anything reads the cache (Responder).
 */
export async function hydrateAuthSession(now: number = Date.now()): Promise<void> {
  const kv = storeKv(AUTH_STORE_NAME);
  const main = mainKv();
  if (kv) {
    const envelope = readEnvelope(kv.getString(AUTH_STORE_NAME));
    const legacyResponse = main ? main.getJSON<AuthResponse>(CONTRACT_KEYS.authResponse, { deleteOnCorrupt: false }) : null;
    const persisted = envelope ? readPersistedAuth(envelope.state) : null;

    if ((!persisted || !persisted.refreshToken) && legacyResponse?.refresh_token) {
      const profile = decodeJwtPayload<ProfileModel>(legacyResponse.id_token ?? null);
      const rebuilt = {
        accessToken: legacyResponse.access_token ?? null,
        refreshToken: legacyResponse.refresh_token,
        refreshTokenExpiresOn: expiryFromLegacyResponse(legacyResponse),
        profile,
        userId: typeof profile?.sub === 'string' ? profile.sub : null,
        isFirstTime: false,
        status: 'signedIn',
      };
      kv.set(AUTH_STORE_NAME, JSON.stringify({ state: rebuilt, version: 0 }));
      authLogger.info({ message: 'Restored the session from the legacy token response' });
    } else if (envelope && persisted && !persisted.refreshTokenExpiresOn) {
      const expiry = expiryFromLegacyResponse(legacyResponse);
      if (expiry) {
        kv.set(AUTH_STORE_NAME, JSON.stringify({ ...envelope, state: { ...envelope.state, refreshTokenExpiresOn: expiry } }));
      }
    }
  }

  await useAuthStore.persist.rehydrate();
  if (!useAuthStore.getState().hydrated) {
    useAuthStore.setState({ hydrated: true });
  }

  const { userId } = useAuthStore.getState();
  applyApiCacheScope({ userId, server: getBaseApiUrl() });
  restoreSession(now);
}
