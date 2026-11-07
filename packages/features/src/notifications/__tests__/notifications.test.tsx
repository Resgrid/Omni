import '../../status/__tests__/test-setup';

import { type NotificationTarget, usePushNotificationModalStore } from '@resgrid/notifications';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import { PushNotificationModal } from '../components/push-notification-modal';
import { inboxTargetOf, toInboxItem } from '../lib/inbox-item';
import NotificationsInboxScreen from '../screens/notifications-inbox';

// @resgrid/core's barrel pulls Sentry and Countly; the notification modules only need these from it.
jest.mock('@resgrid/core', () => ({
  ...jest.requireActual('@resgrid/core/utils/route-ids'),
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  routerPushWithRetry: jest.fn(async () => undefined),
}));

const mockOpenInboxItem = jest.fn(async (_item: unknown) => true);
const mockNavigate = jest.fn(async (_target: NotificationTarget) => true);
const mockResolveRoute = jest.fn((target: NotificationTarget) => (target.kind === 'call' ? `/call/${target.id}` : null));

// The real event-code parser and inbox target resolver (the safe-id rules under test); native push plumbing stubbed.
jest.mock('@resgrid/notifications', () => {
  const codes = jest.requireActual('@resgrid/notifications/event-codes');
  const novu = jest.requireActual('@resgrid/notifications/novu');
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories run before imports resolve
  const { create } = require('zustand');

  const store = create((set: (state: object) => void) => ({
    isOpen: false,
    notification: null,
    showNotificationModal: async (input: { eventCode: string; title?: string; body?: string }) =>
      set({ isOpen: true, notification: { ...codes.parseEventCode(input.eventCode), title: input.title, body: input.body, receivedAt: 0 } }),
    hideNotificationModal: () => set({ isOpen: false, notification: null }),
  }));

  return {
    ...codes,
    inboxItemTarget: novu.inboxItemTarget,
    usePushNotificationModalStore: store,
    openInboxItem: (item: unknown) => mockOpenInboxItem(item),
    navigateToNotificationTarget: (target: NotificationTarget) => mockNavigate(target),
    getNotificationsDependencies: () => ({ resolveRoute: mockResolveRoute, getApiContext: () => ({}) }),
  };
});

const mockRecordPushResponse = jest.fn();

jest.mock('@resgrid/api', () => ({ recordPushResponse: (...args: unknown[]) => mockRecordPushResponse(...args) }));

const mockUseNotifications = jest.fn();
const mockDeleteAll = jest.fn(async () => ({}));

jest.mock('@novu/react-native', () => ({ useNotifications: (...args: unknown[]) => mockUseNotifications(...args), useNovu: () => ({ notifications: { deleteAll: mockDeleteAll } }) }));

const q = { includeHiddenElements: true } as const;

/** While selecting, each row is a checkbox: whether it is ticked. */
const isChecked = (id: string): boolean => screen.getByTestId(`notification-row-${id}`).props.accessibilityState?.checked === true;

const novuItem = (id: string, eventCode: string | undefined, extra: Record<string, unknown> = {}) => ({
  id,
  subject: `Subject ${id}`,
  body: `Body ${id}`,
  isRead: false,
  createdAt: '2026-10-31T10:00:00Z',
  data: eventCode ? { eventCode, unit: 'E1' } : {},
  read: jest.fn(async () => ({})),
  delete: jest.fn(async () => ({})),
  ...extra,
});

beforeEach(() => {
  mockOpenInboxItem.mockClear();
  mockNavigate.mockClear();
  mockRecordPushResponse.mockReset();
  usePushNotificationModalStore.getState().hideNotificationModal();
});

describe('inbox items', () => {
  it('resolves safe targets and rejects unsafe ids', () => {
    expect(inboxTargetOf(toInboxItem(novuItem('1', 'C1234')))).toEqual(expect.objectContaining({ kind: 'call', id: '1234' }));
    expect(inboxTargetOf(toInboxItem(novuItem('2', 't:../settings')))).toBeNull();
    expect(inboxTargetOf(toInboxItem(novuItem('3', undefined)))).toBeNull();
  });
});

