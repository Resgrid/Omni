// expo-crypto fake on node:crypto for the calls @resgrid/auth makes.
import { createHash, randomBytes, randomUUID as nodeRandomUUID } from 'node:crypto';

export const CryptoDigestAlgorithm = { SHA256: 'SHA-256' } as const;
export const CryptoEncoding = { HEX: 'hex', BASE64: 'base64' } as const;

export function randomUUID(): string {
  return nodeRandomUUID();
}

export function getRandomBytes(count: number): Uint8Array {
  return new Uint8Array(randomBytes(count));
}

export async function digestStringAsync(_algorithm: string, data: string, options?: { encoding?: 'hex' | 'base64' }): Promise<string> {
  return createHash('sha256')
    .update(data, 'utf8')
    .digest(options?.encoding === 'base64' ? 'base64' : 'hex');
}
