// Push on the web and desktop editions (push-notification.web.ts), ported from Unit's push-notification.web tests and
// generalized to every push subject: a browser mints an FCM web token, Electron gets one from its main process through
// the preload bridge, either registers as Platform 3; every SDK/IPC step has its own timeout; a registration never
// outlives its session.
import { configureNotificationSounds } from '../notification-sound';
import { usePushNotificationModalStore } from '../push-modal-store';
import * as web from '../push-notification.web';
import { BASE_API_URL, configureForTest, flush, flushAll, selectVariant, type TestContext } from './helpers';
import { routerPushWithRetry } from './mocks/core';
import * as audio from './mocks/expo-audio';

const mockFirebaseGetToken = jest.fn(async (..._args: unknown[]) => 'browser-token');
const mockFirebaseDeleteToken = jest.fn(async (..._args: unknown[]) => true);

jest.mock('firebase/app', () => ({ getApps: () => [], initializeApp: (_config: unknown, name: string) => ({ name }) }));
jest.mock('firebase/messaging', () => ({
  isSupported: async () => true,
  getMessaging: () => 'messaging',
  getToken: (...args: unknown[]) => mockFirebaseGetToken(...args),
  deleteToken: (...args: unknown[]) => mockFirebaseDeleteToken(...args),
}));

const rn = jest.requireMock('react-native') as { Platform: { OS: string } };
const globals = globalThis as unknown as Record<string, unknown>;

const firebaseConfig = { apiKey: 'api-key', projectId: 'resgrid-web', messagingSenderId: '343968022249', appId: '1:343968022249:web:abc', vapidKey: 'BVapid' };

let ctx: TestContext;
let webConfig: typeof firebaseConfig | null;
let storage: Map<string, string>;
let worker: { scriptURL: string; postMessage: jest.Mock };
let serviceWorkerListeners: ((event: { data: unknown }) => void)[];
let permission: NotificationPermission;
let requestPermission: jest.Mock;
let clickListeners: Set<() => void>;
let fetchMock: jest.Mock;

const registrations = () => ctx.api.requests.filter((request) => request.url.startsWith('/Devices/Register'));
const webUnregistrations = () => ctx.api.requests.filter((request) => request.url === '/Devices/UnRegisterWebPush');
const clickPage = () => [...clickListeners].forEach((listener) => listener());
const modal = () => usePushNotificationModalStore.getState();

function holdNextMint(): () => Promise<(token: string) => void> {
  const held: { release?: (token: string) => void } = {};
  mockFirebaseGetToken.mockImplementationOnce(() => new Promise<string>((resolve) => (held.release = resolve)));
  return async () => {
    while (!held.release) await flush();
    return held.release;
  };
}

function installBrowser(): void {
  storage = new Map();
  worker = { scriptURL: 'https://app.test/service-worker.js', postMessage: jest.fn() };
  serviceWorkerListeners = [];
  permission = 'default';
  requestPermission = jest.fn(async () => permission);
  const registration = { active: worker, pushManager: { getSubscription: async () => null } };
  globals.window = globalThis;
  globals.isSecureContext = true;
  globals.PushManager = function PushManager() {};
  globals.Notification = {
    get permission() {
      return permission;
    },
    requestPermission: () => requestPermission(),
  };
  globals.localStorage = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  };
  clickListeners = new Set();
  globals.document = {
    visibilityState: 'visible',
    hasFocus: () => true,
    addEventListener: (type: string, listener: () => void) => type === 'click' && clickListeners.add(listener),
    removeEventListener: (type: string, listener: () => void) => type === 'click' && clickListeners.delete(listener),
  };
  globals.electronAPI = undefined;
  globals.__ELECTRON__ = undefined;
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      userAgent: 'Mozilla/5.0',
      serviceWorker: {
        controller: null,
        ready: Promise.resolve(registration),
        register: jest.fn(async () => registration),
        getRegistrations: jest.fn(async () => [registration]),
        addEventListener: (_type: string, listener: (event: { data: unknown }) => void) => serviceWorkerListeners.push(listener),
        removeEventListener: jest.fn(),
      },
    },
  });
}

beforeEach(() => {
  rn.Platform.OS = 'web';
  selectVariant('unit');
  installBrowser();
  web.resetWebPushForTests();
  usePushNotificationModalStore.setState({ isOpen: false, notification: null });
  mockFirebaseGetToken.mockImplementation(async () => 'browser-token');
  routerPushWithRetry.mockImplementation(async () => undefined);
  webConfig = { ...firebaseConfig };
  ctx = configureForTest({ getWebPushConfig: () => webConfig, getAccessToken: () => 'access-token' });
  fetchMock = jest.fn(async () => ({ ok: true }));
  globals.fetch = fetchMock;
});