describe('NotificationsInboxScreen', () => {
  const setInbox = (items: ReturnType<typeof novuItem>[], options: { hasMore?: boolean } = {}) => {
    const inbox = {
      notifications: items,
      isLoading: false,
      isFetching: false,
      hasMore: options.hasMore ?? false,
      fetchMore: jest.fn(),
      refetch: jest.fn(async () => undefined),
      readAll: jest.fn(async () => ({})),
      error: undefined,
    };

    mockUseNotifications.mockReturnValue(inbox);

    return inbox;
  };

  beforeEach(() => {
    mockDeleteAll.mockClear();
  });

  it('opens an item with a safe target like a tapped push and marks it read', async () => {
    const call = novuItem('n1', 'C1234');
    setInbox([call]);
    await render(<NotificationsInboxScreen />);

    expect(screen.getByTestId('notification-row-n1-unread')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('notification-row-n1'));
    await waitFor(() => expect(mockOpenInboxItem).toHaveBeenCalledWith(expect.objectContaining({ id: 'n1', data: { eventCode: 'C1234', unit: 'E1' } })));
    expect(call.read).toHaveBeenCalled();
  });

  it('never navigates for an unsafe id: the detail sheet opens instead', async () => {
    setInbox([novuItem('n2', 'g:a/b?c')]);
    await render(<NotificationsInboxScreen />);

    await fireEvent.press(screen.getByTestId('notification-row-n2'));
    await waitFor(() => expect(screen.getByTestId('notification-detail-sheet', q)).toBeTruthy());
    expect(mockOpenInboxItem).not.toHaveBeenCalled();
    expect(screen.queryByTestId('notification-detail-open', q)).toBeNull();
    expect(screen.getByText('E1', q)).toBeTruthy();
  });

  it('waits for the Novu provider before rendering the inbox', async () => {
    await render(<NotificationsInboxScreen isReady={false} />);
    expect(screen.getByTestId('notifications-inbox-pending')).toBeTruthy();
  });

  it('explains when the inbox is unavailable instead of waiting for a provider', async () => {
    await render(<NotificationsInboxScreen isReady={false} isUnavailable />);
    expect(screen.getByTestId('notifications-inbox-unavailable')).toBeTruthy();
    expect(screen.queryByTestId('notifications-inbox-pending')).toBeNull();
  });

  it('a long press starts selecting; a press then toggles rows instead of opening them', async () => {
    const first = novuItem('n1', 'C1');
    const second = novuItem('n2', 'C2');
    setInbox([first, second]);
    await render(<NotificationsInboxScreen />);

    await fireEvent(screen.getByTestId('notification-row-n1'), 'longPress');
    expect(screen.getByTestId('notifications-selection-bar')).toBeTruthy();
    expect([isChecked('n1'), isChecked('n2')]).toEqual([true, false]);

    await fireEvent.press(screen.getByTestId('notification-row-n2'));
    expect([isChecked('n1'), isChecked('n2')]).toEqual([true, true]);
    expect(mockOpenInboxItem).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByTestId('notification-row-n1'));
    expect([isChecked('n1'), isChecked('n2')]).toEqual([false, true]);

    await fireEvent.press(screen.getByTestId('notifications-exit-selection'));
    expect(screen.queryByTestId('notifications-selection-bar')).toBeNull();
  });

  it('marks only the selected unread notifications read', async () => {
    const unread = novuItem('n1', 'C1');
    const read = novuItem('n2', 'C2', { isRead: true });
    const other = novuItem('n3', 'C3');
    setInbox([unread, read, other]);
    await render(<NotificationsInboxScreen />);

    await fireEvent.press(screen.getByTestId('notifications-select'));
    await fireEvent.press(screen.getByTestId('notification-row-n1'));
    await fireEvent.press(screen.getByTestId('notification-row-n2'));
    await fireEvent.press(screen.getByTestId('notifications-read-selected'));

    await waitFor(() => expect(screen.queryByTestId('notifications-selection-bar')).toBeNull());
    expect(unread.read).toHaveBeenCalledTimes(1);
    expect(read.read).not.toHaveBeenCalled();
    expect(other.read).not.toHaveBeenCalled();
  });

  it('deletes the selected notifications after confirming', async () => {
    const first = novuItem('n1', 'C1');
    const second = novuItem('n2', 'C2');
    const inbox = setInbox([first, second]);
    await render(<NotificationsInboxScreen />);

    await fireEvent(screen.getByTestId('notification-row-n2'), 'longPress');
    await fireEvent.press(screen.getByTestId('notifications-delete-selected'));
    expect(second.delete).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByTestId('notifications-confirm-delete-confirm', q));

    await waitFor(() => expect(second.delete).toHaveBeenCalledTimes(1));
    expect(first.delete).not.toHaveBeenCalled();
    expect(mockDeleteAll).not.toHaveBeenCalled();
    expect(inbox.refetch).toHaveBeenCalled();
  });

  it('select all deletes the whole inbox (pages not loaded yet included) and marks everything read in one call', async () => {
    const first = novuItem('n1', 'C1');
    const second = novuItem('n2', 'C2');
    const inbox = setInbox([first, second], { hasMore: true });
    await render(<NotificationsInboxScreen />);

    await fireEvent.press(screen.getByTestId('notifications-select'));
    await fireEvent.press(screen.getByTestId('notifications-select-all'));
    expect([isChecked('n1'), isChecked('n2')]).toEqual([true, true]);

    await fireEvent.press(screen.getByTestId('notifications-read-selected'));
    await waitFor(() => expect(inbox.readAll).toHaveBeenCalledTimes(1));
    expect(first.read).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByTestId('notifications-select'));
    await fireEvent.press(screen.getByTestId('notifications-select-all'));
    await fireEvent.press(screen.getByTestId('notifications-delete-selected'));
    await fireEvent.press(screen.getByTestId('notifications-confirm-delete-confirm', q));

    await waitFor(() => expect(mockDeleteAll).toHaveBeenCalledTimes(1));
    expect(first.delete).not.toHaveBeenCalled();
  });

  it('deselecting one row after select all falls back to deleting just the rest', async () => {
    const first = novuItem('n1', 'C1');
    const second = novuItem('n2', 'C2');
    setInbox([first, second]);
    await render(<NotificationsInboxScreen />);

    await fireEvent.press(screen.getByTestId('notifications-select'));
    await fireEvent.press(screen.getByTestId('notifications-select-all'));
    await fireEvent.press(screen.getByTestId('notification-row-n1'));
    await fireEvent.press(screen.getByTestId('notifications-delete-selected'));
    await fireEvent.press(screen.getByTestId('notifications-confirm-delete-confirm', q));

    await waitFor(() => expect(second.delete).toHaveBeenCalledTimes(1));
    expect(first.delete).not.toHaveBeenCalled();
    expect(mockDeleteAll).not.toHaveBeenCalled();
  });

  it('shows the empty state', async () => {
    setInbox([]);
    await render(<NotificationsInboxScreen />);
    expect(screen.getByTestId('notifications-empty')).toBeTruthy();
  });
});

