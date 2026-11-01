// Native push service: startup order, channels and categories, foreground receipts, taps and deep links, the
// cold-start dedupe, notifee events and the check-in action. Ported from Unit's push-notification tests (integration,
// cold-start dedupe, tap deep-linking, notifee press events, listener lifecycle, channels) and Responder's
// channel/deep-link tests, adapted to the injected resolver.
import { ANDROID_CHANNELS, CHECK_IN_ACTION_ID } from '../channels';
import { usePushNotificationModalStore } from '../push-modal-store';
import { HANDLED_RESPONSE_LIMIT, pushNotificationService } from '../push-notification';
import { configureForTest, flushAll, selectVariant, type TestContext } from './helpers';
import { routerPushWithRetry } from './mocks/core';
import * as audio from './mocks/expo-audio';
import { mockDeliverNotification, mockDeliverResponse, mockNotificationState, mockRequest, mockResetNotifications, mockResponse } from './mocks/expo-notifications';
import * as notifications from './mocks/expo-notifications';
import { EventType, mockNotifeeState, mockResetNotifee } from './mocks/notifee';

const rn = jest.requireMock('react-native') as { Platform: { OS: string } };

let ctx: TestContext;

const modal = () => usePushNotificationModalStore.getState();

async function initialize(): Promise<void> {
  await pushNotificationService.initialize();
  await flushAll();
}

beforeEach(() => {
  rn.Platform.OS = 'ios';
  selectVariant('unit');
  mockResetNotifications();
  mockResetNotifee();
  pushNotificationService.resetForTests();
  usePushNotificationModalStore.setState({ isOpen: false, notification: null });
  routerPushWithRetry.mockImplementation(async () => undefined);
  ctx = configureForTest();
});

describe('startup', () => {
  it('registers listeners first, then replays the launch tap, then sets up channels (Android)', async () => {
    rn.Platform.OS = 'android';
    await initialize();
    const order = [...mockNotificationState.calls, ...mockNotifeeState.calls];
    expect(mockNotificationState.calls.slice(0, 4)).toEqual(['setNotificationHandler', 'addNotificationReceivedListener', 'addNotificationResponseReceivedListener', 'getLastNotificationResponseAsync']);
    expect(order).toContain('createChannels');
    // The cold-start read happens before any channel work.
    expect(notifications.getLastNotificationResponseAsync.mock.invocationCallOrder[0]).toBeLessThan(jest.requireMock('@notifee/react-native').default.getChannels.mock.invocationCallOrder[0]);
  });

  it('initializes once and does nothing on web', async () => {
    await initialize();
    await initialize();
    expect(notifications.addNotificationReceivedListener).toHaveBeenCalledTimes(1);

    pushNotificationService.resetForTests();
    rn.Platform.OS = 'web';
    notifications.addNotificationReceivedListener.mockClear();
    await initialize();
    expect(notifications.addNotificationReceivedListener).not.toHaveBeenCalled();
  });

  it('presents foreground pushes with banner, list, sound and badge', async () => {
    await initialize();
    const handler = (notifications.setNotificationHandler.mock.calls[0] as unknown as [{ handleNotification: () => Promise<unknown> }])[0];
    await expect(handler.handleNotification()).resolves.toEqual({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: true });
  });

  it('removes every listener on cleanup, and cleanup is safe to repeat', async () => {
    await initialize();
    expect(mockNotificationState.received.size).toBe(1);
    expect(mockNotifeeState.foreground.size).toBe(1);
    pushNotificationService.cleanup();
    pushNotificationService.cleanup();
    expect(mockNotificationState.received.size).toBe(0);
    expect(mockNotificationState.responses.size).toBe(0);
    expect(mockNotifeeState.foreground.size).toBe(0);
  });
});

