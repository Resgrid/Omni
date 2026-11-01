// Desktop toasts for SignalR-driven notices, ported from Dispatch's electron-notification tests and adapted to the
// Omni preload bridge (window.electronNotifications / window.electronAPI) and the push modal.
import { getElectronNotificationsBridge, initializeDesktopNotifications, resetDesktopNotificationsForTests, showDesktopNotification } from '../desktop-notifications';
import { usePushNotificationModalStore } from '../push-modal-store';
import { configureForTest, flushAll, selectVariant, type TestContext } from './helpers';

const rn = jest.requireMock('react-native') as { Platform: { OS: string } };
const globals = globalThis as unknown as Record<string, unknown>;

let ctx: TestContext;
let clicked: ((data: unknown) => void) | undefined;
let bridge: { show: jest.Mock; isSupported: jest.Mock; onNotificationClicked: jest.Mock };
let webNotifications: { title: string; options: Record<string, unknown>; onclick?: () => void }[];
let permission: NotificationPermission;

const modal = () => usePushNotificationModalStore.getState();

function installWebNotification(): void {
  webNotifications = [];
  permission = 'granted';
  const MockNotification = function (this: { onclick?: () => void }, title: string, options: Record<string, unknown>) {
    webNotifications.push(Object.assign(this, { title, options }));
  } as unknown as { permission: NotificationPermission; requestPermission: () => Promise<NotificationPermission> };
  Object.defineProperty(MockNotification, 'permission', { get: () => permission });
  MockNotification.requestPermission = jest.fn(async () => permission);
  globals.Notification = MockNotification;
}

beforeEach(() => {
  rn.Platform.OS = 'web';
  selectVariant('dispatch');
  ctx = configureForTest();
  resetDesktopNotificationsForTests();
  usePushNotificationModalStore.setState({ isOpen: false, notification: null });
  globals.window = globalThis;
  globals.focus = jest.fn();
  installWebNotification();
  clicked = undefined;
  bridge = {
    show: jest.fn(async () => true),
    isSupported: jest.fn(async () => true),
    onNotificationClicked: jest.fn((callback: (data: unknown) => void) => {
      clicked = callback;
      return () => undefined;
    }),
  };
  globals.__ELECTRON__ = true;
  globals.electronNotifications = bridge;
  globals.electronAPI = undefined;
});

describe('bridge detection', () => {
  it('finds window.electronNotifications in the desktop shell', () => {
    expect(getElectronNotificationsBridge()?.show).toBe(bridge.show);
  });

  it("falls back to Unit's names on window.electronAPI", () => {
    globals.electronNotifications = undefined;
    const showNotification = jest.fn(async () => true);
    globals.electronAPI = { isElectron: true, showNotification, onNotificationClicked: jest.fn(() => () => undefined) };
    expect(getElectronNotificationsBridge()?.show).toBe(showNotification);
  });

  it('finds nothing in a plain browser', () => {
    globals.__ELECTRON__ = undefined;
    globals.electronNotifications = undefined;
    expect(getElectronNotificationsBridge()).toBeNull();
  });
});

describe('showDesktopNotification', () => {
  it('shows a native notification through the bridge with the event code in its data', async () => {
    await expect(showDesktopNotification({ title: 'Unit status', body: 'E1 is responding', eventCode: 'C:12' })).resolves.toBe(true);
    expect(bridge.show).toHaveBeenCalledWith({ title: 'Unit status', body: 'E1 is responding', data: { title: 'Unit status', body: 'E1 is responding', eventCode: 'C:12' } });
    expect(webNotifications).toHaveLength(0);
  });

  it('also raises the in-app alert for an event code, unless told not to', async () => {
    await showDesktopNotification({ title: 'Call', body: 'Fire', eventCode: 'C:12' });
    await flushAll();
    expect(modal().notification).toMatchObject({ kind: 'call', title: 'Call' });

    usePushNotificationModalStore.setState({ isOpen: false, notification: null });
    await showDesktopNotification({ title: 'Call', body: 'Fire', eventCode: 'C:13', showInApp: false });
    await flushAll();
    expect(modal().isOpen).toBe(false);
  });

  it('falls back to a web notification when the bridge fails', async () => {
    bridge.show.mockRejectedValueOnce(new Error('ipc'));
    await expect(showDesktopNotification({ title: 'T', body: 'B' })).resolves.toBe(true);
    expect(webNotifications).toEqual([expect.objectContaining({ title: 'T', options: expect.objectContaining({ body: 'B' }) })]);
  });

  it('uses the web notification in a browser and opens its target on click', async () => {
    globals.__ELECTRON__ = undefined;
    globals.electronNotifications = undefined;
    await showDesktopNotification({ title: 'Chat', body: 'Hi', eventCode: 't:abc', showInApp: false });
    webNotifications[0].onclick?.();
    await flushAll();
    expect(globals.focus).toHaveBeenCalled();
    expect(ctx.resolveRoute).toHaveBeenCalledWith({ kind: 'chat', id: 'abc', chatType: 'direct' });
  });

  it('shows nothing without permission in a browser', async () => {
    globals.__ELECTRON__ = undefined;
    globals.electronNotifications = undefined;
    permission = 'denied';
    await expect(showDesktopNotification({ title: 'T', body: 'B' })).resolves.toBe(false);
  });

  it('does nothing on native platforms', async () => {
    rn.Platform.OS = 'ios';
    await expect(showDesktopNotification({ title: 'T', body: 'B', eventCode: 'C:1' })).resolves.toBe(false);
    expect(bridge.show).not.toHaveBeenCalled();
  });
});

describe('initializeDesktopNotifications', () => {
  it('routes a clicked native notification to its target, once wired', async () => {
    await initializeDesktopNotifications();
    await initializeDesktopNotifications();
    expect(bridge.onNotificationClicked).toHaveBeenCalledTimes(1);
    clicked?.({ eventCode: 'NWO:4', title: 'Work order' });
    await flushAll();
    expect(ctx.resolveRoute).toHaveBeenCalledWith({ kind: 'workOrder', id: '4' });
  });

  it('ignores a click without an event code or with an unsafe id', async () => {
    await initializeDesktopNotifications();
    clicked?.(null);
    clicked?.({ title: 'x' });
    clicked?.({ eventCode: 'C:../x' });
    await flushAll();
    expect(ctx.resolveRoute).not.toHaveBeenCalled();
  });

  it('asks for web notification permission in a browser', async () => {
    globals.__ELECTRON__ = undefined;
    globals.electronNotifications = undefined;
    permission = 'default';
    await initializeDesktopNotifications();
    expect((globals.Notification as { requestPermission: jest.Mock }).requestPermission).toHaveBeenCalled();
  });
});
