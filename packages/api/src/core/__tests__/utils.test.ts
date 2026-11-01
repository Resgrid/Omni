import { arrayBufferToBase64 } from '../binary';
import { parseApiUtcDate, parseUtcMs, toApiUtcString } from '../dates';
import { isSharedSessionLockedRefresh, sharedSession401 } from '../shared-session';
import { buildPath, buildQuery, isSameOrigin, joinUrl } from '../url';
import { getV4Status, isV4Failure, isV4NotFound, isV4Success, unwrapV4Data, V4FailureError, V4Status } from '../v4-result';

describe('parseApiUtcDate', () => {
  it('treats zone-less API timestamps as UTC (LoggedOnUtc arrives without "Z")', () => {
    expect(parseApiUtcDate('2025-08-06T17:30:00')?.toISOString()).toBe('2025-08-06T17:30:00.000Z');
    expect(parseApiUtcDate('2025-08-06T17:30:00.123')?.toISOString()).toBe('2025-08-06T17:30:00.123Z');
    expect(parseApiUtcDate('2025-08-06 17:30:00')?.toISOString()).toBe('2025-08-06T17:30:00.000Z');
  });

  it('honours explicit zones', () => {
    expect(parseApiUtcDate('2025-08-06T17:30:00Z')?.toISOString()).toBe('2025-08-06T17:30:00.000Z');
    expect(parseApiUtcDate('2025-08-06T17:30:00+02:00')?.toISOString()).toBe('2025-08-06T15:30:00.000Z');
    expect(parseApiUtcDate('2025-08-06T17:30:00-0500')?.toISOString()).toBe('2025-08-06T22:30:00.000Z');
  });

  it('parses date-only values as midnight UTC', () => {
    expect(parseApiUtcDate('2025-08-06')?.toISOString()).toBe('2025-08-06T00:00:00.000Z');
  });

  it('returns null for empty, invalid and .NET MinValue input', () => {
    for (const value of [null, undefined, '', '   ', 'not a date', '0001-01-01T00:00:00', '0001-01-01T00:00:00Z', {}, Number.NaN]) {
      expect(parseApiUtcDate(value)).toBeNull();
    }
  });

  it('accepts Date objects and epoch ms', () => {
    const date = new Date('2025-01-01T00:00:00Z');
    expect(parseApiUtcDate(date)).toBe(date);
    expect(parseApiUtcDate(date.getTime())?.toISOString()).toBe('2025-01-01T00:00:00.000Z');
    expect(parseUtcMs('2025-01-01T00:00:00')).toBe(date.getTime());
    expect(parseUtcMs('nope')).toBeNull();
    expect(toApiUtcString(date)).toBe('2025-01-01T00:00:00.000Z');
  });
});

describe('v4 envelope helpers', () => {
  it('normalises status strings', () => {
    expect(getV4Status({ Status: 'NotFound' })).toBe(V4Status.NotFound);
    expect(getV4Status({ Status: 'not found' })).toBe(V4Status.NotFound);
    expect(getV4Status({ Status: 'Success' })).toBe(V4Status.Success);
    expect(getV4Status({})).toBeNull();
    expect(getV4Status(null)).toBeNull();
  });

  it('classifies success, not_found and failure', () => {
    expect(isV4NotFound({ Status: 'not_found', Data: [] })).toBe(true);
    expect(isV4Success({ Status: 'created' })).toBe(true);
    expect(isV4Success({ Status: 'queued' })).toBe(true);
    expect(isV4Success({})).toBe(true);
    expect(isV4Success({ Status: 'failure' })).toBe(false);
    expect(isV4Failure({ Status: 'failure' })).toBe(true);
  });

  it('unwraps data honouring not_found and failure', () => {
    expect(unwrapV4Data({ Status: 'success', Data: [1] })).toEqual([1]);
    expect(unwrapV4Data<number[]>({ Status: 'not_found', Data: [] }, { notFound: [] })).toEqual([]);
    expect(unwrapV4Data<string | null>({ Status: 'not_found', Data: 'x' }, { notFound: null })).toBeNull();
    expect(() => unwrapV4Data({ Status: 'failure', Data: null, RequestId: 'r1' })).toThrow(V4FailureError);
  });
});

describe('url helpers', () => {
  it('builds queries: skips nullish, repeats arrays, ISO dates, encodes once', () => {
    expect(buildQuery({ a: 1, b: undefined, c: null, d: true, e: ['x', 'y z'], f: new Date('2025-01-01T00:00:00Z') })).toBe('?a=1&d=true&e=x&e=y+z&f=2025-01-01T00%3A00%3A00.000Z');
    expect(buildQuery({})).toBe('');
    expect(buildQuery()).toBe('');
  });

  it('builds paths and joins URLs', () => {
    expect(buildPath('/Mapping/GetIndoorMapFloor/{floorId}', { floorId: 'a/b' })).toBe('/Mapping/GetIndoorMapFloor/a%2Fb');
    expect(() => buildPath('/X/{id}', { id: '' })).toThrow('Missing path parameter "id"');
    expect(joinUrl('https://h/api/v4/', '/Calls/GetCall')).toBe('https://h/api/v4/Calls/GetCall');
  });

  it('only treats the API scheme + host as the same origin', () => {
    const base = 'https://api.resgrid.com/api/v4';
    expect(isSameOrigin('https://api.resgrid.com/api/v4/CallFiles/GetFile?id=1', base)).toBe(true);
    expect(isSameOrigin('https://API.resgrid.com/x', base)).toBe(true);
    expect(isSameOrigin('https://cdn.example.com/blob?sig=1', base)).toBe(false);
    expect(isSameOrigin('http://api.resgrid.com/x', base)).toBe(false);
    expect(isSameOrigin('https://api.resgrid.com.evil.com/x', base)).toBe(false);
    expect(isSameOrigin('/relative/path', base)).toBe(false);
  });
});

describe('shared-session classifiers', () => {
  it('reads 401 lock and expiry bodies, ignoring others', () => {
    expect(sharedSession401({ response: { status: 401, data: { error: 'shared_session_locked', lock_version: 3 } } })).toEqual({ kind: 'locked', lockVersion: 3 });
    expect(sharedSession401({ response: { status: 401, data: { error: 'shared_session_locked' } } })).toEqual({ kind: 'locked', lockVersion: null });
    expect(sharedSession401({ response: { status: 401, data: { error: 'shared_session_expired' } } })).toEqual({ kind: 'expired' });
    expect(sharedSession401({ response: { status: 403, data: { error: 'shared_session_locked' } } })).toBeNull();
    expect(sharedSession401({ response: { status: 401 } })).toBeNull();
    expect(sharedSession401({ status: 401, data: { error: 'shared_session_expired' } })).toEqual({ kind: 'expired' });
  });

  it('recognises a refresh refused while locked', () => {
    expect(isSharedSessionLockedRefresh({ response: { status: 400, data: { error: 'invalid_grant', shared_session_locked: true } } })).toBe(true);
    expect(isSharedSessionLockedRefresh({ response: { status: 400, data: { error: 'invalid_grant' } } })).toBe(false);
  });
});

describe('arrayBufferToBase64', () => {
  it.each([
    ['', ''],
    ['f', 'Zg=='],
    ['fo', 'Zm8='],
    ['foo', 'Zm9v'],
    ['foobar', 'Zm9vYmFy'],
  ])('%p', (input, expected) => {
    expect(arrayBufferToBase64(new TextEncoder().encode(input).buffer as ArrayBuffer)).toBe(expected);
  });
});