describe('Android channels', () => {
  beforeEach(() => {
    rn.Platform.OS = 'android';
  });

  it('creates every channel with its modern sound in one call', async () => {
    await initialize();
    expect(mockNotifeeState.channels.map((channel) => channel.id)).toEqual(ANDROID_CHANNELS.map((channel) => channel.id));
    for (const created of mockNotifeeState.channels) {
      expect(created.sound).toBe(ANDROID_CHANNELS.find((channel) => channel.id === created.id)?.sound);
    }
    const emergency = mockNotifeeState.channels.find((channel) => channel.id === '7');
    expect(emergency?.name).toBe('Emergency Call');
    expect(mockNotifeeState.channels.find((channel) => channel.id === 'c3')?.name).toBe('Custom Call Tone 3');
  });

  it('recreates channels a legacy build created with a classic or default sound, and leaves matching ones alone', async () => {
    mockNotifeeState.existingChannels = [
      { id: '0', sound: 'callemergency', blocked: false },
      { id: 'calls', sound: 'default', blocked: false },
      { id: '1', sound: 'moderncallhigh', blocked: false },
      { id: 'c1', sound: 'c1', blocked: false },
    ];
    await initialize();
    expect(mockNotifeeState.deleted.sort()).toEqual(['0', 'calls']);
  });

  it('keeps going when channel setup fails', async () => {
    const notifee = jest.requireMock('@notifee/react-native').default as { createChannels: jest.Mock };
    notifee.createChannels.mockRejectedValueOnce(new Error('boom'));
    await expect(initialize()).resolves.toBeUndefined();
  });

  it('creates no iOS categories on Android', async () => {
    await initialize();
    expect(mockNotifeeState.categories).toEqual([]);
  });
});

describe('iOS categories', () => {
  it('registers calls, messages, notifications and chats with the check-in action for Unit', async () => {
    await initialize();
    expect(mockNotifeeState.categories.map((category) => category.id)).toEqual(['calls', 'messages', 'notifications', 'chats']);
    expect(mockNotifeeState.categories[0].actions?.map((action) => action.id)).toEqual(['view', CHECK_IN_ACTION_ID]);
    expect(mockNotifeeState.channels).toEqual([]);
  });

  it('leaves the check-in action out for a variant without check-in actions (IC)', async () => {
    selectVariant('ic');
    await initialize();
    expect(mockNotifeeState.categories.map((category) => category.id)).toEqual(['calls', 'messages', 'notifications', 'chats']);
    expect(mockNotifeeState.categories[0].actions?.map((action) => action.id)).toEqual(['view']);
  });
});

describe('foreground receipts', () => {
  beforeEach(async () => {
    await initialize();
  });

  it.each([
    ['C:1234', 'call'],
    ['M:5678', 'message'],
    ['t:9012', 'chat'],
    ['g:3456', 'chat'],
    ['NWO:1', 'workOrder'],
  ])('shows the modal for %s', async (eventCode, kind) => {
    mockDeliverNotification({ request: mockRequest('r1', { eventCode }, { title: 'Title', body: 'Body' }) });
    await flushAll();
    expect(modal().isOpen).toBe(true);
    expect(modal().notification).toMatchObject({ eventCode, kind, title: 'Title', body: 'Body' });
  });

  it('keeps extra data fields', async () => {
    mockDeliverNotification({ request: mockRequest('r1', { eventCode: 'C1', type: '7', customField: 'x' }) });
    await flushAll();
    expect(modal().notification?.data).toEqual({ eventCode: 'C1', type: '7', customField: 'x' });
    expect(modal().notification?.title).toBeUndefined();
  });

  it.each([{}, { eventCode: '' }, { eventCode: 123 }, undefined])('shows nothing for %p', async (data) => {
    mockDeliverNotification({ request: mockRequest('r1', data as Record<string, unknown> | undefined) });
    await flushAll();
    expect(modal().isOpen).toBe(false);
  });

  it('reads an iOS push whose event code is only on the raw payload', async () => {
    mockDeliverNotification({ request: mockRequest('r1', {}, { trigger: { type: 'push', payload: { body: { eventCode: 'N:5' } } } }) });
    await flushAll();
    expect(modal().notification?.kind).toBe('notification');
  });

  it('never plays an in-app sound over the OS notification sound', async () => {
    mockDeliverNotification({ request: mockRequest('r1', { eventCode: 'C1' }) });
    await flushAll();
    expect(audio.createAudioPlayer).not.toHaveBeenCalled();
  });
});

