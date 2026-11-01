// Deep-link resolution: the injected resolver decides the route, navigation waits on the router and the session, and
// anything that does not land shows the push modal.
import { getNotificationsDependencies, resetNotificationsConfigurationForTests } from '../configure';
import { DEEP_LINK_MAX_ATTEMPTS, DEEP_LINK_RETRY_DELAY_MS, navigateToNotificationTarget, openNotification } from '../deep-links';
import { usePushNotificationModalStore } from '../push-modal-store';
import { configureForTest, selectVariant, type TestContext } from './helpers';
import { routerPushWithRetry } from './mocks/core';

let ctx: TestContext;

beforeEach(() => {
  selectVariant('responder');
  ctx = configureForTest();
  usePushNotificationModalStore.setState({ isOpen: false, notification: null });
  routerPushWithRetry.mockImplementation(async () => undefined);
});

describe('navigateToNotificationTarget', () => {
  it('pushes the resolved route with the 40 × 250 ms budget gated on the session', async () => {
    await expect(navigateToNotificationTarget({ kind: 'call', id: '5' })).resolves.toBe(true);
    expect(routerPushWithRetry).toHaveBeenCalledWith('/call/5', expect.objectContaining({ maxAttempts: DEEP_LINK_MAX_ATTEMPTS, retryDelayMs: DEEP_LINK_RETRY_DELAY_MS }));
    expect([DEEP_LINK_MAX_ATTEMPTS, DEEP_LINK_RETRY_DELAY_MS]).toEqual([40, 250]);
  });

  it('treats a throwing session check as not signed in', async () => {
    configureForTest({
      isSignedIn: () => {
        throw new Error('not hydrated');
      },
    });
    await navigateToNotificationTarget({ kind: 'call', id: '5' });
    const options = routerPushWithRetry.mock.calls[0][1] as { waitUntil: () => boolean };
    expect(options.waitUntil()).toBe(false);
  });

  it('does not navigate when the variant has no route, no resolver or a failing resolver', async () => {
    ctx.resolveRoute.mockReturnValueOnce(null);
    await expect(navigateToNotificationTarget({ kind: 'workOrder', id: '1' })).resolves.toBe(false);
    ctx.resolveRoute.mockImplementationOnce(() => {
      throw new Error('bad');
    });
    await expect(navigateToNotificationTarget({ kind: 'workOrder', id: '1' })).resolves.toBe(false);
    configureForTest({ resolveRoute: undefined });
    await expect(navigateToNotificationTarget({ kind: 'call', id: '1' })).resolves.toBe(false);
    resetNotificationsConfigurationForTests();
    await expect(navigateToNotificationTarget({ kind: 'call', id: '1' })).resolves.toBe(false);
    expect(routerPushWithRetry).not.toHaveBeenCalled();
  });

  it('resolves false when the navigation never lands', async () => {
    routerPushWithRetry.mockRejectedValueOnce(new Error('never ready'));
    await expect(navigateToNotificationTarget({ kind: 'call', id: '5' })).resolves.toBe(false);
  });
});

describe('openNotification', () => {
  it('navigates and leaves the modal closed', async () => {
    await expect(openNotification({ eventCode: 'g:7' })).resolves.toBe(true);
    expect(usePushNotificationModalStore.getState().isOpen).toBe(false);
  });

  it('shows the modal when nothing routes, unless told not to', async () => {
    ctx.resolveRoute.mockReturnValue(null);
    await expect(openNotification({ eventCode: 'N:1', title: 'Hello' })).resolves.toBe(false);
    expect(usePushNotificationModalStore.getState().notification).toMatchObject({ title: 'Hello' });
    usePushNotificationModalStore.setState({ isOpen: false, notification: null });
    await openNotification({ eventCode: 'N:1' }, { fallbackToModal: false });
    expect(usePushNotificationModalStore.getState().isOpen).toBe(false);
  });

  it('ignores a notification without an event code', async () => {
    await expect(openNotification({ eventCode: '' })).resolves.toBe(false);
    expect(usePushNotificationModalStore.getState().isOpen).toBe(false);
  });
});

describe('configuration', () => {
  it('throws a clear error when the shell never configured the package', () => {
    resetNotificationsConfigurationForTests();
    expect(() => getNotificationsDependencies()).toThrow(/configureNotifications/);
  });
});
