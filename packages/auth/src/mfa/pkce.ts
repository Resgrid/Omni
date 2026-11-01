import { randomBytes, sha256Base64 } from '../runtime/crypto';
import { base64ToBase64Url, bytesToBase64Url } from './base64url';

/** A fresh random value for a PKCE verifier (43 chars from 32 bytes) or an SSO state. */
export const randomBase64Url = (bytes = 32): string => bytesToBase64Url(randomBytes(bytes));

/** The S256 challenge the broker sees (RFC 7636); the verifier stays in this app's memory until redemption. */
export const s256Challenge = async (verifier: string): Promise<string> => base64ToBase64Url(await sha256Base64(verifier));
