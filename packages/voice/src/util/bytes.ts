/**
 * Byte helpers for BLE payloads and stream credentials. Pure TypeScript so they behave the same on Hermes, browsers,
 * Electron and Node (the legacy apps used the `buffer` polyfill for this).
 */
const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

const BASE64_LOOKUP: Record<string, number> = (() => {
  const lookup: Record<string, number> = {};
  for (let i = 0; i < BASE64_ALPHABET.length; i++) lookup[BASE64_ALPHABET.charAt(i)] = i;
  lookup['-'] = 62;
  lookup['_'] = 63;
  return lookup;
})();

export type ByteSource = ArrayLike<number>;

export const toBytes = (source: ByteSource): Uint8Array => (source instanceof Uint8Array ? source : Uint8Array.from(Array.from(source, (b) => b & 0xff)));

export const utf8Encode = (value: string): Uint8Array => {
  const bytes: number[] = [];
  for (let i = 0; i < value.length; i++) {
    let code = value.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < value.length) {
      const next = value.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        code = 0x10000 + ((code - 0xd800) << 10) + (next - 0xdc00);
        i++;
      }
    }
    if (code < 0x80) bytes.push(code);
    else if (code < 0x800) bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    else if (code < 0x10000) bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    else bytes.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 0x3f), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
  }
  return Uint8Array.from(bytes);
};

export const base64Encode = (input: ByteSource | string): string => {
  const bytes = typeof input === 'string' ? utf8Encode(input) : toBytes(input);
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i] ?? 0;
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];
    const triple = (b0 << 16) | ((b1 ?? 0) << 8) | (b2 ?? 0);
    out += BASE64_ALPHABET.charAt((triple >> 18) & 0x3f) + BASE64_ALPHABET.charAt((triple >> 12) & 0x3f);
    out += b1 === undefined ? '=' : BASE64_ALPHABET.charAt((triple >> 6) & 0x3f);
    out += b2 === undefined ? '=' : BASE64_ALPHABET.charAt(triple & 0x3f);
  }
  return out;
};

/** Decodes standard or URL-safe base64; returns null when the input is not base64. */
export const base64Decode = (input: string): Uint8Array | null => {
  const clean = input.replace(/\s/g, '').replace(/=+$/, '');
  if (clean.length === 0) return new Uint8Array(0);
  if (clean.length % 4 === 1) return null;
  const out: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const char of clean) {
    const value = BASE64_LOOKUP[char];
    if (value === undefined) return null;
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((buffer >> bits) & 0xff);
    }
  }
  return Uint8Array.from(out);
};

export const hexDecode = (input: string): Uint8Array | null => {
  const clean = input.replace(/[^0-9A-Fa-f]/g, '');
  if (clean.length % 2 !== 0) return null;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.substr(i * 2, 2), 16);
  return out;
};

export const hexEncode = (bytes: ByteSource): string => Array.from(toBytes(bytes), (b) => b.toString(16).padStart(2, '0')).join('');

export const asciiDecode = (bytes: ByteSource): string => Array.from(toBytes(bytes), (b) => String.fromCharCode(b & 0x7f)).join('');
