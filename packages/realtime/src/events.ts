import type { Capabilities, FeatureModuleId } from '@resgrid/config';

/**
 * Hub event names (Core `Resgrid.Web.Eventing`: Worker.cs, ChatEventKinds, ChatHub, GeolocationBroadcaster) and the
 * per-variant sets this package subscribes (omni-plan §7.5). Events are id-only pings: consumers refetch.
 */

/** Every app: status, staffing, calls, incident command, department, checklists and weather alerts (Core §8.6 item 6). */
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
] as const;

/** Dispatch console extras: unit crew changes, check-ins of others, conditional run-card requirements (two args). */
export const DISPATCH_EVENTING_EVENTS = ['unitActiveRolesUpdated', 'checkInUpdated', 'outstandingRequirementsUpdated'] as const;

/** BigBoard dashboard: unit status alerts. */
export const DASHBOARD_EVENTING_EVENTS = ['unitStatusAlertUpdated'] as const;

export const ALL_EVENTING_EVENTS = [...COMMON_EVENTING_EVENTS, ...DISPATCH_EVENTING_EVENTS, ...DASHBOARD_EVENTING_EVENTS] as const;
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
 * - `unitStatusAlertUpdated` — the dashboard module (BigBoard);
 * - chat events only with `realtime.chatHub`.
 */
export function resolveRealtimeFeatures(variant: RealtimeVariantInput): RealtimeFeatures {
  const { capabilities, modules } = variant;
  const eventingEvents: EventingEventName[] = [...COMMON_EVENTING_EVENTS];
  if (modules.includes('dispatch-console')) eventingEvents.push('unitActiveRolesUpdated');
  if (capabilities.checkIn.others) eventingEvents.push('checkInUpdated');
  if (capabilities.calls.runCards) eventingEvents.push('outstandingRequirementsUpdated');
  if (modules.includes('dashboard')) eventingEvents.push('unitStatusAlertUpdated');

  return {
    eventingEvents,
    chatHub: capabilities.realtime.chatHub,
    chatEvents: capabilities.realtime.chatHub ? CHAT_EVENTS : [],
    hubWatchdog: capabilities.realtime.hubWatchdog,
    geoHubDefault: capabilities.location.geoHubDefault,
    coalescedBoardRefresh: capabilities.incidentCommand === 'command',
  };
}
