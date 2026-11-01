import type { NativePushUnRegistrationInput, PushRegistrationInput, PushRegistrationResult, WebPushUnRegistrationInput } from '@resgrid/models';

import { type ApiContext, defineEndpoints, request, type RequestOptions } from '../../core';

/** Core v4 endpoints for devices (Devices). The contract test checks every entry against Swagger. */
export const devicesEndpoints = defineEndpoints('devices', {
  registerDevice: { method: 'POST', path: '/Devices/RegisterDevice', body: 'json' },
  registerUnitDevice: { method: 'POST', path: '/Devices/RegisterUnitDevice', body: 'json' },
  unRegisterNativePush: { method: 'POST', path: '/Devices/UnRegisterNativePush', body: 'json' },
  unRegisterWebPush: { method: 'POST', path: '/Devices/UnRegisterWebPush', body: 'json' },
});

const E = devicesEndpoints;

/** Register a device to receive push notification from the Resgrid system. `POST /Devices/RegisterDevice` — legacy: DIR. */
export const registerDevice = (ctx: ApiContext, body: PushRegistrationInput, options?: RequestOptions): Promise<PushRegistrationResult> => request<PushRegistrationResult>(ctx, E.registerDevice, { body }, options);

/** Register a unit device to receive push notification from the Resgrid system. `POST /Devices/RegisterUnitDevice` — legacy: BRU. */
export const registerUnitDevice = (ctx: ApiContext, body: PushRegistrationInput, options?: RequestOptions): Promise<PushRegistrationResult> =>
  request<PushRegistrationResult>(ctx, E.registerUnitDevice, { body }, options);

/** Takes an iOS or Android push token off the native push channels it was registered on, so that device stops receiving this user's (or unit's) pushes. Called when someone signs out of the native app. Runs at once, not through the queue. Only this token is removed: if another device has registered since, its token stays. `POST /Devices/UnRegisterNativePush` — legacy: U. */
export const unRegisterNativePush = (ctx: ApiContext, body: NativePushUnRegistrationInput, options?: RequestOptions): Promise<PushRegistrationResult> =>
  request<PushRegistrationResult>(ctx, E.unRegisterNativePush, { body }, options);

/** Takes a browser or desktop (Electron) push token off the web push channel it was registered on, so that browser stops receiving this user's (or unit's) pushes. Called when someone signs out of a browser or turns its notifications off. Runs at once, not through the queue. `POST /Devices/UnRegisterWebPush` — legacy: DIRU. */
export const unRegisterWebPush = (ctx: ApiContext, body: WebPushUnRegistrationInput, options?: RequestOptions): Promise<PushRegistrationResult> =>
  request<PushRegistrationResult>(ctx, E.unRegisterWebPush, { body }, options);
