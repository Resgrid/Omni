import type { CallResultData } from '@resgrid/models';

import { compareCallsNewestFirst, sortCallsNewestFirst } from '../call-order';

const call = (CallId: string, LoggedOnUtc: string): Pick<CallResultData, 'CallId' | 'LoggedOnUtc'> => ({ CallId, LoggedOnUtc });

const ids = (calls: readonly Pick<CallResultData, 'CallId'>[]): string[] => calls.map((entry) => entry.CallId);

describe('newest-first call order', () => {
  it('puts the most recently logged call first, whatever order the server sent', () => {
    const calls = [call('7', '2026-11-07T08:00:00Z'), call('9', '2026-11-07T10:30:00Z'), call('8', '2026-11-07T09:15:00Z')];

    expect(ids(sortCallsNewestFirst(calls))).toEqual(['9', '8', '7']);
  });

  it('reads logged times that arrive without "Z" as UTC', () => {
    expect(ids(sortCallsNewestFirst([call('1', '2026-11-07T08:00:00'), call('2', '2026-11-07T09:00:00Z')]))).toEqual(['2', '1']);
  });

  it('breaks a tie on the logged time by the higher (newer) call id, compared as numbers', () => {
    const at = '2026-11-07T08:00:00Z';

    expect(ids(sortCallsNewestFirst([call('9', at), call('10', at), call('2', at)]))).toEqual(['10', '9', '2']);
  });

  it('puts calls without a logged time after the dated ones, newest id first', () => {
    expect(ids(sortCallsNewestFirst([call('3', ''), call('1', '2026-11-07T08:00:00Z'), call('4', 'not a date')]))).toEqual(['1', '4', '3']);
  });

  it('copies the list instead of reordering it in place', () => {
    const calls = [call('1', '2026-11-07T08:00:00Z'), call('2', '2026-11-07T09:00:00Z')];
    const sorted = sortCallsNewestFirst(calls);

    expect(sorted).not.toBe(calls);
    expect(ids(calls)).toEqual(['1', '2']);
  });

  it('is a comparator for Array.prototype.sort', () => {
    expect(compareCallsNewestFirst(call('1', '2026-11-07T08:00:00Z'), call('2', '2026-11-07T09:00:00Z'))).toBeGreaterThan(0);
    expect(compareCallsNewestFirst(call('2', '2026-11-07T09:00:00Z'), call('1', '2026-11-07T08:00:00Z'))).toBeLessThan(0);
    expect(compareCallsNewestFirst(call('1', '2026-11-07T08:00:00Z'), call('1', '2026-11-07T08:00:00Z'))).toBe(0);
  });
});
