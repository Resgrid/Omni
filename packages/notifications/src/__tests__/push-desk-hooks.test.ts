// The native push service's hooks for the Dispatch desk (dispatchers-on-duty plan D6): a push arriving in the foreground
// while alerts are held back goes to the list with no banner and no sound (a break push still alerts), and every token
// the server takes is handed to the subscribers that follow the registration (the desk's own subscriber).
import type { NotificationBehavior } from 'expo-notifications';

import { clearAlertSuppressorsForTests, registerAlertSuppressor } from '../alert-suppression';
import { pushNotificationService } from '../push-notification';
import { onPushTokenRegistered, resetPushTokenListenersForTests } from '../push-token-listeners';
import { configureForTest, flushAll, selectVariant } from './helpers';
import { mockSetAppActive } from './mocks/core';
import { mockSetIsDevice } from './mocks/expo-device';
import * as notifications from './mocks/expo-notifications';
import { mockRequest, mockResetNotifications } from './mocks/expo-notifications';
import { mockResetNotifee } from './mocks/notifee';

// SAFETY: jest.setup.ts mocks react-native with a writable Platform.OS, which is all these tests change.
const rn = jest.requireMock('react-native') as { Platform: { OS: string } };

interface ForegroundHandler {
  handleNotification: (notification: { request: ReturnType<typeof mockRequest> }) => Promise<NotificationBehavior>;
}

const foregroundHandler = (): ForegroundHandler => {
  const calls: unknown[][] = notifications.setNotificationHandler.mock.calls;

  // SAFETY: the mock records the one handler object the service passed to setNotificationHandler during initialize().
  return calls[0][0] as ForegroundHandler;
};

beforeEach(() => {
  rn.Platform.OS = 'android';
  selectVariant('dispatch');
  mockResetNotifications();
  mockResetNotifee();
  mockSetIsDevice(true);
  mockSetAppActive(true);
  pushNotificationService.resetForTests();
  clearAlertSuppressorsForTests();
  resetPushTokenListenersForTests();
  configureForTest();
});

afterAll(() => clearAlertSuppressorsForTests());

describe('desk hooks of the native push service', () => {
  it('presents a push quietly while alerts are held back, and a break push as usual', async () => {
    await pushNotificationService.initialize();
    await flushAll();
    registerAlertSuppressor('desk', (alert) => !(alert.eventCode ?? '').startsWith('DB:'));

    await expect(foregroundHandler().handleNotification({ request: mockRequest('p1', { eventCode: 'C:1' }) })).resolves.toEqual({
      shouldShowBanner: false,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: true,
    });
    await expect(foregroundHandler().handleNotification({ request: mockRequest('p2', { eventCode: 'DB:b-1' }) })).resolves.toMatchObject({ shouldShowBanner: true, shouldPlaySound: true });
  });

  it('hands each token the server took to the subscribers that follow the registration, and forgets it at sign-out', async () => {
    const heard = jest.fn();
    onPushTokenRegistered(heard);

    await pushNotificationService.registerForPushNotifications({ requestPermission: true });
    expect(heard).toHaveBeenCalledWith({ token: 'device-token', platform: 2 });

    await pushNotificationService.clearLocalState();
    const late = jest.fn();
    onPushTokenRegistered(late);
    expect(late).not.toHaveBeenCalled();
  });

  it('tells the followers again on a check that finds the device already registered, so a failed follower retries', async () => {
    const heard = jest.fn();
    onPushTokenRegistered(heard);

    await pushNotificationService.registerForPushNotifications({ requestPermission: true });
    heard.mockClear();

    // The foreground check: same token, same subject, nothing sent to the server again.
    await pushNotificationService.registerForPushNotifications({ requestPermission: false });
    expect(heard).toHaveBeenCalledWith({ token: 'device-token', platform: 2 });
  });
});
