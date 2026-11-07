import { BADGE_COUNTS_REFRESH_DELAY_MS, useBadgeCountsStore } from '@resgrid/data';
import { useInboxUnreadCount, useNovuInboxConfig } from '@resgrid/notifications';
import { act, render } from '@testing-library/react-native';
import React from 'react';

import { ShellInboxProvider } from '../inbox-provider';

const mockUnreadCount = jest.mocked(useInboxUnreadCount);
const mockInboxConfig = jest.mocked(useNovuInboxConfig);

// The Novu unread count feeds the badge counts store; a change in it (something new, or something dealt with — maybe on
// another device) refreshes the server counts as well.
describe('ShellInboxProvider unread count', () => {
  const originalFetch = useBadgeCountsStore.getState().fetchBadgeCounts;
  const fetchBadgeCounts = jest.fn(async () => undefined);

  const settle = async (): Promise<void> => {
    await act(() => jest.advanceTimersByTime(BADGE_COUNTS_REFRESH_DELAY_MS));
  };

  beforeEach(() => {
    jest.useFakeTimers();
    fetchBadgeCounts.mockClear();
    mockInboxConfig.mockReturnValue({ ready: true, subscriberId: 'user-1', applicationIdentifier: 'app', apiUrl: 'https://novu.example.org', socketUrl: 'wss://novu.example.org' });
    useBadgeCountsStore.setState({ unreadNotifications: 0, fetchBadgeCounts });
  });

  afterEach(() => {
    mockInboxConfig.mockReturnValue({ ready: false, subscriberId: '', applicationIdentifier: '', apiUrl: '', socketUrl: '' });
    mockUnreadCount.mockReturnValue(0);
    useBadgeCountsStore.setState({ unreadNotifications: 0, fetchBadgeCounts: originalFetch });
    jest.useRealTimers();
  });

  it('keeps the first count as the baseline and refreshes the server counts when it rises or falls', async () => {
    mockUnreadCount.mockReturnValue(3);
    const view = await render(<ShellInboxProvider />);
    await settle();

    expect(useBadgeCountsStore.getState().unreadNotifications).toBe(3);
    expect(fetchBadgeCounts).not.toHaveBeenCalled();

    mockUnreadCount.mockReturnValue(5);
    await view.rerender(<ShellInboxProvider />);
    await settle();

    expect(useBadgeCountsStore.getState().unreadNotifications).toBe(5);
    expect(fetchBadgeCounts).toHaveBeenCalledTimes(1);

    mockUnreadCount.mockReturnValue(2);
    await view.rerender(<ShellInboxProvider />);
    await settle();

    expect(useBadgeCountsStore.getState().unreadNotifications).toBe(2);
    expect(fetchBadgeCounts).toHaveBeenCalledTimes(2);
    expect(fetchBadgeCounts).toHaveBeenLastCalledWith(undefined, { bypassCache: true });
  });
});
