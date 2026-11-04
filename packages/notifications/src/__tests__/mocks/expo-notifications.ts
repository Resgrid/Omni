// Stand-in for expo-notifications: records listeners so tests can deliver receipts and taps, and keeps the scheduled and
// presented (delivered) notifications as the OS would.
import type { NotificationContentInput } from 'expo-notifications';

type Listener<T> = (event: T) => void;

export interface MockScheduledRequest {
  identifier: string;
  content: NotificationContentInput;
  trigger: { type: string; date: number; channelId?: string };
}

export const mockNotificationState = {
  received: new Set<Listener<unknown>>(),
  responses: new Set<Listener<unknown>>(),
  lastResponse: null as unknown,
  permission: 'granted' as 'granted' | 'denied' | 'undetermined',
  requestedPermission: 'granted' as 'granted' | 'denied' | 'undetermined',
  token: 'device-token' as unknown,
  calls: [] as string[],
  scheduled: new Map<string, MockScheduledRequest>(),
  presented: new Map<string, MockScheduledRequest>(),
  /** Every schedule/cancel/dismiss, in order (`schedule:<id>`, `cancel:<id>`, `dismiss:<id>`). */
  scheduling: new Array<string>(),
  /** Android exact alarms: allowed now, and what the system settings screen leaves it at. */
  exactAlarms: true,
  exactAlarmsAfterSettings: true,
};

export const SchedulableTriggerInputTypes = { DATE: 'date', TIME_INTERVAL: 'timeInterval', DAILY: 'daily', WEEKLY: 'weekly', MONTHLY: 'monthly', YEARLY: 'yearly', CALENDAR: 'calendar' };
export const AndroidNotificationPriority = { MIN: 'min', LOW: 'low', DEFAULT: 'default', HIGH: 'high', MAX: 'max' };

export const scheduleNotificationAsync = jest.fn(async (request: MockScheduledRequest) => {
  mockNotificationState.scheduling.push(`schedule:${request.identifier}`);
  mockNotificationState.scheduled.set(request.identifier, request);

  return request.identifier;
});

export const cancelScheduledNotificationAsync = jest.fn(async (identifier: string) => {
  mockNotificationState.scheduling.push(`cancel:${identifier}`);
  mockNotificationState.scheduled.delete(identifier);
});

export const cancelAllScheduledNotificationsAsync = jest.fn(async () => {
  mockNotificationState.scheduled.clear();
});

export const getAllScheduledNotificationsAsync = jest.fn(async () => [...mockNotificationState.scheduled.values()]);
export const getPresentedNotificationsAsync = jest.fn(async () => [...mockNotificationState.presented.values()].map((request) => ({ date: request.trigger.date, request })));

export const dismissNotificationAsync = jest.fn(async (identifier: string) => {
  mockNotificationState.scheduling.push(`dismiss:${identifier}`);
  mockNotificationState.presented.delete(identifier);
});

/** The OS shows a scheduled notification: it moves from scheduled to presented. */
export const mockFireScheduled = (identifier: string): void => {
  const request = mockNotificationState.scheduled.get(identifier);

  if (!request) throw new Error(`Nothing scheduled as ${identifier}`);
  mockNotificationState.scheduled.delete(identifier);
  mockNotificationState.presented.set(identifier, request);
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

export const getExactAlarmPermissionsAsync = jest.fn(async () => ({ granted: mockNotificationState.exactAlarms }));

export const requestExactAlarmPermissionsAsync = jest.fn(async () => {
  mockNotificationState.exactAlarms = mockNotificationState.exactAlarmsAfterSettings;

  return { granted: mockNotificationState.exactAlarms };
});

export const requestPermissionsAsync = jest.fn(async (_options?: unknown) => {
  mockNotificationState.permission = mockNotificationState.requestedPermission;

  return { status: mockNotificationState.requestedPermission };
});

export const getDevicePushTokenAsync = jest.fn(async () => ({ type: 'ios', data: mockNotificationState.token }));
export const setBadgeCountAsync = jest.fn(async (_count: number) => true);

export const dismissAllNotificationsAsync = jest.fn(async () => {
  mockNotificationState.presented.clear();
});

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
  mockNotificationState.scheduled.clear();
  mockNotificationState.presented.clear();
  mockNotificationState.scheduling = new Array<string>();
  mockNotificationState.exactAlarms = true;
  mockNotificationState.exactAlarmsAfterSettings = true;
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
