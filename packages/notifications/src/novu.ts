/**
 * Novu inbox configuration (omni-plan §7.6; `@novu/react-native` 3.11 for every variant). The subscriber id and its
 * HMAC hash follow the variant's push subject:
 *
 * | subject  | subscriber id             | hash                                         | apps                      |
 * |----------|---------------------------|----------------------------------------------|---------------------------|
 * | `user`   | `{code}_User_{userId}`    | rights `NovuSubscriberHash`                  | Responder, Dispatch, BigBoard |
 * | `unit`   | `{code}_Unit_{unitId}`    | `Inbox/GetUnitSubscriberHash`                | Unit                      |
 * | `icUser` | `{code}_IC_User_{userId}` | rights `NovuICSubscriberHash`                | IC                        |
 *
 * Novu refuses an inbox session without the hash once HMAC is enforced (BigBoard passed none — fixed here).
 */
import type { NotificationsSession, PushSubjectKind } from './configure';
import { type NotificationTarget, type ParseEventCodeOptions, resolveNotificationTarget } from './event-codes';

/** The Novu fields of Core's `Config/GetConfig`. */
export interface NovuServerConfig {
  NovuApplicationId?: string | null;
  NovuBackendApiUrl?: string | null;
  NovuSocketUrl?: string | null;
}

/** What the always-mounted provider receives. `ready` gates every inbox UI (it must not fetch against placeholders). */
export interface NovuInboxConfig {
  ready: boolean;
  subscriberId: string;
  subscriberHash?: string;
  applicationIdentifier: string;
  apiUrl: string;
  socketUrl: string;
}

/** Placeholder credentials the provider mounts with until config, rights (and the unit hash) arrive (Responder's fix). */
export const NOVU_PLACEHOLDER_CONFIG: NovuInboxConfig = Object.freeze({ ready: false, subscriberId: '', applicationIdentifier: '', apiUrl: '', socketUrl: '' });

export interface NovuSubscriberInput {
  departmentCode?: string | null;
  userId?: string | null;
  unitId?: string | null;
}

/** The Novu subscriber id for the variant's subject, or null when the parts are missing (or the variant has none). */
export const buildNovuSubscriberId = (subject: PushSubjectKind, input: NovuSubscriberInput): string | null => {
  const code = input.departmentCode?.trim();
  if (!code) return null;
  if (subject === 'unit') {
    const unitId = input.unitId?.trim();
    return unitId ? `${code}_Unit_${unitId}` : null;
  }
  const userId = input.userId?.trim();
  if (!userId) return null;
  if (subject === 'user') return `${code}_User_${userId}`;
  if (subject === 'icUser') return `${code}_IC_User_${userId}`;
  return null;
};

/** The HMAC hash matching `buildNovuSubscriberId` for the subject. */
export const selectNovuSubscriberHash = (subject: PushSubjectKind, input: { rights?: NotificationsSession['rights']; unitSubscriberHash?: string | null }): string | undefined => {
  const value = subject === 'user' ? input.rights?.NovuSubscriberHash : subject === 'icUser' ? input.rights?.NovuICSubscriberHash : subject === 'unit' ? input.unitSubscriberHash : undefined;
  return typeof value === 'string' && value.length > 0 ? value : undefined;
};

/**
 * Novu on web/Electron is on by default; a variant can turn it off (Dispatch/BigBoard skipped Novu on web for
 * rendering issues).
 */
export const isNovuInboxEnabled = (options: { isWeb: boolean; enableOnWeb?: boolean }): boolean => !options.isWeb || options.enableOnWeb !== false;

export interface ResolveNovuInboxConfigInput {
  subject: PushSubjectKind;
  session: NotificationsSession | null;
  unitId?: string | null;
  unitSubscriberHash?: string | null;
  /** Unit only: the hash lookup has an outcome (so the inbox opens once, with the hash). */
  unitHashSettled?: boolean;
  config: NovuServerConfig | null | undefined;
  isWeb?: boolean;
  enableOnWeb?: boolean;
}

/** Real credentials once everything is known, else the placeholders (never a half-built subscriber). */
export const resolveNovuInboxConfig = (input: ResolveNovuInboxConfigInput): NovuInboxConfig => {
  if (!isNovuInboxEnabled({ isWeb: input.isWeb === true, ...(input.enableOnWeb === undefined ? {} : { enableOnWeb: input.enableOnWeb }) })) {
    return NOVU_PLACEHOLDER_CONFIG;
  }
  const applicationIdentifier = input.config?.NovuApplicationId?.trim() ?? '';
  const apiUrl = input.config?.NovuBackendApiUrl?.trim() ?? '';
  const socketUrl = input.config?.NovuSocketUrl?.trim() ?? '';
  if (!applicationIdentifier || !apiUrl || !socketUrl || !input.session) {
    return NOVU_PLACEHOLDER_CONFIG;
  }
  const subscriberId = buildNovuSubscriberId(input.subject, { departmentCode: input.session.departmentCode, userId: input.session.userId, unitId: input.unitId ?? null });
  if (!subscriberId) {
    return NOVU_PLACEHOLDER_CONFIG;
  }
  if (input.subject === 'unit' && input.unitHashSettled !== true) {
    return NOVU_PLACEHOLDER_CONFIG;
  }
  const subscriberHash = selectNovuSubscriberHash(input.subject, { rights: input.session.rights ?? null, unitSubscriberHash: input.unitSubscriberHash ?? null });
  return { ready: true, subscriberId, ...(subscriberHash ? { subscriberHash } : {}), applicationIdentifier, apiUrl, socketUrl };
};

/** A Novu inbox item: only its `data` survives from the push (the Novu bridge copies the event code into it). */
export interface NovuInboxItemLike {
  data?: Record<string, unknown> | null;
}

/** Where an inbox item points (Unit's inbox reference, generalized to every code), or null. */
export const inboxItemTarget = (item: NovuInboxItemLike | null | undefined, options: ParseEventCodeOptions = {}): NotificationTarget | null => {
  const data = item?.data;
  if (!data || typeof data !== 'object') return null;
  return resolveNotificationTarget(data.eventCode ?? data.eventId, options);
};
