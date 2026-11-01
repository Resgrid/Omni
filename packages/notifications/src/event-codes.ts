/**
 * Push event codes (resgrid-realtime-push skill). Core puts an `eventCode` in every push and inbox item:
 *
 * | code                  | meaning                                  | target kind         |
 * |-----------------------|------------------------------------------|---------------------|
 * | `C{callId}` / `C:{id}`| call dispatch (critical)                 | call                |
 * | `NC:{callId}`         | call closed (ordinary notification)      | call (closed)       |
 * | `M{id}` / `M:{id}`    | inbox message (incl. weather alerts)     | message             |
 * | `N{id}` / `N:{id}`    | notification                             | notification        |
 * | `t:{channelId}`       | chat DM (incl. IncidentCommanderLine)    | chat (direct)       |
 * | `g:{channelId}`       | chat group channel                       | chat (group)        |
 * | `CT:{token}`          | communication test                       | communicationTest   |
 * | `NWO:{workOrderId}`   | work order                               | workOrder           |
 * | `NA:{requestId}`      | sign-in approval (MFA / passkey)         | signInApproval      |
 * | `W:{alertId}`         | weather alert                            | weatherAlert        |
 *
 * Parsing (Responder baseline): split on the FIRST ':' so an id containing one survives; whole multi-letter
 * prefixes (`nc`, `ct`, `nwo`, `na`) win over the first character; otherwise the first character decides. The
 * colon-less legacy form is one type letter followed by digits only (`C1234`), so a multi-letter code that lost its
 * colon (`CT123`) is never read as a call. Every id must pass `isSafeRouteId` before it can become a target.
 */
import { isSafeRouteId } from '@resgrid/core';

export type NotificationKind = 'call' | 'message' | 'notification' | 'chat' | 'chatbot' | 'weatherAlert' | 'workOrder' | 'signInApproval' | 'communicationTest';

/** Where a notification points. The variant maps it to a route (`resolveRoute`) — or to nothing when it lacks the screen. */
export interface NotificationTarget {
  kind: NotificationKind;
  /** Route-safe id (checked with `isSafeRouteId`). */
  id: string;
  /** `NC:` — the call has been closed. */
  closed?: boolean;
  /** Chat channel flavour: `t:` direct (incl. the commander line) or `g:` group. */
  chatType?: 'direct' | 'group';
}

/** The iOS category / web urgency bucket Core derives from the event code's first letter. */
export type PushCategory = 'calls' | 'messages' | 'notifications' | 'chats';

export interface ParsedEventCode {
  eventCode: string;
  /** Lower-cased prefix before the first ':' (or the legacy type letter); '' when none. */
  prefix: string;
  kind: NotificationKind | 'unknown';
  /** The raw id after the prefix (may be unsafe — only `target` is safe to route). */
  id: string;
  /** Null when the code is unknown or its id fails `isSafeRouteId`. */
  target: NotificationTarget | null;
  category: PushCategory;
  /** Core treats every code starting with `C` as a critical call alert (critical sound, high priority, sticky). */
  critical: boolean;
}

export interface ParseEventCodeOptions {
  /** Chat channels that are the department assistant open the chatbot screen instead of the conversation. */
  isChatbotChannel?: (channelId: string) => boolean;
}

/** Whole prefixes, checked before the first character so `CT:` is not a call and `NWO:` is not a notification. */
export const WHOLE_PREFIX_KINDS: Readonly<Record<string, NotificationKind>> = {
  nc: 'call',
  ct: 'communicationTest',
  nwo: 'workOrder',
  na: 'signInApproval',
};

/** First character of the code. */
export const FIRST_CHAR_KINDS: Readonly<Record<string, NotificationKind>> = {
  c: 'call',
  m: 'message',
  n: 'notification',
  t: 'chat',
  g: 'chat',
  w: 'weatherAlert',
};

const has = (record: Readonly<Record<string, NotificationKind>>, key: string): boolean => Object.prototype.hasOwnProperty.call(record, key);

/** Mirrors Core (`NovuProvider` iOS category / web urgency): m messages, c calls, n notifications, t/g chats, else notifications. */
export const categoryForEventCode = (eventCode: string): PushCategory => {
  const first = eventCode.trim().charAt(0).toLowerCase();
  if (first === 'm') return 'messages';
  if (first === 'c') return 'calls';
  if (first === 't' || first === 'g') return 'chats';
  return 'notifications';
};