describe('taps', () => {
  beforeEach(async () => {
    await initialize();
  });

  it('deep-links a call tap through the variant resolver, waiting for the signed-in session', async () => {
    mockDeliverResponse(mockResponse('r1', { eventCode: 'C:1234' }));
    await flushAll();
    expect(ctx.resolveRoute).toHaveBeenCalledWith({ kind: 'call', id: '1234' });
    expect(routerPushWithRetry).toHaveBeenCalledWith('/call/1234', expect.objectContaining({ maxAttempts: 40, retryDelayMs: 250 }));
    const options = routerPushWithRetry.mock.calls[0][1] as { waitUntil: () => boolean };
    expect(options.waitUntil()).toBe(true);
    ctx.state.signedIn = false;
    expect(options.waitUntil()).toBe(false);
    expect(modal().isOpen).toBe(false);
  });

  it.each([
    ['t:abc', { kind: 'chat', id: 'abc', chatType: 'direct' }],
    ['g:abc', { kind: 'chat', id: 'abc', chatType: 'group' }],
    ['NC:9', { kind: 'call', id: '9', closed: true }],
    ['W:4', { kind: 'weatherAlert', id: '4' }],
    ['NWO:3', { kind: 'workOrder', id: '3' }],
    ['NA:req', { kind: 'signInApproval', id: 'req' }],
    ['CT:tok', { kind: 'communicationTest', id: 'tok' }],
    ['M7', { kind: 'message', id: '7' }],
  ])('resolves %s to its typed target', async (eventCode, target) => {
    mockDeliverResponse(mockResponse(`r-${eventCode}`, { eventCode }));
    await flushAll();
    expect(ctx.resolveRoute).toHaveBeenCalledWith(target);
  });

  it('falls back to the modal when the variant has no route for the target', async () => {
    ctx.resolveRoute.mockReturnValueOnce(null);
    mockDeliverResponse(mockResponse('r1', { eventCode: 'M:5' }, { title: 'New message' }));
    await flushAll();
    expect(routerPushWithRetry).not.toHaveBeenCalled();
    expect(modal().notification).toMatchObject({ kind: 'message', title: 'New message' });
  });

  it('falls back to the modal when the id is not a safe route id', async () => {
    mockDeliverResponse(mockResponse('r1', { eventCode: 'C:../settings' }));
    await flushAll();
    expect(ctx.resolveRoute).not.toHaveBeenCalled();
    expect(routerPushWithRetry).not.toHaveBeenCalled();
    expect(modal().isOpen).toBe(true);
    expect(modal().notification?.target).toBeNull();
  });

  it('falls back to the modal when the deep link never lands', async () => {
    routerPushWithRetry.mockRejectedValueOnce(new Error('never ready'));
    mockDeliverResponse(mockResponse('r1', { eventCode: 't:abc' }));
    await flushAll();
    expect(modal().notification?.kind).toBe('chat');
  });

  it('routes an iOS tap whose event code is only on the raw trigger payload', async () => {
    mockDeliverResponse(mockResponse('r1', {}, { trigger: { payload: { aps: { eventCode: 'C55' } } } }));
    await flushAll();
    expect(ctx.resolveRoute).toHaveBeenCalledWith({ kind: 'call', id: '55' });
  });

  it('ignores a tap without an event code', async () => {
    mockDeliverResponse(mockResponse('r1', {}));
    await flushAll();
    expect(routerPushWithRetry).not.toHaveBeenCalled();
    expect(modal().isOpen).toBe(false);
  });

  it('runs the check-in action instead of navigating when the call category action is pressed', async () => {
    mockDeliverResponse(mockResponse('r1', { eventCode: 'C1' }, { actionIdentifier: CHECK_IN_ACTION_ID }));
    await flushAll();
    expect(ctx.onCheckInAction).toHaveBeenCalledTimes(1);
    expect(routerPushWithRetry).not.toHaveBeenCalled();
  });
});

