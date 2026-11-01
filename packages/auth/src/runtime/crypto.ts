import * as Crypto from 'expo-crypto';

/** Hashing and randomness for PKCE, SSO state, SAML relay state and the personal-lock verifier (expo-crypto on every platform). */
export const randomBytes = (count: number): Uint8Array => Crypto.getRandomBytes(count);

export const randomUUID = (): string => Crypto.randomUUID();

export const sha256Hex = (value: string): Promise<string> => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value, { encoding: Crypto.CryptoEncoding.HEX });

export const sha256Base64 = (value: string): Promise<string> => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value, { encoding: Crypto.CryptoEncoding.BASE64 });
