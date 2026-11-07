import { getBadgeCounts, getMessage } from '@resgrid/api';
import { BadgeCountResultData, BadgeCountsResult, MessageResult, MessageResultData } from '@resgrid/models';
import { defaultResetRegistry } from '@resgrid/offline';

import { createDataTestRuntime, type DataTestRuntime, httpError, persisted } from '../../__tests__/helpers';
import { useMessagesStore } from '../../messages/messages-store';
import { BADGE_COUNTS_REFRESH_DELAY_MS, BADGE_COUNTS_STALE_MS, refreshBadgeCountsIfStale, refreshBadgeCountsSoon, selectBadgeCount, toBadgeCounts, useBadgeCountsStore } from '../badge-counts-store';

jest.mock('@resgrid/api', () => ({ ...jest.requireActual('@resgrid/api'), getBadgeCounts: jest.fn(), getMessage: jest.fn() }));

const mockGetBadgeCounts = jest.mocked(getBadgeCounts);

const item = (Key: string, Count: number, Breakdown: Record<string, number> | null = null): BadgeCountResultData => Object.assign(new BadgeCountResultData(), { Key, Count, Breakdown });

/** A successful Counts/GetBadgeCounts answer with these counts, by key. */
const counted = (counts: Record<string, number>): BadgeCountsResult => Object.assign(new BadgeCountsResult(), { Status: 'success', Data: Object.entries(counts).map(([key, count]) => item(key, count)) });

let runtime: DataTestRuntime;

