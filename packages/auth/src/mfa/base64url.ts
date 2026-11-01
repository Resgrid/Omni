const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Standard base64 of bytes, without relying on `btoa` (absent on older Hermes builds). */
const bytesToBase64 = (bytes: Uint8Array): string => {
  let output = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const triple = (a << 16) | (b << 8) | c;
    output += ALPHABET[(triple >> 18) & 63] + ALPHABET[(triple >> 12) & 63];
    output += i + 1 < bytes.length ? ALPHABET[(triple >> 6) & 63] : '=';
    output += i + 2 < bytes.length ? ALPHABET[triple & 63] : '=';
  }
  return output;
};

const base64ToBytes = (value: string): Uint8Array => {
  const clean = value.replace(/=+$/, '');
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const char of clean) {
    const index = ALPHABET.indexOf(char);
    if (index < 0) {
      throw new Error('Invalid base64 input');
    }
    buffer = (buffer << 6) | index;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return new Uint8Array(bytes);
};

/** RFC 4648 base64url without padding, for WebAuthn values on the web and PKCE (the native passkey module does its own). */
export const bytesToBase64Url = (bytes: ArrayBuffer | Uint8Array): string => base64ToBase64Url(bytesToBase64(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)));

export const base64UrlToBytes = (value: string): Uint8Array => base64ToBytes(value.replace(/-/g, '+').replace(/_/g, '/'));

export const base64ToBase64Url = (value: string): string => value.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
