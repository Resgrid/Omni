// expo-crypto fake on node:crypto: UUIDs, random bytes and AES-GCM with the same sealed-data layout
// (iv ‖ ciphertext ‖ tag) as the native module.
import { createCipheriv, createDecipheriv, randomBytes, randomUUID as nodeRandomUUID } from 'node:crypto';

export function randomUUID(): string {
  return nodeRandomUUID();
}

export function getRandomBytes(count: number): Uint8Array {
  return new Uint8Array(randomBytes(count));
}

const IV_LENGTH = 12;
const TAG_LENGTH = 16;

export class AESEncryptionKey {
  private constructor(readonly keyBytes: Uint8Array) {}

  static async import(encoded: string, encoding: 'hex' | 'base64'): Promise<AESEncryptionKey> {
    return new AESEncryptionKey(new Uint8Array(Buffer.from(encoded, encoding)));
  }
}

export class AESSealedData {
  private constructor(private readonly bytes: Uint8Array) {}

  static fromCombined(combined: string | Uint8Array): AESSealedData {
    return new AESSealedData(typeof combined === 'string' ? new Uint8Array(Buffer.from(combined, 'base64')) : combined);
  }

  static fromBytes(bytes: Uint8Array): AESSealedData {
    return new AESSealedData(bytes);
  }

  async combined(encoding?: 'bytes' | 'base64'): Promise<string | Uint8Array> {
    return encoding === 'base64' ? Buffer.from(this.bytes).toString('base64') : this.bytes;
  }

  parts(): { iv: Buffer; ciphertext: Buffer; tag: Buffer } {
    const buffer = Buffer.from(this.bytes);
    return { iv: buffer.subarray(0, IV_LENGTH), ciphertext: buffer.subarray(IV_LENGTH, buffer.length - TAG_LENGTH), tag: buffer.subarray(buffer.length - TAG_LENGTH) };
  }
}

export async function aesEncryptAsync(plaintextBase64: string, key: AESEncryptionKey): Promise<AESSealedData> {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', key.keyBytes, iv);
  const ciphertext = Buffer.concat([cipher.update(Buffer.from(plaintextBase64, 'base64')), cipher.final()]);
  return AESSealedData.fromBytes(new Uint8Array(Buffer.concat([iv, ciphertext, cipher.getAuthTag()])));
}

export async function aesDecryptAsync(sealed: AESSealedData, key: AESEncryptionKey, options?: { output?: 'bytes' | 'base64' }): Promise<string | Uint8Array> {
  const { iv, ciphertext, tag } = sealed.parts();
  const decipher = createDecipheriv('aes-256-gcm', key.keyBytes, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return options?.output === 'base64' ? plaintext.toString('base64') : new Uint8Array(plaintext);
}
