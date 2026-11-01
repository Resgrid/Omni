// Test helpers for packages that depend on @resgrid/offline: import from '@resgrid/offline/testing'.
// Nothing here is secure or durable — never use it in app code.
import type { PayloadCipher } from './outbox/cipher';
import { base64ToUtf8, utf8ToBase64 } from './util/base64';

export { createMemoryDb } from './db/memory-db';
export { createMemoryKvBackend, createMemoryKvBackendFactory } from './kv/memory-backend';
export { createMemorySecureKeyStore } from './kv/secure-store';
export { createManualConnectivitySource } from './outbox/connectivity';
export { createOutboxHandlerRegistry } from './outbox/registry';

/** Reversible stand-in for the payload cipher. Marks ciphertext so tests can assert it was used. */
export function createTestPayloadCipher(id = 'test'): PayloadCipher & { encryptCalls: number; decryptCalls: number } {
  const cipher = {
    id,
    encryptCalls: 0,
    decryptCalls: 0,
    async encrypt(plaintext: string) {
      cipher.encryptCalls++;
      return `${id}:${utf8ToBase64(plaintext)}`;
    },
    async decrypt(ciphertext: string) {
      cipher.decryptCalls++;
      if (!ciphertext.startsWith(`${id}:`)) throw new Error('Not produced by this cipher.');
      return base64ToUtf8(ciphertext.slice(id.length + 1));
    },
  };
  return cipher;
}
