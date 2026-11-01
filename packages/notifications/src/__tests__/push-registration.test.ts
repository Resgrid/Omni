// Native registration per push subject (Source per variant), the queue, persistence across restarts (IC), unit and
// department switch cleanup (Unit), sign-out with the outgoing session's token before any server switch, and the
// registration hook. Ported from Unit's push-notification-sign-out tests, Responder's push-notification-registration
// tests and IC's sign-out tests, adapted to injected dependencies.
import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { pushNotificationService, usePushNotifications } from '../push-notification';
import type { PushRegistrationTrigger } from '../push-types';
import { NATIVE_PUSH_REGISTRATION_KEY, NATIVE_PUSH_STALE_REGISTRATIONS_KEY } from '../registration-storage';
import { BASE_API_URL, configureForTest, flushAll, selectVariant, type TestContext } from './helpers';
import { mockSetAppActive } from './mocks/core';
import { mockSetIsDevice } from './mocks/expo-device';
import { mockNotificationState, mockResetNotifications } from './mocks/expo-notifications';
import * as notifications from './mocks/expo-notifications';
import { AuthorizationStatus, mockNotifeeState, mockResetNotifee } from './mocks/notifee';

const rn = jest.requireMock('react-native') as { Platform: { OS: string } };

let ctx: TestContext;
let fetchMock: jest.Mock;

const registrations = () => ctx.api.requests.filter((request) => request.url.startsWith('/Devices/Register'));
const unregistrations = () => ctx.api.requests.filter((request) => request.url === '/Devices/UnRegisterNativePush');
const signOutCalls = () => fetchMock.mock.calls.map(([url, init]: [string, { headers: Record<string, string>; body: string }]) => ({ url, headers: init.headers, body: JSON.parse(init.body) as Record<string, unknown> }));

const register = (requestPermission = true) => pushNotificationService.registerForPushNotifications({ requestPermission });

/** Holds the next API answer; resolves (once the request was sent) to the function that releases it. */
function holdNextApiAnswer(): () => Promise<(value: unknown) => void> {
  const held: { release?: (value: unknown) => void } = {};
  ctx.api.respond.mockImplementationOnce(() => new Promise((resolve) => (held.release = resolve)));
  return async () => {
    while (!held.release) await flushAll(1);
    return held.release;
  };
}

beforeEach(() => {
  rn.Platform.OS = 'ios';
  selectVariant('unit');
  mockResetNotifications();
  mockResetNotifee();
  mockSetIsDevice(true);
  mockSetAppActive(true);
  pushNotificationService.resetForTests();
  ctx = configureForTest();
  fetchMock = jest.fn(async () => ({ ok: true, status: 200 }));
  (globalThis as unknown as { fetch: unknown }).fetch = fetchMock;
});

