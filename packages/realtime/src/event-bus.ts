import { logger } from '@resgrid/core/logging/logger';

import type { RealtimeHubKey } from './constants';
import type { LiveLocation } from './live-locations';

/**
 * Typed consumer events (omni-plan §7.5). The realtime store translates hub messages into these: ids are normalized
 * to strings (Core sends `CallId.ToString()`, older producers numbers or objects) and every further hub argument is
 * forwarded untouched. Events are id-only pings — refetch, bypassing caches (`createRealtimeRefetch`).
 */

/** An id-only ping: the normalized id (null when the server sent none) plus any further hub arguments. */
export type IdEventArgs = [id: string | null, ...rest: unknown[]];
/** A chat event: the hub payload (object or JSON string) plus any further arguments. */
export type ChatEventArgs = [payload: unknown, ...rest: unknown[]];

/** Raised after a hub joined its server group on a new connection. `rejoin` means updates may have been missed. */
export interface HubJoinInfo {
  hub: RealtimeHubKey;
  rejoin: boolean;
  at: number;
}

export interface RealtimeEventMap {
  personnelStatusUpdated: IdEventArgs;
  personnelStaffingUpdated: IdEventArgs;
  unitStatusUpdated: IdEventArgs;
  callsUpdated: IdEventArgs;
  callAdded: IdEventArgs;
  callClosed: IdEventArgs;
  /** The affected incident's call id. */
  incidentCommandUpdated: IdEventArgs;
  departmentUpdated: unknown[];
  checklistUpdated: IdEventArgs;
  weatherAlertReceived: IdEventArgs;
  weatherAlertUpdated: IdEventArgs;
  weatherAlertExpired: IdEventArgs;
  /** Unit id, or "0" for department-wide changes. */
  unitActiveRolesUpdated: IdEventArgs;
  checkInUpdated: IdEventArgs;
  /** Two hub arguments: the id and the requirements payload. */
  outstandingRequirementsUpdated: [id: string | null, payload: unknown, ...rest: unknown[]];
  unitStatusAlertUpdated: IdEventArgs;

  chatMessageReceived: ChatEventArgs;
  chatMessageEdited: ChatEventArgs;
  chatMessageDeleted: ChatEventArgs;
  chatReactionUpdated: ChatEventArgs;
  chatReceiptUpdated: ChatEventArgs;
  chatChannelUpdated: ChatEventArgs;
  chatChannelProvisioned: ChatEventArgs;
  chatModerationApplied: ChatEventArgs;
  chatMessageAckRequired: ChatEventArgs;
  chatThreadUpdated: ChatEventArgs;
  chatbotMessageReceived: ChatEventArgs;
  chatbotTyping: ChatEventArgs;
  chatAccessRevoked: ChatEventArgs;
  chatTyping: ChatEventArgs;
  /** The hub sends `userId, isOnline` as two positional arguments. */
  chatPresenceChanged: [userId: string | null, isOnline: boolean, ...rest: unknown[]];

  /** A parsed geolocation push (unusable payloads are dropped). */
  personnelLocationUpdated: [location: LiveLocation, payload: unknown];
  unitLocationUpdated: [location: LiveLocation, payload: unknown];

  eventingHubJoined: [info: HubJoinInfo];
  geolocationHubJoined: [info: HubJoinInfo];
  /** Chat is armed on a new connection: resync channels and backfill messages. */
  chatHubJoined: [info: HubJoinInfo];
}

export type RealtimeEventName = keyof RealtimeEventMap;
export type RealtimeEventHandler<K extends RealtimeEventName> = (...args: RealtimeEventMap[K]) => void;

type AnyHandler = (...args: unknown[]) => void;

const listeners = new Map<RealtimeEventName, Set<AnyHandler>>();

/** Registers a typed handler. Returns the unsubscribe function. */
export function onRealtimeEvent<K extends RealtimeEventName>(name: K, handler: RealtimeEventHandler<K>): () => void {
  const set = listeners.get(name) ?? new Set<AnyHandler>();
  const entry = handler as unknown as AnyHandler;
  set.add(entry);
  listeners.set(name, set);
  return () => {
    const current = listeners.get(name);
    if (!current) return;
    current.delete(entry);
    if (current.size === 0) listeners.delete(name);
  };
}

/** Delivers an event to every handler; one throwing handler never stops the rest. */
export function emitRealtimeEvent<K extends RealtimeEventName>(name: K, ...args: RealtimeEventMap[K]): void {
  const set = listeners.get(name);
  if (!set) return;
  for (const handler of [...set]) {
    try {
      handler(...(args as unknown[]));
    } catch (error) {
      logger.error({ message: `Realtime event handler failed: ${name}`, context: { error } });
    }
  }
}

export function getRealtimeListenerCount(name?: RealtimeEventName): number {
  if (name) return listeners.get(name)?.size ?? 0;
  let total = 0;
  listeners.forEach((set) => {
    total += set.size;
  });
  return total;
}

/** Test helper. Not for app code: consumers unsubscribe themselves. */
export function clearRealtimeListenersForTests(): void {
  listeners.clear();
}

/**
 * A call/alert/unit id as a string: a non-empty string or a finite number; objects carrying `Id`, `CallId`,
 * `AlertId`, `UnitId` (any casing) are read through. Anything looser would stringify into a plausible-looking id.
 */
export function toRealtimeId(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : null;
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    for (const key of ['Id', 'id', 'CallId', 'callId', 'AlertId', 'alertId', 'UnitId', 'unitId']) {
      const inner = record[key];
      if (typeof inner === 'string' || typeof inner === 'number') return toRealtimeId(inner);
    }
  }
  return null;
}
