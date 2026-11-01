import { aesDecryptAsync, aesEncryptAsync, AESEncryptionKey, AESSealedData } from 'expo-crypto';

import { getOrCreateSecureKey, type SecureKeyStore } from '../kv/secure-store';
import { base64ToUtf8, bytesToBase64, utf8ToBase64 } from '../util/base64';
import { generateRandomBytes } from '../util/ids';

/**
 * Encryption seam for queued payloads (Responder's encrypted queue, plan §8.2 Protected Data
 * profile). `id` is stored with each payload so a later cipher change can still read old rows.
 */
export interface PayloadCipher {
  readonly id: string;
  encrypt(plaintext: string): Promise<string>;
  decrypt(ciphertext: string): Promise<string>;
}

export const OUTBOX_KEY_NAME = 'resgrid.outbox.key';

/**
 * AES-256-GCM via expo-crypto with a device-generated key kept in the secure store (never in MMKV,
 * never in the build). Ciphertext = base64(iv ‖ ciphertext ‖ tag).
 */
export function createAesGcmPayloadCipher(options: { secureStore: SecureKeyStore; keyName?: string }): PayloadCipher {
  const keyName = options.keyName ?? OUTBOX_KEY_NAME;
  let keyPromise: Promise<AESEncryptionKey> | null = null;
  const loadKey = (): Promise<AESEncryptionKey> => {
    keyPromise ??= getOrCreateSecureKey(options.secureStore, keyName, () => bytesToBase64(generateRandomBytes(32)))
      .then((encoded) => AESEncryptionKey.import(encoded, 'base64'))
      .catch((error: unknown) => {
        keyPromise = null;
        throw error;
      });
    return keyPromise;
  };

  return {
    id: 'aesgcm1',
    async encrypt(plaintext) {
      const key = await loadKey();
      const sealed = await aesEncryptAsync(utf8ToBase64(plaintext), key);
      return sealed.combined('base64');
    },
    async decrypt(ciphertext) {
      const key = await loadKey();
      const sealed = AESSealedData.fromCombined(ciphertext);
      const plaintextBase64 = await aesDecryptAsync(sealed, key, { output: 'base64' });
      return base64ToUtf8(plaintextBase64);
    },
  };
}
