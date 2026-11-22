import type { Capabilities, FeatureModuleId } from '@resgrid/config';

/**
 * Hub event names (Core `Resgrid.Web.Eventing`: Worker.cs, ChatEventKinds, ChatHub, GeolocationBroadcaster) and the
 * per-variant sets this package subscribes (omni-plan §7.5). Events are id-only pings: consumers refetch.
 */

/**
 * Every app: status, staffing, calls, incident command, department, checklists and weather alerts (Core §8.6 item 6), and a
 * call's Enhanced AI destination advice (every app opens call detail; Core EventingTypes 18, M0323).
 */
export const COMMON_EVENTING_EVENTS = [
  'personnelStatusUpdated',
  'personnelStaffingUpdated',
  'unitStatusUpdated',
  'callsUpdated',
  'callAdded',
  'callClosed',
  'incidentCommandUpdated',
  'departmentUpdated',
  'checklistUpdated',
  'weatherAlertReceived',
  'weatherAlertUpdated',
  'weatherAlertExpired',
  'aiDestinationAdviceUpdated',
] as const;

/** Dispatch console extras: unit crew changes, check-ins of others, conditional run-card requirements (two args). */
export const DISPATCH_EVENTING_EVENTS = ['unitActiveRolesUpdated', 'checkInUpdated', 'outstandingRequirementsUpdated'] as const;

/**
 * Recurring call alerts changed (`calls.recurringCalls`, Core M0320): the schedule id and a small payload
 * `{ alertId, kind, raised }` — an id-only ping, so consumers reload the alert list.
 */
export const RECURRING_CALL_EVENTING_EVENTS = ['recurringCallAlertsUpdated'] as const;

/**
 * The dispatcher desk changed (`calls.dispatcherDesk`, Core M0324, EventingTypes 19/20), sent to the department group:
 * `dispatcherDeskUpdated` — a dispatcher's presence (the user id, then `{ userId, state }`); `dispatcherQueueUpdated` — a
 * routed item (the item id, then `{ itemId, state, assignedUserId, kind }`); `intakeConversationUpdated` — an intake text
 * thread (Core M0325, EventingTypes 21: the call id, then `{ conversationId, state, handler }`), which the desk shows on the
 * item linked to it. Ids and states only, never message content: consumers reload the desk or the item.
 */
export const DISPATCHER_DESK_EVENTING_EVENTS = ['dispatcherDeskUpdated', 'dispatcherQueueUpdated', 'intakeConversationUpdated'] as const;

/** Unit status timer acknowledgements (one unit acknowledged, muted or cleared). */
export const UNIT_STATUS_ALERT_EVENTING_EVENTS = ['unitStatusAlertUpdated'] as const;

/**
 * Modules whose screens show unit status timers: the dashboard (BigBoard) and the dispatch console (Dispatch) for every
 * unit, the unit status console (Unit) for its own unit.
 */
export const UNIT_STATUS_ALERT_MODULES: readonly FeatureModuleId[] = ['dashboard', 'dispatch-console', 'unit-status'];

/** Whether an app with these modules shows unit status timers (and so subscribes `unitStatusAlertUpdated`). */
export const showsUnitStatusAlerts = (modules: readonly FeatureModuleId[]): boolean => modules.some((module) => UNIT_STATUS_ALERT_MODULES.includes(module));

/** Live ETAs of units navigating in the Unit app (MapLibre plan §9.4): ids and state only (two args), never the ETA. */
export const NAVIGATION_EVENTING_EVENTS = ['unitNavigationUpdated'] as const;

/** Modules whose screens show navigating units' live ETAs: the dispatch console (Dispatch) and the dashboard (BigBoard). */
export const NAVIGATION_ETA_MODULES: readonly FeatureModuleId[] = ['dispatch-console', 'dashboard'];

/** Whether an app with these modules shows live ETAs (and so subscribes `unitNavigationUpdated`). */
export const showsNavigationEtas = (modules: readonly FeatureModuleId[]): boolean => modules.some((module) => NAVIGATION_ETA_MODULES.includes(module));

export const ALL_EVENTING_EVENTS = [
  ...COMMON_EVENTING_EVENTS,
  ...DISPATCH_EVENTING_EVENTS,
  ...RECURRING_CALL_EVENTING_EVENTS,
  ...DISPATCHER_DESK_EVENTING_EVENTS,
  ...UNIT_STATUS_ALERT_EVENTING_EVENTS,
  ...NAVIGATION_EVENTING_EVENTS,
] as const;
export type EventingEventName = (typeof ALL_EVENTING_EVENTS)[number];

