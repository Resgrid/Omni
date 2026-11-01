import { createSha256, isSha256Hex, sha256Hex } from '../sha256';
import { bytesOf, sha } from './helpers';

describe('sha256', () => {
  it('matches the FIPS 180-4 test vectors', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe('248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1');
  });

  it('matches node:crypto across block boundaries and when fed in uneven chunks', () => {
    for (const length of [1, 55, 56, 57, 63, 64, 65, 127, 128, 1000, 70_001]) {
      const data = bytesOf(length, length);
      expect(createSha256().update(data).digestHex()).toBe(sha(data));
      const chunked = createSha256();
      for (let offset = 0; offset < data.length; offset += 37) chunked.update(data.subarray(offset, offset + 37));
      expect(chunked.digestHex()).toBe(sha(data));
    }
  });

  it('refuses updates after the digest', () => {
    const hasher = createSha256().update(new Uint8Array([1]));
    hasher.digestHex();
    expect(() => hasher.update(new Uint8Array([2]))).toThrow();
  });

  it('recognises hex digests', () => {
    expect(isSha256Hex(sha256Hex('x'))).toBe(true);
    expect(isSha256Hex('abc')).toBe(false);
    expect(isSha256Hex(null)).toBe(false);
  });
});