describe('registration per subject', () => {
  it('registers a unit device on the active unit (Unit)', async () => {
    await expect(register()).resolves.toBe('device-token');
    expect(registrations()).toEqual([{ method: 'POST', url: '/Devices/RegisterUnitDevice', data: { Platform: 1, Token: 'device-token', DeviceUuid: 'device-uuid', Prefix: 'DEPT', UnitId: '12' } }]);
  });

  it('registers the person with no unit and no Source (Responder, Dispatch, BigBoard)', async () => {
    for (const variant of ['responder', 'dispatch', 'bigboard'] as const) {
      selectVariant(variant);
      pushNotificationService.resetForTests();
      ctx = configureForTest();
      await register();
      expect(registrations()).toEqual([{ method: 'POST', url: '/Devices/RegisterDevice', data: { Platform: 1, Token: 'device-token', DeviceUuid: 'device-uuid', Prefix: 'DEPT' } }]);
    }
  });

  it("registers the IC user with Source 'IC'", async () => {
    selectVariant('ic');
    await register();
    expect(registrations()).toEqual([{ method: 'POST', url: '/Devices/RegisterDevice', data: { Platform: 1, Token: 'device-token', DeviceUuid: 'device-uuid', Prefix: 'DEPT', Source: 'IC' } }]);
  });

  it('uses the Android platform id on Android', async () => {
    rn.Platform.OS = 'android';
    await register();
    expect(registrations()[0].data?.Platform).toBe(2);
  });

  it('registers nothing for a variant whose push subject is none', async () => {
    selectVariant('bigboard', { subject: 'none' });
    await expect(register()).resolves.toBeNull();
    expect(ctx.api.requests).toEqual([]);
  });

  it.each([
    ['signed out', () => (ctx.state.signedIn = false)],
    ['no session', () => (ctx.state.session = null)],
    ['no active unit', () => (ctx.state.unitId = null)],
    ['a simulator', () => mockSetIsDevice(false)],
    ['permission refused', () => ((mockNotificationState.requestedPermission = 'denied'), (mockNotificationState.permission = 'denied'))],
    ['notifee permission denied', () => (mockNotifeeState.authorizationStatus = AuthorizationStatus.DENIED)],
    ['no token', () => (mockNotificationState.token = '')],
  ])('registers nothing with %s', async (_label, arrange) => {
    arrange();
    await expect(register()).resolves.toBeNull();
    expect(registrations()).toEqual([]);
  });

  it('prompts for permission by default and never when asked not to', async () => {
    mockNotificationState.permission = 'undetermined';
    mockNotificationState.requestedPermission = 'undetermined';
    await register(false);
    expect(notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(registrations()).toEqual([]);

    mockNotificationState.requestedPermission = 'granted';
    await register(true);
    expect(notifications.requestPermissionsAsync).toHaveBeenCalledWith({ ios: { allowAlert: true, allowBadge: true, allowSound: true, allowCriticalAlerts: true } });
    expect(registrations()).toHaveLength(1);
  });
});

describe('re-registration', () => {
  beforeEach(() => {
    selectVariant('responder');
  });

  it('does not register the same server, subject, department and token twice', async () => {
    await register();
    await register(false);
    expect(registrations()).toHaveLength(1);
  });

  it.each([
    ['the department changes', () => ctx.state.session && (ctx.state.session = { ...ctx.state.session, departmentCode: 'OTHER' })],
    ['the server changes', () => (ctx.state.baseUrl = 'https://other.test/api/v4')],
    ['the token rotates', () => (mockNotificationState.token = 'rotated-token')],
  ])('registers again when %s', async (_label, change) => {
    await register();
    change();
    await register();
    expect(registrations()).toHaveLength(2);
  });

  it('retries a registration the server did not accept', async () => {
    ctx.api.respond.mockResolvedValueOnce({ Status: 'Failure' });
    await expect(register()).resolves.toBeNull();
    await expect(register()).resolves.toBe('device-token');
    expect(registrations()).toHaveLength(2);
  });

  it('retries a registration that failed to reach the server', async () => {
    ctx.api.respond.mockRejectedValueOnce(new Error('Network Error'));
    await expect(register()).resolves.toBeNull();
    await register();
    expect(registrations()).toHaveLength(2);
  });

  it('registers again after resetRegistration (department/store reset)', async () => {
    await register();
    pushNotificationService.resetRegistration();
    await register();
    expect(registrations()).toHaveLength(2);
  });

  it('runs registrations one at a time', async () => {
    const waitForRequest = holdNextApiAnswer();
    const first = register();
    const second = register();
    const release = await waitForRequest();
    expect(registrations()).toHaveLength(1);
    release({ Status: 'Queued' });
    await Promise.all([first, second]);
    // The second found the identity already registered.
    expect(registrations()).toHaveLength(1);
  });

  it('does not register a session that moved on while its token was sorted out', async () => {
    notifications.getDevicePushTokenAsync.mockImplementationOnce(async () => {
      if (ctx.state.session) ctx.state.session = { ...ctx.state.session, departmentCode: 'MOVED' };
      return { type: 'ios', data: 'device-token' };
    });
    await expect(register()).resolves.toBeNull();
    expect(registrations()).toEqual([]);
  });
});

describe('persistence (IC)', () => {
  beforeEach(() => {
    selectVariant('ic');
  });

  it("keeps the registration in IC's nativePushRegistration key", async () => {
    await register();
    expect(ctx.storage.getJSON(NATIVE_PUSH_REGISTRATION_KEY)).toEqual({ UserId: 'user-1', Token: 'device-token', Prefix: 'DEPT', Source: 'IC' });
  });

  it('takes a registration made before a restart off at sign-out', async () => {
    // What an IC store build (or an earlier run) left behind.
    ctx.storage.setJSON(NATIVE_PUSH_REGISTRATION_KEY, { UserId: 'user-1', Token: 'old-token', Prefix: 'DEPT', Source: 'IC' });
    await pushNotificationService.unregisterAtSignOut('access-token');
    expect(signOutCalls()).toEqual([
      {
        url: `${BASE_API_URL}/Devices/UnRegisterNativePush`,
        headers: { 'X-Resgrid-Client': 'test', 'Content-Type': 'application/json', Authorization: 'Bearer access-token' },
        body: { Token: 'old-token', Prefix: 'DEPT', Source: 'IC' },
      },
    ]);
    expect(ctx.storage.getJSON(NATIVE_PUSH_REGISTRATION_KEY)).toBeNull();
  });

  it("leaves another user's stored registration alone, but forgets it", async () => {
    ctx.storage.setJSON(NATIVE_PUSH_REGISTRATION_KEY, { UserId: 'someone-else', Token: 'old-token', Prefix: 'DEPT', Source: 'IC' });
    await pushNotificationService.unregisterAtSignOut('access-token');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(ctx.storage.getJSON(NATIVE_PUSH_REGISTRATION_KEY)).toBeNull();
  });

  it('ignores a corrupt stored registration', async () => {
    ctx.storage.setJSON(NATIVE_PUSH_REGISTRATION_KEY, { Token: 5 });
    await pushNotificationService.unregisterAtSignOut('access-token');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('switching units (Unit)', () => {
  it('takes the token off the unit the device left, after the new unit is registered', async () => {
    await register();
    ctx.state.unitId = '13';
    await register();
    expect(ctx.api.requests.map((request) => `${request.url}:${String(request.data?.UnitId)}`)).toEqual(['/Devices/RegisterUnitDevice:12', '/Devices/RegisterUnitDevice:13', '/Devices/UnRegisterNativePush:12']);
    expect(unregistrations()[0].data).toEqual({ Token: 'device-token', Prefix: 'DEPT', UnitId: '12' });
  });

  it('leaves the unit alone when the same unit registers again', async () => {
    await register();
    pushNotificationService.resetRegistration();
    await register();
    expect(unregistrations()).toEqual([]);
  });

  it('takes the token off the old department when the unit moves to another one', async () => {
    await register();
    if (ctx.state.session) ctx.state.session = { ...ctx.state.session, departmentCode: 'NEW' };
    await register();
    expect(unregistrations()[0].data).toEqual({ Token: 'device-token', Prefix: 'DEPT', UnitId: '12' });
  });

  it('keeps the old unit when the new unit could not be registered', async () => {
    await register();
    ctx.state.unitId = '13';
    ctx.api.respond.mockRejectedValueOnce(new Error('offline'));
    await register();
    expect(unregistrations()).toEqual([]);
    expect(ctx.storage.getJSON(NATIVE_PUSH_REGISTRATION_KEY)).toMatchObject({ UnitId: '12' });
  });

  it('keeps an old unit the server did not clear, retries it next time and takes both off at sign-out', async () => {
    await register();
    ctx.state.unitId = '13';
    ctx.api.respond.mockImplementation(async (record) => (record.url.includes('/Devices/Register') ? { Status: 'Queued' } : { Status: 'Failure' }));
    await register();
    expect(ctx.storage.getJSON(NATIVE_PUSH_STALE_REGISTRATIONS_KEY)).toEqual([{ UserId: 'user-1', Token: 'device-token', Prefix: 'DEPT', UnitId: '12' }]);

    // Retried on the next registration.
    mockNotificationState.token = 'rotated';
    await register();
    expect(unregistrations()).toHaveLength(2);

    await pushNotificationService.unregisterAtSignOut('access-token');
    expect(signOutCalls().map((call) => call.body)).toEqual([
      { Token: 'rotated', Prefix: 'DEPT', UnitId: '13' },
      { Token: 'device-token', Prefix: 'DEPT', UnitId: '12' },
    ]);
  });

  it('does not take the token off a pending old unit the device has come back to', async () => {
    await register();
    ctx.state.unitId = '13';
    ctx.api.respond.mockImplementation(async (record) => (record.url.includes('/Devices/Register') ? { Status: 'Queued' } : { Status: 'Failure' }));
    await register();
    ctx.api.respond.mockImplementation(async (record) => (record.url.includes('/Devices/Register') ? { Status: 'Queued' } : { Status: 'Success' }));
    ctx.state.unitId = '12';
    await register();
    // 13 is now stale and removed; 12 (current again) is never unregistered after the return.
    expect(unregistrations().map((request) => request.data?.UnitId)).toEqual(['12', '13']);
    expect(ctx.storage.getJSON(NATIVE_PUSH_STALE_REGISTRATIONS_KEY)).toBeNull();
  });
});

describe('sign-out', () => {
  it('takes the registered token off as the signing-out session, straight to the server', async () => {
    await register();
    await pushNotificationService.unregisterAtSignOut('access-token');
    expect(signOutCalls()).toEqual([
      {
        url: `${BASE_API_URL}/Devices/UnRegisterNativePush`,
        headers: { 'X-Resgrid-Client': 'test', 'Content-Type': 'application/json', Authorization: 'Bearer access-token' },
        body: { Token: 'device-token', Prefix: 'DEPT', UnitId: '12' },
      },
    ]);
    // Not through the api client (its 401 handling would re-enter logout).
    expect(unregistrations()).toEqual([]);
  });

  it('reads the server synchronously, so a server switch right after sign-out does not redirect the call', async () => {
    await register();
    const done = pushNotificationService.unregisterAtSignOut('access-token');
    ctx.state.baseUrl = 'https://new-server.test/api/v4';
    await done;
    expect(signOutCalls()[0].url).toBe(`${BASE_API_URL}/Devices/UnRegisterNativePush`);
  });

  it('unregisters before the local teardown, and only once per registration', async () => {
    await register();
    const order: string[] = [];
    fetchMock.mockImplementation(async () => {
      order.push('unregister');
      return { ok: true, status: 200 };
    });
    notifications.setBadgeCountAsync.mockImplementation(async () => {
      order.push('local');
      return true;
    });
    await pushNotificationService.unregisterAtSignOut('access-token');
    await pushNotificationService.clearLocalState();
    await pushNotificationService.unregisterAtSignOut('access-token');
    expect(order).toEqual(['unregister', 'local']);
  });

  it('does not call the server without an access token or a registration', async () => {
    await pushNotificationService.unregisterAtSignOut('access-token');
    await register();
    await pushNotificationService.unregisterAtSignOut(null);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('lets sign-out carry on when the server refuses or is unreachable', async () => {
    await register();
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500 });
    await expect(pushNotificationService.unregisterAtSignOut('access-token')).resolves.toBeUndefined();
    pushNotificationService.resetRegistration();
    await register();
    fetchMock.mockRejectedValueOnce(new Error('Network Error'));
    await expect(pushNotificationService.unregisterAtSignOut('access-token')).resolves.toBeUndefined();
  });

  it('registers again for the next session', async () => {
    await register();
    await pushNotificationService.unregisterAtSignOut('access-token');
    await register();
    expect(registrations()).toHaveLength(2);
  });

  describe('while a registration is in flight', () => {
    it('takes a registration that lands after sign-out off with that session token and server, and never keeps it', async () => {
      const waitForRequest = holdNextApiAnswer();
      const pending = register();
      const release = await waitForRequest();

      await pushNotificationService.unregisterAtSignOut('signed-out-token');
      ctx.state.baseUrl = 'https://new-server.test/api/v4';
      release({ Status: 'Queued' });
      await expect(pending).resolves.toBeNull();

      expect(signOutCalls()).toEqual([
        {
          url: `${BASE_API_URL}/Devices/UnRegisterNativePush`,
          headers: { 'X-Resgrid-Client': 'test', 'Content-Type': 'application/json', Authorization: 'Bearer signed-out-token' },
          body: { Token: 'device-token', Prefix: 'DEPT', UnitId: '12' },
        },
      ]);
      expect(ctx.storage.getJSON(NATIVE_PUSH_REGISTRATION_KEY)).toBeNull();
    });

    it('does not register at all when sign-out comes before the request is sent', async () => {
      notifications.getDevicePushTokenAsync.mockImplementationOnce(async () => {
        await pushNotificationService.unregisterAtSignOut('access-token');
        return { type: 'ios', data: 'device-token' };
      });
      await expect(register()).resolves.toBeNull();
      expect(registrations()).toEqual([]);
    });
  });
});

describe('usePushNotifications', () => {
  let renderer: ReactTestRenderer | null = null;

  function Harness(props: PushRegistrationTrigger): null {
    usePushNotifications(props);
    return null;
  }

  const render = async (props: PushRegistrationTrigger) => {
    await act(async () => {
      if (renderer) renderer.update(createElement(Harness, props));
      else renderer = create(createElement(Harness, props));
    });
    await flushAll();
  };

  beforeEach(() => {
    selectVariant('responder');
  });

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = null;
  });

  it('does nothing while signed out', async () => {
    await render({ signedIn: false, userId: 'user-1', departmentCode: 'DEPT' });
    expect(registrations()).toEqual([]);
  });

  it("waits for the session's department code, then registers (prompting)", async () => {
    await render({ signedIn: true, userId: 'user-1', departmentCode: null });
    expect(registrations()).toEqual([]);
    await render({ signedIn: true, userId: 'user-1', departmentCode: 'DEPT' });
    expect(registrations()).toHaveLength(1);
    expect(notifee().requestPermission).toHaveBeenCalled();
  });

  it('checks again without prompting when the app returns to the foreground', async () => {
    await render({ signedIn: true, userId: 'user-1', departmentCode: 'DEPT' });
    notifee().requestPermission.mockClear();
    mockNotificationState.token = 'rotated';
    await act(async () => mockSetAppActive(false));
    await act(async () => mockSetAppActive(true));
    await flushAll();
    expect(registrations()).toHaveLength(2);
    expect(notifee().requestPermission).not.toHaveBeenCalled();
    expect(notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('registers again when the department changes for the same user', async () => {
    await render({ signedIn: true, userId: 'user-1', departmentCode: 'DEPT' });
    if (ctx.state.session) ctx.state.session = { ...ctx.state.session, departmentCode: 'OTHER' };
    await render({ signedIn: true, userId: 'user-1', departmentCode: 'OTHER' });
    expect(registrations().map((request) => request.data?.Prefix)).toEqual(['DEPT', 'OTHER']);
  });
});

function notifee(): { requestPermission: jest.Mock } {
  return jest.requireMock('@notifee/react-native').default as { requestPermission: jest.Mock };
}
