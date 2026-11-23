import type { NativePushUnRegistrationInput, PushRegistrationInput, PushRegistrationResult, WebPushUnRegistrationInput } from '@resgrid/models';

import { type ApiContext, type RequestOptions } from '../../core';
import { registerDevice, registerUnitDevice, unRegisterNativePush, unRegisterWebPush } from './devices';

/**
 * Whose Novu subscriber a device registers on:
 * - `user`: the signed-in person (Responder, Dispatch, BigBoard) — `Devices/RegisterDevice`, with the app's own `Source`
 *   where its manifest names one (`capabilities.push.source`: Dispatch sends `Dispatch`, so Core can keep its tokens on
 *   Dispatch's push integrations);
 * - `unit`: the active unit (Unit) — `Devices/RegisterUnitDevice` with `UnitId`;
 * - `icUser`: the person, on the IC channel set — `Devices/RegisterDevice` with `Source: 'IC'`.
 * Push `Source` values are permanent per app (AGENTS.md identity list).
 */
export type PushSubject = { kind: 'user'; source?: string } | { kind: 'unit'; unitId: string } | { kind: 'icUser' };

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

/** The `Source` a registration for `subject` carries: IC's, a `user` app's own, or none. */
export const pushSourceFor = (subject: PushSubject): string | undefined => {
  if (subject.kind === 'icUser') return IC_PUSH_SOURCE;

  return subject.kind === 'user' ? subject.source : undefined;
};

/** Adds the subject's `UnitId` (unit) and `Source` (IC, or a `user` app's own) to a registration or removal body. */
const addSubjectFields = (body: { UnitId?: string; Source?: string }, subject: PushSubject): void => {
  if (subject.kind === 'unit') body.UnitId = subject.unitId;

  const source = pushSourceFor(subject);

  if (source) body.Source = source;
};

export const buildPushRegistrationInput = (subject: PushSubject, device: PushDevice): PushRegistrationInput => {
  const input: PushRegistrationInput = { Platform: device.platform, Token: device.token, DeviceUuid: device.deviceUuid, Prefix: device.prefix };

  addSubjectFields(input, subject);

  return input;
};

/** RegisterDevice answers 200 even when it fails; only these statuses mean the server took the registration. */
const ACCEPTED_REGISTRATION_STATUSES: readonly string[] = ['queued', 'success'];

/** Whether the server took a push registration (native and web alike): a resolved answer is not enough on its own. */
export const isPushRegistrationAccepted = (result: Pick<PushRegistrationResult, 'Status'> | null | undefined): boolean => ACCEPTED_REGISTRATION_STATUSES.includes((result?.Status ?? '').toLowerCase());

/** Registers a push token for the subject (user, unit or IC user). */
export const registerPushDevice = (ctx: ApiContext, subject: PushSubject, device: PushDevice, options?: RequestOptions): Promise<PushRegistrationResult> => {
  const body = buildPushRegistrationInput(subject, device);

  return subject.kind === 'unit' ? registerUnitDevice(ctx, body, options) : registerDevice(ctx, body, options);
};

/** Takes a token off the channels it was registered on (native: iOS/Android; web: browser/desktop). */
export const unregisterPushToken = (ctx: ApiContext, subject: PushSubject, channel: 'native' | 'web', token: { token: string; prefix: string }, options?: RequestOptions): Promise<PushRegistrationResult> => {
  const body: NativePushUnRegistrationInput & WebPushUnRegistrationInput = { Token: token.token, Prefix: token.prefix };

  addSubjectFields(body, subject);

  return channel === 'native' ? unRegisterNativePush(ctx, body, options) : unRegisterWebPush(ctx, body, options);
};