afterEach(() => {
  jest.useRealTimers();
});

describe('browser', () => {
  it('registers nothing, and never asks, while Core has no Firebase web app configured', async () => {
    webConfig = null;
    permission = 'granted';
    await web.syncWebPush();
    web.askForPermissionOnce();
    expect(clickListeners.size).toBe(0);
    expect(registrations()).toEqual([]);
  });

  it('registers its FCM web token on the active unit as Platform 3 once the browser has permission', async () => {
    permission = 'granted';
    await web.syncWebPush();
    expect(registrations()).toEqual([expect.objectContaining({ url: '/Devices/RegisterUnitDevice', data: { Platform: 3, Token: 'browser-token', DeviceUuid: 'device-uuid', Prefix: 'DEPT', UnitId: '12' } })]);
    expect(mockFirebaseGetToken).toHaveBeenCalledWith('messaging', expect.objectContaining({ vapidKey: 'BVapid' }));
    expect(web.pushNotificationService.getPushToken()).toBe('browser-token');
  });

  it.each([
    ['responder', '/Devices/RegisterDevice', { Platform: 3, Token: 'browser-token', DeviceUuid: 'device-uuid', Prefix: 'DEPT' }],
    ['ic', '/Devices/RegisterDevice', { Platform: 3, Token: 'browser-token', DeviceUuid: 'device-uuid', Prefix: 'DEPT', Source: 'IC' }],
  ] as const)('registers the %s subject', async (variant, url, data) => {
    selectVariant(variant);
    permission = 'granted';
    await web.syncWebPush();
    expect(registrations()).toEqual([expect.objectContaining({ url, data })]);
  });

  it('asks for permission once, on the first click after sign-in, then registers', async () => {
    web.askForPermissionOnce();
    web.askForPermissionOnce();
    expect(clickListeners.size).toBe(1);
    permission = 'granted';
    clickPage();
    await flushAll();
    expect(requestPermission).toHaveBeenCalledTimes(1);
    expect(registrations()).toHaveLength(1);
  });

  it('waits a week before asking again after the prompt is dismissed', async () => {
    web.askForPermissionOnce();
    clickPage();
    await flushAll();
    web.askForPermissionOnce();
    expect(clickListeners.size).toBe(0);

    const now = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(now + web.ASK_AGAIN_AFTER_MS + 1);
    web.askForPermissionOnce();
    expect(clickListeners.size).toBe(1);
  });

  it('neither asks nor registers once notifications are blocked', async () => {
    permission = 'denied';
    web.askForPermissionOnce();
    await web.syncWebPush();
    expect(clickListeners.size).toBe(0);
    expect(registrations()).toEqual([]);
  });

  it('re-registers an unchanged token only once a day', async () => {
    permission = 'granted';
    await web.syncWebPush();
    await web.syncWebPush();
    expect(registrations()).toHaveLength(1);
    const now = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(now + web.REREGISTER_AFTER_MS + 1);
    await web.syncWebPush();
    expect(registrations()).toHaveLength(2);
  });

  it('takes the device off the previous unit and rotates the token before registering another', async () => {
    permission = 'granted';
    await web.syncWebPush();
    ctx.state.unitId = '15';
    mockFirebaseGetToken.mockResolvedValue('new-token');
    await web.syncWebPush();
    expect(webUnregistrations()).toEqual([expect.objectContaining({ data: { Token: 'browser-token', Prefix: 'DEPT', UnitId: '12' } })]);
    expect(mockFirebaseDeleteToken).toHaveBeenCalledTimes(1);
    expect(registrations()[1].data).toMatchObject({ UnitId: '15', Token: 'new-token' });
  });

  it('unregisters straight to the server and kills the token at sign-out, reading the server before any switch', async () => {
    permission = 'granted';
    await web.syncWebPush();
    const signOut = web.pushNotificationService.unregisterAtSignOut('access-token');
    ctx.state.baseUrl = 'https://new.test/api/v4';
    await signOut;
    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE_API_URL}/Devices/UnRegisterWebPush`,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer access-token', 'X-Resgrid-Client': 'test' }),
        body: JSON.stringify({ Token: 'browser-token', Prefix: 'DEPT', UnitId: '12' }),
      })
    );
    expect(mockFirebaseDeleteToken).toHaveBeenCalledTimes(1);
    expect(web.pushNotificationService.getPushToken()).toBeNull();
  });

  it("sends the IC Source when taking an IC user's browser off", async () => {
    selectVariant('ic');
    permission = 'granted';
    await web.syncWebPush();
    await web.pushNotificationService.unregisterAtSignOut('access-token');
    expect(fetchMock).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ body: JSON.stringify({ Token: 'browser-token', Prefix: 'DEPT', Source: 'IC' }) }));
  });

  it('still kills the token when the sign-out call fails', async () => {
    permission = 'granted';
    await web.syncWebPush();
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    await web.pushNotificationService.unregisterAtSignOut('access-token');
    expect(mockFirebaseDeleteToken).toHaveBeenCalledTimes(1);
  });

  it('takes off the registration a sync in flight at sign-out was still writing', async () => {
    permission = 'granted';
    const reachedMint = holdNextMint();
    const sync = web.syncWebPush();
    const release = await reachedMint();
    const signOut = web.pushNotificationService.unregisterAtSignOut('access-token');
    release('browser-token');
    await Promise.all([sync, signOut]);
    // The mint finished for the still-signed-in session, registered, then the queued cleanup took it off.
    expect(registrations()).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ body: JSON.stringify({ Token: 'browser-token', Prefix: 'DEPT', UnitId: '12' }) }));
    expect(web.pushNotificationService.getPushToken()).toBeNull();
  });

  it('registers nothing for a session that ended while its token was minted', async () => {
    permission = 'granted';
    const reachedMint = holdNextMint();
    const sync = web.syncWebPush();
    const release = await reachedMint();
    ctx.state.signedIn = false;
    release('browser-token');
    await sync;
    expect(registrations()).toEqual([]);
  });

  it('takes a registration off at once when the subject changed while Core was accepting it', async () => {
    permission = 'granted';
    ctx.api.respond.mockImplementationOnce(async () => {
      ctx.state.unitId = '15';
      return { Status: 'Queued' };
    });
    await web.syncWebPush();
    expect(fetchMock).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ body: JSON.stringify({ Token: 'browser-token', Prefix: 'DEPT', UnitId: '12' }) }));
    expect(mockFirebaseDeleteToken).toHaveBeenCalledTimes(1);
    expect(web.pushNotificationService.getPushToken()).toBeNull();
  });

  it('retries a failed registration instead of treating its cleanup record as registered', async () => {
    permission = 'granted';
    ctx.api.respond.mockRejectedValueOnce(new Error('offline'));
    await expect(web.syncWebPush()).rejects.toThrow();
    await web.syncWebPush();
    expect(registrations()).toHaveLength(2);
  });

  describe('per-step timeouts', () => {
    it('releases a hung token mint so sign-out removes the old registration and the next sign-in can sync', async () => {
      jest.useFakeTimers({ doNotFake: ['setImmediate'] });
      permission = 'granted';
      await web.syncWebPush();
      const reachedMint = holdNextMint();
      // Force a re-mint by expiring the stored registration.
      storage.set(web.WEB_PUSH_REGISTRATION_KEY, JSON.stringify({ ...JSON.parse(storage.get(web.WEB_PUSH_REGISTRATION_KEY) ?? '{}'), registeredAt: 0 }));
      const sync = web.syncWebPush();
      const failedSync = expect(sync).rejects.toThrow('timed out');
      const releaseToken = await reachedMint();
      const signOut = web.pushNotificationService.unregisterAtSignOut('access-token');

      await jest.advanceTimersByTimeAsync(web.PUSH_OPERATION_TIMEOUT_MS + 1);
      await failedSync;
      await signOut;
      expect(fetchMock).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ body: JSON.stringify({ Token: 'browser-token', Prefix: 'DEPT', UnitId: '12' }) }));
      expect(web.pushNotificationService.getPushToken()).toBeNull();

      ctx.state.unitId = '15';
      mockFirebaseGetToken.mockResolvedValue('next-token');
      await web.syncWebPush();
      releaseToken('late-token');
      await flush();
      expect(registrations().at(-1)?.data).toMatchObject({ UnitId: '15', Token: 'next-token' });
      expect(web.pushNotificationService.getPushToken()).toBe('next-token');
    });

    it('does not mint a token when service-worker readiness arrives after its timeout', async () => {
      jest.useFakeTimers({ doNotFake: ['setImmediate'] });
      permission = 'granted';
      const held: { ready?: (registration: object) => void } = {};
      const registration = { active: null };
      const sw = (globalThis.navigator as unknown as { serviceWorker: { register: jest.Mock } }).serviceWorker;
      sw.register.mockResolvedValueOnce(registration);
      Object.defineProperty(sw, 'ready', { value: new Promise((resolve) => (held.ready = resolve)), configurable: true });
      const sync = web.syncWebPush();
      const failedSync = expect(sync).rejects.toThrow('service worker readiness timed out');
      await jest.advanceTimersByTimeAsync(web.PUSH_OPERATION_TIMEOUT_MS + 1);
      await failedSync;
      held.ready?.(registration);
      await flush();
      expect(mockFirebaseGetToken).not.toHaveBeenCalled();
    });

    it('aborts a hung device registration and leaves its token for sign-out to remove', async () => {
      jest.useFakeTimers({ doNotFake: ['setImmediate'] });
      permission = 'granted';
      ctx.api.respond.mockImplementationOnce(() => new Promise(() => undefined));
      const sync = web.syncWebPush();
      const failedSync = expect(sync).rejects.toThrow('register device timed out');
      while (registrations().length === 0) await flush();
      const signal = registrations()[0].signal;
      const signOut = web.pushNotificationService.unregisterAtSignOut('access-token');
      await jest.advanceTimersByTimeAsync(web.PUSH_OPERATION_TIMEOUT_MS + 1);
      await Promise.all([failedSync, signOut]);
      expect(signal?.aborted).toBe(true);
      expect(fetchMock).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ body: JSON.stringify({ Token: 'browser-token', Prefix: 'DEPT', UnitId: '12' }) }));
      expect(mockFirebaseDeleteToken).toHaveBeenCalledTimes(1);
    });

    it('aborts a stalled sign-out request so the next session can register', async () => {
      jest.useFakeTimers({ doNotFake: ['setImmediate'] });
      permission = 'granted';
      await web.syncWebPush();
      let signal: AbortSignal | undefined;
      fetchMock.mockImplementationOnce((_url: string, init: { signal: AbortSignal }) => {
        signal = init.signal;
        return new Promise(() => undefined);
      });
      const signOut = web.pushNotificationService.unregisterAtSignOut('access-token');
      ctx.state.unitId = '15';
      const next = web.syncWebPush();
      await jest.advanceTimersByTimeAsync(web.PUSH_OPERATION_TIMEOUT_MS + 1);
      await Promise.all([signOut, next]);
      expect(signal?.aborted).toBe(true);
      expect(registrations().at(-1)?.data).toMatchObject({ UnitId: '15' });
    });
  });
});

describe('desktop (Electron bridge)', () => {
  let bridge: {
    isElectron: boolean;
    pushStart: jest.Mock;
    pushStop: jest.Mock;
    pushTakePendingClick: jest.Mock;
    onPushReceived: jest.Mock;
    onPushNotificationClick: jest.Mock;
    received?: (payload: web.WebPushPayload) => void;
    clicked?: (payload: web.WebPushPayload) => void;
  };

  beforeEach(() => {
    bridge = {
      isElectron: true,
      pushStart: jest.fn(async () => ({ token: 'desktop-token' })),
      pushStop: jest.fn(async () => undefined),
      pushTakePendingClick: jest.fn(async () => null),
      onPushReceived: jest.fn((callback: (payload: web.WebPushPayload) => void) => {
        bridge.received = callback;
        return () => undefined;
      }),
      onPushNotificationClick: jest.fn((callback: (payload: web.WebPushPayload) => void) => {
        bridge.clicked = callback;
        return () => undefined;
      }),
    };
    globals.__ELECTRON__ = true;
    globals.electronAPI = bridge;
  });

  it('registers the token its main process hands back, without asking (the OS handles permission)', async () => {
    await web.syncWebPush();
    web.askForPermissionOnce();
    expect(bridge.pushStart).toHaveBeenCalledWith(firebaseConfig);
    expect(registrations()).toEqual([expect.objectContaining({ data: expect.objectContaining({ Platform: 3, Token: 'desktop-token', UnitId: '12' }) })]);
    expect(clickListeners.size).toBe(0);
    expect(mockFirebaseGetToken).not.toHaveBeenCalled();
  });

  it('forgets its credentials at sign-out', async () => {
    await web.syncWebPush();
    await web.pushNotificationService.unregisterAtSignOut('access-token');
    expect(bridge.pushStop).toHaveBeenCalledWith(true);
    expect(fetchMock).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ body: JSON.stringify({ Token: 'desktop-token', Prefix: 'DEPT', UnitId: '12' }) }));
  });

  it('stops a hung desktop start after its timeout and ignores its late token', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate'] });
    const held: { release?: (value: { token: string }) => void } = {};
    bridge.pushStart.mockImplementationOnce(() => new Promise((resolve) => (held.release = resolve)));
    const sync = web.syncWebPush();
    const failed = expect(sync).rejects.toThrow('start desktop receiver timed out');
    await jest.advanceTimersByTimeAsync(web.PUSH_OPERATION_TIMEOUT_MS + 1);
    await failed;
    held.release?.({ token: 'late' });
    await flush();
    expect(registrations()).toEqual([]);
  });

  it('registers nothing when the main process could not start', async () => {
    bridge.pushStart.mockResolvedValueOnce({ error: 'no fcm' });
    await web.syncWebPush();
    expect(registrations()).toEqual([]);
  });

  it('uses the browser path when the variant has desktop push off', async () => {
    selectVariant('unit', { desktopPush: false });
    permission = 'granted';
    await web.syncWebPush();
    expect(bridge.pushStart).not.toHaveBeenCalled();
  });

  it('routes a notification click the main process kept for the page, and later clicks', async () => {
    bridge.pushTakePendingClick.mockResolvedValueOnce({ title: 'Call', body: 'Fire', eventCode: 'C:77' });
    web.attachWebPushListeners();
    await flushAll();
    expect(ctx.resolveRoute).toHaveBeenCalledWith({ kind: 'call', id: '77' });
    bridge.clicked?.({ title: 'Chat', body: 'Hi', eventCode: 'g:9' });
    await flushAll();
    expect(ctx.resolveRoute).toHaveBeenCalledWith({ kind: 'chat', id: '9', chatType: 'group' });
  });

  it('shows a push for a focused window as the in-app alert with its sound', async () => {
    configureNotificationSounds({ moderncallemergency: 'file://emergency.wav' });
    web.attachWebPushListeners();
    bridge.received?.({ title: 'Call', body: 'Fire', eventCode: 'C:77', type: '7' });
    await flushAll();
    expect(modal().notification).toMatchObject({ kind: 'call', title: 'Call' });
    expect(audio.mockAudioState.played).toContain('file://emergency.wav');
  });
});

describe('service worker clicks and foreground pushes', () => {
  it('opens a call or chat like a tap on the phone, and anything else as the in-app alert', async () => {
    web.attachWebPushListeners();
    await flushAll();
    expect(worker.postMessage).toHaveBeenCalledWith({ type: 'CLIENT_READY' });

    serviceWorkerListeners.forEach((listener) => listener({ data: { type: 'NOTIFICATION_CLICK', data: { title: 'Call', body: 'x', eventCode: 'C:1' } } }));
    await flushAll();
    expect(routerPushWithRetry).toHaveBeenCalledWith('/call/1', expect.anything());

    ctx.resolveRoute.mockReturnValueOnce(null);
    serviceWorkerListeners.forEach((listener) => listener({ data: { type: 'NOTIFICATION_CLICK', data: { title: 'Note', body: 'x', eventCode: 'N:5' } } }));
    await flushAll();
    expect(modal().notification?.kind).toBe('notification');
  });

  it('refuses an id that would steer the router elsewhere', async () => {
    await web.openWebPush({ title: 'x', body: 'y', eventCode: 'C:../admin' });
    expect(routerPushWithRetry).not.toHaveBeenCalled();
    expect(modal().notification?.target).toBeNull();
  });

  it('falls back to the in-app alert when the route never lands', async () => {
    routerPushWithRetry.mockRejectedValueOnce(new Error('never'));
    await web.openWebPush({ title: 'x', body: 'y', eventCode: 't:abc' });
    expect(modal().notification?.kind).toBe('chat');
  });

  it('shows a pushed message only to a page in front of the person', async () => {
    web.attachWebPushListeners();
    (globals.document as { hasFocus: () => boolean }).hasFocus = () => false;
    serviceWorkerListeners.forEach((listener) => listener({ data: { type: 'PUSH_RECEIVED', data: { title: 'x', body: 'y', eventCode: 'M:1' } } }));
    await flushAll();
    expect(modal().isOpen).toBe(false);
    (globals.document as { hasFocus: () => boolean }).hasFocus = () => true;
    serviceWorkerListeners.forEach((listener) => listener({ data: { type: 'PUSH_RECEIVED', data: { title: 'x', body: 'y', eventCode: 'M:1' } } }));
    await flushAll();
    expect(modal().notification?.kind).toBe('message');
  });

  it('clears the app badge through the Badging API', async () => {
    const clearAppBadge = jest.fn(async () => undefined);
    (globalThis.navigator as unknown as { clearAppBadge: unknown }).clearAppBadge = clearAppBadge;
    await web.pushNotificationService.clearBadge();
    expect(clearAppBadge).toHaveBeenCalled();
  });
});