/** Core's first-letter rule: anything starting with `C` is a critical call alert. */
export const isCriticalEventCode = (eventCode: string): boolean => eventCode.trim().charAt(0).toLowerCase() === 'c';

const buildTarget = (kind: NotificationKind, prefix: string, id: string, options: ParseEventCodeOptions): NotificationTarget | null => {
  if (!isSafeRouteId(id)) return null;
  if (kind === 'call') return prefix === 'nc' ? { kind, id, closed: true } : { kind, id };
  if (kind === 'chat') {
    let chatbot = false;
    try {
      chatbot = options.isChatbotChannel?.(id) === true;
    } catch {
      chatbot = false;
    }
    if (chatbot) return { kind: 'chatbot', id };
    return { kind, id, chatType: prefix.charAt(0) === 't' ? 'direct' : 'group' };
  }
  return { kind, id };
};

export const parseEventCode = (eventCode: unknown, options: ParseEventCodeOptions = {}): ParsedEventCode => {
  const code = typeof eventCode === 'string' ? eventCode.trim() : '';
  let prefix = '';
  let id = '';
  let kind: NotificationKind | 'unknown' = 'unknown';

  const separatorIndex = code.indexOf(':');
  if (separatorIndex > 0) {
    prefix = code.slice(0, separatorIndex).toLowerCase();
    id = code.slice(separatorIndex + 1);
    if (has(WHOLE_PREFIX_KINDS, prefix)) kind = WHOLE_PREFIX_KINDS[prefix];
    else if (has(FIRST_CHAR_KINDS, prefix.charAt(0))) kind = FIRST_CHAR_KINDS[prefix.charAt(0)];
  } else {
    // Legacy colon-less form: Core still sends dispatches as "C{callId}", messages as "M{id}", notifications as "N{id}".
    const legacy = /^([A-Za-z])(\d+)$/.exec(code);
    if (legacy) {
      const letter = legacy[1].toLowerCase();
      if (has(FIRST_CHAR_KINDS, letter)) {
        prefix = letter;
        id = legacy[2];
        kind = FIRST_CHAR_KINDS[letter];
      }
    }
  }

  return {
    eventCode: code,
    prefix,
    kind,
    id: kind === 'unknown' ? '' : id,
    target: kind === 'unknown' ? null : buildTarget(kind, prefix, id, options),
    category: categoryForEventCode(code),
    critical: isCriticalEventCode(code),
  };
};

/** The target for an event code, or null when it is unknown or its id is unsafe. */
export const resolveNotificationTarget = (eventCode: unknown, options: ParseEventCodeOptions = {}): NotificationTarget | null => parseEventCode(eventCode, options).target;

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord => !!value && typeof value === 'object' && !Array.isArray(value);

/** The parts of an expo-notifications `NotificationRequest` the extractor reads (structural, so web can use it too). */
export interface NotificationRequestLike {
  content: { data?: unknown; title?: string | null; body?: string | null };
  trigger?: unknown;
}

/**
 * Pulls the event code (and the record that carried it) out of a notification request. On Android the FCM data
 * payload is `content.data`; on iOS expo-notifications maps only the APNs custom key `body` to `content.data`, and
 * older Core payloads carry `eventCode` at the top level or inside `aps` — so fall back to the raw trigger payload
 * (`payload`, `payload.body`, `payload.aps`).
 */
export const extractPushNotificationData = (request: NotificationRequestLike): { eventCode: string | undefined; data: UnknownRecord } => {
  const contentData = request.content.data;
  if (isRecord(contentData) && typeof contentData.eventCode === 'string') {
    return { eventCode: contentData.eventCode, data: contentData };
  }

  const trigger = request.trigger;
  const payload = isRecord(trigger) ? trigger.payload : undefined;
  if (isRecord(payload)) {
    for (const candidate of [payload, payload.body, payload.aps]) {
      if (isRecord(candidate) && typeof candidate.eventCode === 'string') {
        return { eventCode: candidate.eventCode, data: candidate };
      }
    }
  }

  return { eventCode: undefined, data: isRecord(contentData) ? contentData : {} };
};
