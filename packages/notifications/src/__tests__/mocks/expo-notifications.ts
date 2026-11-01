// Stand-in for expo-notifications: records listeners so tests can deliver receipts and taps.
type Listener<T> = (event: T) => void;

export const mockNotificationState = {
  received: new Set<Listener<unknown>>(),
  responses: new Set<Listener<unknown>>(),
  lastResponse: null as unknown,
  permission: 'granted' as 'granted' | 'denied' | 'undetermined',
  requestedPermission: 'granted' as 'granted' | 'denied' | 'undetermined',
  token: 'device-token' as unknown,
  calls: [] as string[],
};

export const DEFAULT_ACTION_IDENTIFIER = 'expo.modules.notifications.actions.DEFAULT';

export const setNotificationHandler = jest.fn(() => {
  mockNotificationState.calls.push('setNotificationHandler');
});

export const addNotificationReceivedListener = jest.fn((listener: Listener<unknown>) => {
  mockNotificationState.calls.push('addNotificationReceivedListener');
  mockNotificationState.received.add(listener);
  return { remove: () => mockNotificationState.received.delete(listener) };
});

export const addNotificationResponseReceivedListener = jest.fn((listener: Listener<unknown>) => {
  mockNotificationState.calls.push('addNotificationResponseReceivedListener');
  mockNotificationState.responses.add(listener);
  return { remove: () => mockNotificationState.responses.delete(listener) };
});

export const getLastNotificationResponseAsync = jest.fn(async () => {
  mockNotificationState.calls.push('getLastNotificationResponseAsync');
  return mockNotificationState.lastResponse;
});

export const getPermissionsAsync = jest.fn(async () => ({ status: mockNotificationState.permission }));
export const requestPermissionsAsync = jest.fn(async (_options?: unknown) => {
  mockNotificationState.permission = mockNotificationState.requestedPermission;
  return { status: mockNotificationState.requestedPermission };
});
export const getDevicePushTokenAsync = jest.fn(async () => ({ type: 'ios', data: mockNotificationState.token }));
export const setBadgeCountAsync = jest.fn(async (_count: number) => true);
export const dismissAllNotificationsAsync = jest.fn(async () => undefined);

/** Delivers a foreground receipt to every listener. */
export const mockDeliverNotification = (notification: unknown): void => {
  mockNotificationState.received.forEach((listener) => listener(notification));
};

/** Delivers a tap to every response listener. */
export const mockDeliverResponse = (response: unknown): void => {
  mockNotificationState.responses.forEach((listener) => listener(response));
};

export const mockResetNotifications = (): void => {
  mockNotificationState.received.clear();
  mockNotificationState.responses.clear();
  mockNotificationState.lastResponse = null;
  mockNotificationState.permission = 'granted';
  mockNotificationState.requestedPermission = 'granted';
  mockNotificationState.token = 'device-token';
  mockNotificationState.calls = [];
};

/** A notification request/response the way expo-notifications hands it over. */
export const mockRequest = (identifier: string, data: Record<string, unknown> | undefined, extra: { title?: string; body?: string; trigger?: unknown } = {}) => ({
  identifier,
  content: { title: extra.title ?? null, body: extra.body ?? null, data: data ?? {} },
  trigger: extra.trigger ?? null,
});

export const mockResponse = (identifier: string, data: Record<string, unknown> | undefined, extra: { title?: string; body?: string; trigger?: unknown; actionIdentifier?: string } = {}) => ({
  actionIdentifier: extra.actionIdentifier ?? DEFAULT_ACTION_IDENTIFIER,
  notification: { date: 0, request: mockRequest(identifier, data, extra) },
});