export const CHAT_EVENTS = [
  'chatMessageReceived',
  'chatMessageEdited',
  'chatMessageDeleted',
  'chatReactionUpdated',
  'chatReceiptUpdated',
  'chatChannelUpdated',
  'chatChannelProvisioned',
  'chatModerationApplied',
  'chatMessageAckRequired',
  'chatThreadUpdated',
  'chatbotMessageReceived',
  'chatbotTyping',
  'chatAccessRevoked',
  'chatTyping',
  'chatPresenceChanged',
] as const;
export type ChatEventName = (typeof CHAT_EVENTS)[number];

/** Geolocation hub pushes (wire names); surfaced to consumers as `unitLocationUpdated` / `personnelLocationUpdated`. */
export const GEOLOCATION_HUB_EVENTS = ['onPersonnelLocationUpdated', 'onUnitLocationUpdated'] as const;

/** Server acknowledgements of a group join, sent to the caller only. */
export const EVENTING_CONNECTED_ACK = 'onConnected';
export const GEOLOCATION_CONNECTED_ACK = 'onGeolocationConnect';
export const CHAT_CONNECTED_ACK = 'onChatConnected';

/** Client → server hub methods. Argument counts must match the server signature exactly (no optional args). */
export const HUB_METHODS = {
  eventingConnect: 'Connect',
  geolocationConnect: 'GeolocationConnect',
  chatConnect: 'Connect',
  chatHeartbeat: 'Heartbeat',
  chatSetActiveChannel: 'SetActiveChannel',
} as const;

/** The parts of a variant manifest that decide what realtime does. */
export interface RealtimeVariantInput {
  capabilities: Pick<Capabilities, 'realtime' | 'location' | 'checkIn' | 'calls' | 'incidentCommand'>;
  modules: readonly FeatureModuleId[];
}

export interface RealtimeFeatures {
  eventingEvents: readonly EventingEventName[];
  chatHub: boolean;
  chatEvents: readonly ChatEventName[];
  hubWatchdog: boolean;
  /** Whether the geolocation hub connects when the user has not set the realtime-geolocation preference. */
  geoHubDefault: boolean;
  /** IC: incident-command events refresh one board (coalesced) and debounce a full resync for untracked incidents. */
  coalescedBoardRefresh: boolean;
}

/**
 * Per-variant event sets from capabilities and modules (never from the variant id):
 * - `unitActiveRolesUpdated` — the dispatch console module;
 * - `checkInUpdated` — apps that watch other people's check-ins (`checkIn.others`: Dispatch, IC);
 * - `outstandingRequirementsUpdated` — conditional run cards (`calls.runCards`);
 * - `recurringCallAlertsUpdated` — recurring calls (`calls.recurringCalls`);
 * - `dispatcherDeskUpdated`, `dispatcherQueueUpdated`, `intakeConversationUpdated` — the dispatcher desk (`calls.dispatcherDesk`);
 * - `unitStatusAlertUpdated` — modules that show unit status timers ({@link UNIT_STATUS_ALERT_MODULES}: BigBoard, Dispatch, Unit);
 * - `unitNavigationUpdated` — modules that show live ETAs ({@link NAVIGATION_ETA_MODULES}: Dispatch, BigBoard);
 * - chat events only with `realtime.chatHub`.
 */
export function resolveRealtimeFeatures(variant: RealtimeVariantInput): RealtimeFeatures {
  const { capabilities, modules } = variant;
  const eventingEvents: EventingEventName[] = [...COMMON_EVENTING_EVENTS];
  if (modules.includes('dispatch-console')) eventingEvents.push('unitActiveRolesUpdated');
  if (capabilities.checkIn.others) eventingEvents.push('checkInUpdated');
  if (capabilities.calls.runCards) eventingEvents.push('outstandingRequirementsUpdated');

  if (capabilities.calls.recurringCalls) eventingEvents.push('recurringCallAlertsUpdated');

  if (capabilities.calls.dispatcherDesk) eventingEvents.push(...DISPATCHER_DESK_EVENTING_EVENTS);
  if (showsUnitStatusAlerts(modules)) eventingEvents.push('unitStatusAlertUpdated');
  if (showsNavigationEtas(modules)) eventingEvents.push('unitNavigationUpdated');

  return {
    eventingEvents,
    chatHub: capabilities.realtime.chatHub,
    chatEvents: capabilities.realtime.chatHub ? CHAT_EVENTS : [],
    hubWatchdog: capabilities.realtime.hubWatchdog,
    geoHubDefault: capabilities.location.geoHubDefault,
    coalescedBoardRefresh: capabilities.incidentCommand === 'command',
  };
}