describe('PushNotificationModal', () => {
  it('shows a call push with "View Call" and navigates through the variant resolver', async () => {
    await render(<PushNotificationModal />);
    await act(() => usePushNotificationModalStore.getState().showNotificationModal({ eventCode: 'C55', title: 'Structure Fire', body: '1 Main St' }));

    expect(screen.getByText('Structure Fire', q)).toBeTruthy();
    expect(screen.getByTestId('push-notification-type', q)).toHaveTextContent('push_notifications.types.call');
    await fireEvent.press(screen.getByTestId('push-notification-view', q));
    expect(mockNavigate).toHaveBeenCalledWith(expect.objectContaining({ kind: 'call', id: '55' }));
    expect(usePushNotificationModalStore.getState().isOpen).toBe(false);
  });

  it('hides "View" for a target the variant has no route for and for unsafe ids', async () => {
    await render(<PushNotificationModal />);
    await act(() => usePushNotificationModalStore.getState().showNotificationModal({ eventCode: 'M12', body: 'Weekly drill' }));
    expect(screen.queryByTestId('push-notification-view', q)).toBeNull();

    await act(() => usePushNotificationModalStore.getState().showNotificationModal({ eventCode: 't:../x', body: 'chat' }));
    expect(screen.queryByTestId('push-notification-view', q)).toBeNull();
  });

  it('confirms a communication test receipt and stays open on failure', async () => {
    mockRecordPushResponse.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({});
    await render(<PushNotificationModal />);
    await act(() => usePushNotificationModalStore.getState().showNotificationModal({ eventCode: 'CT:tok-1', body: 'Test' }));

    await fireEvent.press(screen.getByTestId('push-notification-confirm-receipt', q));
    await waitFor(() => expect(mockRecordPushResponse).toHaveBeenCalledWith({}, { ResponseToken: 'tok-1' }));
    expect(usePushNotificationModalStore.getState().isOpen).toBe(true);

    await fireEvent.press(screen.getByTestId('push-notification-confirm-receipt', q));
    await waitFor(() => expect(usePushNotificationModalStore.getState().isOpen).toBe(false));
  });

  it('dismisses', async () => {
    await render(<PushNotificationModal />);
    await act(() => usePushNotificationModalStore.getState().showNotificationModal({ eventCode: 'N9', body: 'Hello' }));
    await fireEvent.press(screen.getByTestId('push-notification-dismiss', q));
    expect(usePushNotificationModalStore.getState().isOpen).toBe(false);
  });
});
