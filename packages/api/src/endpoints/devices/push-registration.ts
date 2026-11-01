import type { NativePushUnRegistrationInput, PushRegistrationInput, PushRegistrationResult, WebPushUnRegistrationInput } from '@resgrid/models';

import { type ApiContext, type RequestOptions } from '../../core';
import { registerDevice, registerUnitDevice, unRegisterNativePush, unRegisterWebPush } from './devices';

/**
 * Whose Novu subscriber a device registers on:
 * - `user`: the signed-in person (Responder, Dispatch, BigBoard) — `Devices/RegisterDevice`;
 * - `unit`: the active unit (Unit) — `Devices/RegisterUnitDevice` with `UnitId`;
 * - `icUser`: the person, on the IC channel set — `Devices/RegisterDevice` with `Source: 'IC'`.
 * Push `Source` values are permanent per app (AGENTS.md identity list).
 */
export type PushSubject = { kind: 'user' } | { kind: 'unit'; unitId: string } | { kind: 'icUser' };

/** Push `Source` the IC app registers with. Never change it (old builds stay in the field). */
export const IC_PUSH_SOURCE = 'IC';

export interface PushDevice {
  token: string;
  /** Core push platform id (iOS, Android, web). */
  platform: number;
  deviceUuid: string;
  /** Department code prefix the subscriber is namespaced by. */
  prefix: string;
}

const sourceFor = (subject: PushSubject): string | undefined => (subject.kind === 'icUser' ? IC_PUSH_SOURCE : undefined);

export const buildPushRegistrationInput = (subject: PushSubject, device: PushDevice): PushRegistrationInput => ({
  Platform: device.platform,
  Token: device.token,
  DeviceUuid: device.deviceUuid,
  Prefix: device.prefix,
  ...(subject.kind === 'unit' ? { UnitId: subject.unitId } : {}),
  ...(sourceFor(subject) ? { Source: sourceFor(subject) } : {}),
});

/** Registers a push token for the subject (user, unit or IC user). */
export const registerPushDevice = (ctx: ApiContext, subject: PushSubject, device: PushDevice, options?: RequestOptions): Promise<PushRegistrationResult> => {
  const body = buildPushRegistrationInput(subject, device);
  return subject.kind === 'unit' ? registerUnitDevice(ctx, body, options) : registerDevice(ctx, body, options);
};

/** Takes a token off the channels it was registered on (native: iOS/Android; web: browser/desktop). */
export const unregisterPushToken = (ctx: ApiContext, subject: PushSubject, channel: 'native' | 'web', token: { token: string; prefix: string }, options?: RequestOptions): Promise<PushRegistrationResult> => {
  const body: NativePushUnRegistrationInput & WebPushUnRegistrationInput = {
    Token: token.token,
    Prefix: token.prefix,
    ...(subject.kind === 'unit' ? { UnitId: subject.unitId } : {}),
    ...(sourceFor(subject) ? { Source: sourceFor(subject) } : {}),
  };
  return channel === 'native' ? unRegisterNativePush(ctx, body, options) : unRegisterWebPush(ctx, body, options);
};