beforeEach(async () => {
  runtime = await createDataTestRuntime({ variant: 'responder' });
  await defaultResetRegistry.getStoreResets().get('data.badge-counts')?.('logout');
  mockGetBadgeCounts.mockReset();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('toBadgeCounts', () => {
  it('keeps known keys with usable counts and ignores keys this app does not know yet', () => {
    expect(toBadgeCounts([item('calls', 3), item('weather', 3, { extreme: 1, severe: 2 }), item('messages', 0), item('future-thing', 9), item('chats', -1)])).toEqual({ calls: 3, weather: 3, messages: 0 });
    expect(toBadgeCounts(null)).toEqual({});
  });
});

describe('selectBadgeCount', () => {
  const state = { counts: { calls: 2, chats: 0, shifts: 1, shiftTrades: 3 }, unreadNotifications: 5 };

  it('shows a count only above zero; the Novu count comes from its own field', () => {
    expect(selectBadgeCount('calls')(state)).toBe(2);
    expect(selectBadgeCount('chats')(state)).toBeNull();
    expect(selectBadgeCount('messages')(state)).toBeNull();
    expect(selectBadgeCount('notifications')(state)).toBe(5);
  });

  it('several keys show their sum', () => {
    expect(selectBadgeCount(['shifts', 'shiftTrades'])(state)).toBe(4);
    expect(selectBadgeCount(['chats', 'messages'])(state)).toBeNull();
  });
});

describe('badge counts store', () => {
  it('asks only for the wanted counts, in one request, with the active unit', async () => {
    mockGetBadgeCounts.mockResolvedValue(counted({ calls: 4, chats: 7, shifts: 1 }));

    await useBadgeCountsStore.getState().requestBadgeCounts(['chats', 'calls', 'notifications', ['shifts', 'shiftTrades']], { activeUnitId: 12 });

    expect(mockGetBadgeCounts).toHaveBeenCalledTimes(1);
    expect(mockGetBadgeCounts.mock.calls[0]?.[1]).toEqual({ include: ['calls', 'chats', 'shifts', 'shiftTrades'], activeUnitId: 12 });
    expect(useBadgeCountsStore.getState().counts).toEqual({ calls: 4, chats: 7, shifts: 1 });
    expect(persisted(runtime.kv, 'omni-badge-counts-storage')?.state.counts).toEqual({ calls: 4, chats: 7, shifts: 1 });
  });

  it('does not ask again for counts it already wants, and never asks when nothing is wanted', async () => {
    mockGetBadgeCounts.mockResolvedValue(counted({ calls: 1 }));

    await useBadgeCountsStore.getState().fetchBadgeCounts();
    expect(mockGetBadgeCounts).not.toHaveBeenCalled();

    await useBadgeCountsStore.getState().requestBadgeCounts(['calls']);
    await useBadgeCountsStore.getState().requestBadgeCounts(['calls']);
    expect(mockGetBadgeCounts).toHaveBeenCalledTimes(1);
  });

  it('an answer replaces only the counts it was asked for', async () => {
    mockGetBadgeCounts.mockResolvedValueOnce(counted({ calls: 2 }));
    await useBadgeCountsStore.getState().requestBadgeCounts(['calls']);

    mockGetBadgeCounts.mockResolvedValueOnce(counted({ calls: 0, weather: 1 }));
    await useBadgeCountsStore.getState().requestBadgeCounts(['weather']);

    expect(mockGetBadgeCounts.mock.calls[1]?.[1]).toEqual({ include: ['calls', 'weather'], activeUnitId: null });
    expect(useBadgeCountsStore.getState().counts).toEqual({ calls: 0, weather: 1 });
  });

  it('a count the server leaves out (no permission, module off) shows no badge', async () => {
    mockGetBadgeCounts.mockResolvedValueOnce(counted({ calls: 3, messages: 2 }));
    await useBadgeCountsStore.getState().requestBadgeCounts(['calls', 'messages']);

    mockGetBadgeCounts.mockResolvedValueOnce(counted({ calls: 3 }));
    await useBadgeCountsStore.getState().fetchBadgeCounts(undefined, { bypassCache: true });

    expect(useBadgeCountsStore.getState().counts).toEqual({ calls: 3 });
  });

  it('stops asking an older server without the endpoint and shows no counts', async () => {
    mockGetBadgeCounts.mockRejectedValue(httpError(404));

    await useBadgeCountsStore.getState().requestBadgeCounts(['calls']);
    expect(useBadgeCountsStore.getState().unsupported).toBe(true);

    await useBadgeCountsStore.getState().fetchBadgeCounts(undefined, { bypassCache: true });
    expect(mockGetBadgeCounts).toHaveBeenCalledTimes(1);
  });

  it('keeps the last counts when a refresh fails for another reason', async () => {
    mockGetBadgeCounts.mockResolvedValueOnce(counted({ chats: 6 }));
    await useBadgeCountsStore.getState().requestBadgeCounts(['chats']);

    mockGetBadgeCounts.mockRejectedValueOnce(httpError(500));
    await useBadgeCountsStore.getState().fetchBadgeCounts(undefined, { bypassCache: true });

    expect(useBadgeCountsStore.getState().counts).toEqual({ chats: 6 });
    expect(useBadgeCountsStore.getState().unsupported).toBe(false);
  });

  it('a burst of refreshes costs one request once it settles', async () => {
    mockGetBadgeCounts.mockResolvedValue(counted({ messages: 1 }));
    await useBadgeCountsStore.getState().requestBadgeCounts(['messages']);
    mockGetBadgeCounts.mockClear();
    jest.useFakeTimers();

    refreshBadgeCountsSoon(1000);
    refreshBadgeCountsSoon(1000);
    jest.advanceTimersByTime(900);
    refreshBadgeCountsSoon(1000);
    jest.advanceTimersByTime(999);
    expect(mockGetBadgeCounts).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);

    expect(mockGetBadgeCounts).toHaveBeenCalledTimes(1);
  });

  it('sign-out forgets the counts and the wanted list', async () => {
    mockGetBadgeCounts.mockResolvedValue(counted({ calls: 9 }));
    await useBadgeCountsStore.getState().requestBadgeCounts(['calls']);
    useBadgeCountsStore.getState().setUnreadNotifications(4);

    await defaultResetRegistry.getStoreResets().get('data.badge-counts')?.('logout');

    expect(useBadgeCountsStore.getState()).toEqual(expect.objectContaining({ counts: {}, wanted: [], unreadNotifications: 0, unsupported: false }));
  });

  it('opening a message (Core marks it read) refreshes the counts', async () => {
    mockGetBadgeCounts.mockResolvedValue(counted({ messages: 1 }));
    await useBadgeCountsStore.getState().requestBadgeCounts(['messages']);
    mockGetBadgeCounts.mockClear();
    jest.mocked(getMessage).mockResolvedValue(Object.assign(new MessageResult(), { Status: 'success', Data: Object.assign(new MessageResultData(), { MessageId: 'm1', Subject: 'Hi' }) }));
    jest.useFakeTimers();

    await useMessagesStore.getState().fetchMessageDetails('m1', { bypassCache: true });
    jest.advanceTimersByTime(BADGE_COUNTS_REFRESH_DELAY_MS);

    expect(mockGetBadgeCounts).toHaveBeenCalledTimes(1);
  });

  // A screen's focus right after the shell asked (the Responder home on launch) does not send a second request.
  it('refreshes on focus only when no request left recently', async () => {
    mockGetBadgeCounts.mockResolvedValue(counted({ calls: 1 }));
    await useBadgeCountsStore.getState().requestBadgeCounts(['calls']);
    mockGetBadgeCounts.mockClear();
    jest.useFakeTimers();

    refreshBadgeCountsIfStale();
    jest.advanceTimersByTime(0);
    expect(mockGetBadgeCounts).not.toHaveBeenCalled();

    runtime.clock.advance(BADGE_COUNTS_STALE_MS);
    refreshBadgeCountsIfStale();
    jest.advanceTimersByTime(0);
    expect(mockGetBadgeCounts).toHaveBeenCalledTimes(1);
  });
});
