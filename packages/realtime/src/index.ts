// @resgrid/realtime (layer L3) — SignalR hubs, realtime event store, reconnect/watchdog/lifecycle and live locations
// for all five Omni apps. Design: docs/architecture/omni-plan.md §7.5 and the resgrid-realtime-push skill.
// Imports only config, models, core and offline (types); auth/token, EventingUrl and department are injected.

// Composition root
export { configureRealtime, getRealtimeFeatures, isChatHubAllowed, type RealtimeDependencies, shouldConnectGeolocationHub } from './realtime-config';

// Constants and event sets
export * from './constants';
export {
  ALL_EVENTING_EVENTS,
  CHAT_CONNECTED_ACK,
  CHAT_EVENTS,
  type ChatEventName,
  COMMON_EVENTING_EVENTS,
  DASHBOARD_EVENTING_EVENTS,
  DISPATCH_EVENTING_EVENTS,
  EVENTING_CONNECTED_ACK,
  type EventingEventName,
  GEOLOCATION_CONNECTED_ACK,
  GEOLOCATION_HUB_EVENTS,
  HUB_METHODS,
  type RealtimeFeatures,
  type RealtimeVariantInput,
  resolveRealtimeFeatures,
} from './events';

// Service
export {
  buildHubUrl,
  type ConnectOptions,
  HUB_CONNECTED_EVENT,
  HUB_DISCONNECTED_EVENT,
  HUB_RECONNECT_EXHAUSTED_EVENT,
  HUB_RECONNECTED_EVENT,
  HUB_RECONNECTING_EVENT,
  type HubConnectConfig,
  HubConnectingState,
  type HubDisconnectInfo,
  isUnloggedHubMethod,
  type RealtimeAuth,
  type SignalREventListener,
  SignalRService,
  signalRService,
  type SignalRServiceDependencies,
} from './signalr-service';

// Typed events
export {
  type ChatEventArgs,
  emitRealtimeEvent,
  getRealtimeListenerCount,
  type HubJoinInfo,
  type IdEventArgs,
  onRealtimeEvent,
  type RealtimeEventHandler,
  type RealtimeEventMap,
  type RealtimeEventName,
  toRealtimeId,
} from './event-bus';

// Store
export {
  type ActiveChatChannel,
  getHubName,
  getWantedHubs,
  type HubSnapshot,
  type HubStatus,
  type OutageHubKey,
  type RealtimeHubOutage,
  type RealtimeHubOutages,
  type RealtimeState,
  teardownRealtime,
  useRealtimeStore,
} from './realtime-store';

// Refetch helpers (id-only pings → cache-bypassing single-flight refetch)
export {
  createDebouncedRealtimeRefetch,
  createIncidentCommandRefresh,
  createKeyedRealtimeRefetch,
  createRealtimeRefetch,
  type IncidentCommandRefresh,
  type IncidentCommandRefreshOptions,
  REALTIME_REFETCH_CONTEXT,
  type RealtimeFetcher,
  type RealtimeRefetchContext,
  subscribeIncidentCommandRefresh,
  subscribeRealtimeRefetch,
} from './refetch';

// Watchdog and lifecycle
export { createRealtimeLifecycle, type RealtimeLifecycleController, type RealtimeLifecycleOptions, type RealtimeSession } from './lifecycle';
export { createHubWatchdog, ensureHubConnections, HubRepairBackoff, type HubWatchdog, type HubWatchdogOptions, isHubWatchdogEnabled } from './watchdog';

// Live locations
export {
  applyLiveLocations,
  type ApplyLiveLocationsOptions,
  type ApplyLiveLocationsResult,
  getChangedLivePinIds,
  getPinEntityId,
  isValidLiveCoordinate,
  type LiveLocation,
  type LiveLocations,
  MAP_PIN_TYPE,
  parsePersonnelLocationUpdate,
  parseUnitLocationUpdate,
  toLivePinKey,
  upsertLiveLocation,
} from './live-locations';

// React hooks
export { useLiveLocation, useLiveLocations, useMapLiveLocations, type UseMapLiveLocationsOptions, type UseMapLiveLocationsResult } from './hooks/use-live-locations';
export { useRealtimeEvent } from './hooks/use-realtime-event';
export { useRealtimeLifecycle, type UseRealtimeLifecycleOptions } from './hooks/use-realtime-lifecycle';
export { useIncidentCommandRefresh, useRealtimeRefetch } from './hooks/use-realtime-refetch';
export { getRealtimeStatus, type RealtimeStatus, useRealtimeStatus } from './hooks/use-realtime-status';