describe('cold-start dedupe', () => {
  it('handles the launch tap once across the cold-start replay and the listener', async () => {
    const launch = mockResponse('launch-1', { eventCode: 'C:1' });
    mockNotificationState.lastResponse = launch;
    await initialize();
    mockDeliverResponse(launch);
    await flushAll();
    expect(routerPushWithRetry).toHaveBeenCalledTimes(1);
  });

  it('handles distinct taps separately', async () => {
    await initialize();
    mockDeliverResponse(mockResponse('a', { eventCode: 'C:1' }));
    mockDeliverResponse(mockResponse('b', { eventCode: 'C:2' }));
    await flushAll();
    expect(routerPushWithRetry).toHaveBeenCalledTimes(2);
  });

  it(`remembers the last ${HANDLED_RESPONSE_LIMIT} request ids and forgets the oldest`, async () => {
    await initialize();
    for (let i = 0; i <= HANDLED_RESPONSE_LIMIT; i++) {
      mockDeliverResponse(mockResponse(`id-${i}`, { eventCode: `C:${i}` }));
    }
    await flushAll();
    expect(routerPushWithRetry).toHaveBeenCalledTimes(HANDLED_RESPONSE_LIMIT + 1);

    // id-0 was evicted by the 201st entry and is handled again; the newest is still remembered.
    mockDeliverResponse(mockResponse('id-0', { eventCode: 'C:0' }));
    mockDeliverResponse(mockResponse(`id-${HANDLED_RESPONSE_LIMIT}`, { eventCode: 'C:x' }));
    await flushAll();
    expect(routerPushWithRetry).toHaveBeenCalledTimes(HANDLED_RESPONSE_LIMIT + 2);
  });

  it('forgets handled taps when the local state is cleared at sign-out', async () => {
    await initialize();
    mockDeliverResponse(mockResponse('same', { eventCode: 'C:1' }));
    await flushAll();
    await pushNotificationService.clearLocalState();
    mockDeliverResponse(mockResponse('same', { eventCode: 'C:1' }));
    await flushAll();
    expect(routerPushWithRetry).toHaveBeenCalledTimes(2);
  });
});

describe('notifee events', () => {
  beforeEach(async () => {
    await initialize();
  });

  const emitForeground = (event: { type: number; detail: Record<string, unknown> }) => mockNotifeeState.foreground.forEach((observer) => observer(event as never));

  it('deep-links a notifee press with an event code', async () => {
    emitForeground({ type: EventType.PRESS, detail: { notification: { id: 'n1', title: 'Chat', data: { eventCode: 't:abc' } } } });
    await flushAll();
    expect(ctx.resolveRoute).toHaveBeenCalledWith({ kind: 'chat', id: 'abc', chatType: 'direct' });
  });

  it('shows the modal for a notifee press without a routable target', async () => {
    ctx.resolveRoute.mockReturnValue(null);
    emitForeground({ type: EventType.PRESS, detail: { notification: { id: 'n1', data: { eventCode: 'N:5' } } } });
    await flushAll();
    expect(modal().notification?.kind).toBe('notification');
  });

  it('runs the check-in action from the foreground and the background (headless) handler', async () => {
    emitForeground({ type: EventType.ACTION_PRESS, detail: { pressAction: { id: CHECK_IN_ACTION_ID } } });
    await mockNotifeeState.background?.({ type: EventType.ACTION_PRESS, detail: { pressAction: { id: CHECK_IN_ACTION_ID } } });
    await flushAll();
    expect(ctx.onCheckInAction).toHaveBeenCalledTimes(2);
  });

  it('never lets a failing check-in reject inside the background handler', async () => {
    ctx.onCheckInAction.mockRejectedValueOnce(new Error('offline'));
    await expect(mockNotifeeState.background?.({ type: EventType.ACTION_PRESS, detail: { pressAction: { id: CHECK_IN_ACTION_ID } } })).resolves.toBeUndefined();
  });

  it('ignores the check-in action in a variant without check-in actions', async () => {
    selectVariant('dispatch');
    emitForeground({ type: EventType.ACTION_PRESS, detail: { pressAction: { id: CHECK_IN_ACTION_ID } } });
    await flushAll();
    expect(ctx.onCheckInAction).not.toHaveBeenCalled();
  });
});

describe('local state and badge', () => {
  it('clears the badge, delivered notifications and the modal on sign-out', async () => {
    rn.Platform.OS = 'android';
    await initialize();
    await usePushNotificationModalStore.getState().showNotificationModal({ eventCode: 'C1' });
    await pushNotificationService.clearLocalState();
    expect(notifications.setBadgeCountAsync).toHaveBeenCalledWith(0);
    expect(notifications.dismissAllNotificationsAsync).toHaveBeenCalled();
    expect(jest.requireMock('@notifee/react-native').default.cancelAllNotifications).toHaveBeenCalled();
    expect(modal().isOpen).toBe(false);
    expect(pushNotificationService.getPushToken()).toBeNull();
  });

  it('clears the badge on demand', async () => {
    await pushNotificationService.clearBadge();
    expect(notifications.setBadgeCountAsync).toHaveBeenCalledWith(0);
  });
});
