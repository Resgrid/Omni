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
jest.mock('@novu/react-native', () => ({ useNotifications: (...args: unknown[]) => mockUseNotifications(...args) }));

const q = { includeHiddenElements: true } as const;

const novuItem = (id: string, eventCode: string | undefined, extra: Record<string, unknown> = {}) => ({
  id,
  subject: `Subject ${id}`,
  body: `Body ${id}`,
  isRead: false,
  createdAt: '2026-10-31T10:00:00Z',
  data: eventCode ? { eventCode, unit: 'E1' } : {},
  read: jest.fn(async () => undefined),
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
  const setInbox = (items: ReturnType<typeof novuItem>[]) =>
    mockUseNotifications.mockReturnValue({ notifications: items, isLoading: false, isFetching: false, hasMore: false, fetchMore: jest.fn(), refetch: jest.fn(), readAll: jest.fn(async () => ({})), error: undefined });

  it('opens an item with a safe target like a tapped push and marks it read', async () => {
    const call = novuItem('n1', 'C1234');
    setInbox([call]);
    render(<NotificationsInboxScreen />);

    expect(screen.getByTestId('notification-row-n1-unread')).toBeTruthy();
    fireEvent.press(screen.getByTestId('notification-row-n1'));
    await waitFor(() => expect(mockOpenInboxItem).toHaveBeenCalledWith(expect.objectContaining({ id: 'n1', data: { eventCode: 'C1234', unit: 'E1' } })));
    expect(call.read).toHaveBeenCalled();
  });

  it('never navigates for an unsafe id: the detail sheet opens instead', async () => {
    setInbox([novuItem('n2', 'g:a/b?c')]);
    render(<NotificationsInboxScreen />);

    fireEvent.press(screen.getByTestId('notification-row-n2'));
    await waitFor(() => expect(screen.getByTestId('notification-detail-sheet', q)).toBeTruthy());
    expect(mockOpenInboxItem).not.toHaveBeenCalled();
    expect(screen.queryByTestId('notification-detail-open', q)).toBeNull();
    expect(screen.getByText('E1', q)).toBeTruthy();
  });

  it('waits for the Novu provider before rendering the inbox', () => {
    render(<NotificationsInboxScreen isReady={false} />);
    expect(screen.getByTestId('notifications-inbox-pending')).toBeTruthy();
  });

  it('shows the empty state', () => {
    setInbox([]);
    render(<NotificationsInboxScreen />);
    expect(screen.getByTestId('notifications-empty')).toBeTruthy();
  });
});

describe('PushNotificationModal', () => {
  it('shows a call push with "View Call" and navigates through the variant resolver', async () => {
    render(<PushNotificationModal />);
    await act(() => usePushNotificationModalStore.getState().showNotificationModal({ eventCode: 'C55', title: 'Structure Fire', body: '1 Main St' }));

    expect(screen.getByText('Structure Fire', q)).toBeTruthy();
    expect(screen.getByTestId('push-notification-type', q)).toHaveTextContent('push_notifications.types.call');
    fireEvent.press(screen.getByTestId('push-notification-view', q));
    expect(mockNavigate).toHaveBeenCalledWith(expect.objectContaining({ kind: 'call', id: '55' }));
    expect(usePushNotificationModalStore.getState().isOpen).toBe(false);
  });

  it('hides "View" for a target the variant has no route for and for unsafe ids', async () => {
    render(<PushNotificationModal />);
    await act(() => usePushNotificationModalStore.getState().showNotificationModal({ eventCode: 'M12', body: 'Weekly drill' }));
    expect(screen.queryByTestId('push-notification-view', q)).toBeNull();

    await act(() => usePushNotificationModalStore.getState().showNotificationModal({ eventCode: 't:../x', body: 'chat' }));
    expect(screen.queryByTestId('push-notification-view', q)).toBeNull();
  });

  it('confirms a communication test receipt and stays open on failure', async () => {
    mockRecordPushResponse.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({});
    render(<PushNotificationModal />);
    await act(() => usePushNotificationModalStore.getState().showNotificationModal({ eventCode: 'CT:tok-1', body: 'Test' }));

    fireEvent.press(screen.getByTestId('push-notification-confirm-receipt', q));
    await waitFor(() => expect(mockRecordPushResponse).toHaveBeenCalledWith({}, { ResponseToken: 'tok-1' }));
    expect(usePushNotificationModalStore.getState().isOpen).toBe(true);

    fireEvent.press(screen.getByTestId('push-notification-confirm-receipt', q));
    await waitFor(() => expect(usePushNotificationModalStore.getState().isOpen).toBe(false));
  });

  it('dismisses', async () => {
    render(<PushNotificationModal />);
    await act(() => usePushNotificationModalStore.getState().showNotificationModal({ eventCode: 'N9', body: 'Hello' }));
    fireEvent.press(screen.getByTestId('push-notification-dismiss', q));
    expect(usePushNotificationModalStore.getState().isOpen).toBe(false);
  });
});
