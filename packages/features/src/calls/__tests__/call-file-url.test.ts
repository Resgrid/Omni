import { getCallFileUrl } from '../lib/call-file-url';

describe('call attachment links', () => {
  it('preserves HTTPS links without rewriting a signed query', () => {
    const link = 'https://example.com/file?query=x%2B%2F%3D';
    expect(getCallFileUrl(link, false)).toBe(link);
  });

  it('accepts loopback HTTP only in development', () => {
    const link = 'http://127.0.0.1:18967/api/v4/CallFiles/GetFile';
    expect(getCallFileUrl(link, true)).toBe(link);
    expect(getCallFileUrl(link, false)).toBeNull();
    expect(getCallFileUrl('http://example.com/file', true)).toBeNull();
  });

  it('rejects malformed URLs, user credentials and executable schemes', () => {
    expect(getCallFileUrl('/file', true)).toBeNull();
    expect(getCallFileUrl('https://user:password@example.com/file', false)).toBeNull();
    expect(getCallFileUrl('javascript:alert(1)', true)).toBeNull();
  });
});
