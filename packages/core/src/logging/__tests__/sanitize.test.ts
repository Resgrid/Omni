// Ported from IC src/lib/logging/__tests__/index.test.ts (sanitizeLogContext), extended with free-text scrubbing.
import { isSensitiveKey, REDACTED, sanitizeLogContext, sanitizeLogMessage, sanitizeUrl, scrubText, stripControlCharacters, toCaptureableError } from '../sanitize';

describe('sanitizeLogContext', () => {
  it('redacts sensitive keys', () => {
    expect(sanitizeLogContext({ accessToken: 'abc', refresh_token: 'def', password: 'hunter2', unitId: 'unit-123' })).toEqual({
      accessToken: REDACTED,
      refresh_token: REDACTED,
      password: REDACTED,
      unitId: 'unit-123',
    });
  });

  it('redacts usernames, emails, protected values and a bare auth key, but not words that merely start with "auth"', () => {
    expect(sanitizeLogContext({ username: 'pat', userEmail: 'pat@example.com', protectedValue: 'secret', auth: 'x', authority: 'https://idp.example.com', author: 'Pat' })).toEqual({
      username: REDACTED,
      userEmail: REDACTED,
      protectedValue: REDACTED,
      auth: REDACTED,
      authority: 'https://idp.example.com',
      author: 'Pat',
    });
  });

  it('reduces an axios error to a summary without the request body or query string', () => {
    const axiosError = Object.assign(new Error('Request failed with status code 401'), {
      name: 'AxiosError',
      isAxiosError: true,
      code: 'ERR_BAD_REQUEST',
      config: { method: 'post', url: '/Connect/token?x=1', baseURL: 'https://api.resgrid.com/api/v4', data: 'password=hunter2' },
      response: { status: 401 },
    });

    expect(sanitizeLogContext({ error: axiosError })).toEqual({
      error: {
        name: 'AxiosError',
        message: 'Request failed with status code 401',
        code: 'ERR_BAD_REQUEST',
        status: 401,
        method: 'post',
        url: '/Connect/token',
        baseURL: 'https://api.resgrid.com/api/v4',
        isAxiosError: true,
      },
    });
    expect(JSON.stringify(sanitizeLogContext({ error: axiosError }))).not.toContain('hunter2');
  });

  it('expands a plain Error, whose properties are non-enumerable', () => {
    const error = new Error('boom');
    error.stack = 'Error: boom\n    at somewhere';
    expect(sanitizeLogContext({ error })).toEqual({ error: { name: 'Error', message: 'boom', stack: 'Error: boom\n    at somewhere' } });
  });

  it('redacts sensitive keys inside array elements', () => {
    expect(sanitizeLogContext({ items: [{ accessToken: 'a', unitId: 'u1' }, 'plain'] })).toEqual({ items: [{ accessToken: REDACTED, unitId: 'u1' }, 'plain'] });
  });

  it('replaces objects and arrays past the depth limit instead of passing their keys through unchecked', () => {
    expect(sanitizeLogContext({ a: { b: { c: { password: 'x' }, list: [{ password: 'x' }] } } })).toEqual({ a: { b: { c: '[Object]', list: '[Array]' } } });
  });

  it('keeps Date values intact', () => {
    const at = new Date('2026-10-31T12:00:00Z');
    expect(sanitizeLogContext({ at, nested: { at } })).toEqual({ at, nested: { at } });
  });

  it('scrubs credentials and control characters inside string values', () => {
    expect(sanitizeLogContext({ header: 'Bearer eyJhbGciOi.payload.sig', url: '/x?access_token=abc&unit=1', note: '\u001b[31mred\u001b[0m' })).toEqual({
      header: `Bearer ${REDACTED}`,
      url: `/x?access_token=${REDACTED}&unit=1`,
      note: 'red',
    });
  });

  it('returns an empty object for missing context', () => {
    expect(sanitizeLogContext(undefined)).toEqual({});
  });
});

describe('free text', () => {
  it('strips ANSI escape sequences and other control characters but keeps tabs and newlines', () => {
    expect(stripControlCharacters('\u001b[1;33mwarn\u001b[0m\tline\nnext\u0007')).toBe('warn\tline\nnext');
  });

  it('redacts inline bearer tokens and secret parameters', () => {
    expect(scrubText('Authorization: Bearer abc.def-ghi')).toBe(`Authorization: Bearer ${REDACTED}`);
    expect(scrubText('grant_type=password&username=pat&password=hunter2')).toBe(`grant_type=password&username=${REDACTED}&password=${REDACTED}`);
    expect(sanitizeLogMessage('refresh_token=xyz failed')).toBe(`refresh_token=${REDACTED} failed`);
  });

  it('strips query strings and hashes from URLs', () => {
    expect(sanitizeUrl('https://api.example.com/a?token=1#frag')).toBe('https://api.example.com/a');
    expect(sanitizeUrl('')).toBeUndefined();
    expect(sanitizeUrl(42)).toBeUndefined();
  });

  it('classifies sensitive keys by fragment and exact match', () => {
    expect(isSensitiveKey('id_token')).toBe(true);
    expect(isSensitiveKey('pin')).toBe(true);
    expect(isSensitiveKey('mapPinId')).toBe(false);
    expect(isSensitiveKey('callId')).toBe(false);
  });
});

describe('toCaptureableError', () => {
  it('copies only name, message and stack', () => {
    const original = Object.assign(new Error('Request failed'), { name: 'AxiosError', config: { data: 'password=hunter2' } });
    const copy = toCaptureableError(original);
    expect(copy).toBeInstanceOf(Error);
    expect(copy).not.toBe(original);
    expect(copy?.name).toBe('AxiosError');
    expect(copy?.stack).toBe(original.stack);
    expect(copy).not.toHaveProperty('config');
  });

  it('returns null for non-errors', () => {
    expect(toCaptureableError('invalid_grant')).toBeNull();
  });
});
