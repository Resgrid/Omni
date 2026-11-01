import { randomUUID, sha256Hex } from '../runtime/crypto';
import { authLogger, describeError } from '../runtime/logger';
import { mainKv } from '../runtime/storage';

// ---------------------------------------------------------------------------------------------------------------------
// The personal lock screen's offline password check (Dispatch): a salted SHA-256 of the password, never the password
// itself. Stored only after a password sign-in on a personal installation; a shared installation and an SSO sign-in
// never keep one. Keys are Dispatch's, so an upgraded Dispatch keeps its verifier.
// ---------------------------------------------------------------------------------------------------------------------

export const PASSWORD_VERIFICATION_HASH_KEY = 'PASSWORD_VERIFICATION_HASH';
export const PASSWORD_VERIFICATION_SALT_KEY = 'PASSWORD_VERIFICATION_SALT';

/** A salted SHA-256 of the password for the personal lock screen; never the password itself. */
export interface PasswordVerification {
  salt: string;
  hash: string;
}

/** Legacy `setItem` wrote JSON-encoded strings; read either form. */
const readString = (key: string): string | null => {
  const raw = mainKv()?.getString(key);
  if (!raw) {
    return null;
  }
  if (raw.startsWith('"')) {
    try {
      const parsed: unknown = JSON.parse(raw);
      return typeof parsed === 'string' ? parsed : null;
    } catch {
      return raw;
    }
  }
  return raw;
};

const hashWith = (salt: string, password: string): Promise<string> => sha256Hex(`${salt}:${password}`);

/**
 * Computes the verifier without storing it, so a sign-in still waiting for its second factor can hold it in memory (never
 * the password) and store it only once the sign-in finishes.
 */
export const computePasswordVerification = async (password: string): Promise<PasswordVerification | null> => {
  try {
    const salt = readString(PASSWORD_VERIFICATION_SALT_KEY) ?? randomUUID();
    return { salt, hash: await hashWith(salt, password) };
  } catch (error) {
    authLogger.error({ message: 'Failed to compute the lock screen password verifier', context: describeError(error) });
    return null;
  }
};

export const savePasswordVerification = (verification: PasswordVerification): void => {
  const kv = mainKv();
  kv?.setJSON(PASSWORD_VERIFICATION_SALT_KEY, verification.salt);
  kv?.setJSON(PASSWORD_VERIFICATION_HASH_KEY, verification.hash);
};

export const hasPasswordVerification = (): boolean => !!readString(PASSWORD_VERIFICATION_SALT_KEY) && !!readString(PASSWORD_VERIFICATION_HASH_KEY);

/** Null when no verifier is stored (an SSO sign-in, a shared installation), true on a match, false on a mismatch. */
export const verifyPassword = async (password: string): Promise<boolean | null> => {
  const salt = readString(PASSWORD_VERIFICATION_SALT_KEY);
  const stored = readString(PASSWORD_VERIFICATION_HASH_KEY);
  if (!salt || !stored) {
    return null;
  }
  try {
    return (await hashWith(salt, password)) === stored;
  } catch (error) {
    authLogger.error({ message: 'Failed to verify the lock screen password', context: describeError(error) });
    return null;
  }
};

export const clearPasswordVerification = (): void => {
  const kv = mainKv();
  kv?.delete(PASSWORD_VERIFICATION_HASH_KEY);
  kv?.delete(PASSWORD_VERIFICATION_SALT_KEY);
};
