// @resgrid/location (layer L3) — one location transmitter for a person or unit target (omni-plan §7.7), location fixes
// as coalesced outbox writes (§8.3/§8.5), the background-task runtime, permission flow and location hooks.
//
// The OS task itself is defined by `@resgrid/location/background-task`, which apps/omni/index.ts imports first; this
// barrel deliberately does not import it.

// Constants
export {
  DEFAULT_HEARTBEAT_INTERVAL_MS,
  DEFAULT_MAX_ACCURACY_METERS,
  DEFAULT_MIN_TRANSMIT_DISTANCE_METERS,
  DEFAULT_MIN_TRANSMIT_INTERVAL_MS,
  LOCATION_PERSON_EVENT,
  LOCATION_TASK_NAME,
  LOCATION_UNIT_EVENT,
  REJECTION_BACKOFF_BASE_MS,
  REJECTION_BACKOFF_MAX_MS,
} from './constants';

// Types
export type {
  FixSource,
  LocationCoords,
  LocationFix,
  LocationOutbox,
  LocationPayload,
  LocationPermissionStatus,
  LocationServerConfig,
  LocationSession,
  LocationSettings,
  LocationTarget,
  LocationWatch,
  LocationWireFields,
  PersonLocationPayload,
  TransmissionTarget,
  UnitLocationPayload,
} from './types';

// Composition root and transmitter
export { configureLocation, type ConfigureLocationOptions, disposeLocation, getLocationTransmitter, resetLocationForTests } from './configure';
export { createLocationTransmitter, defaultLocationSettings, type ForegroundTransmissionPolicy, gateOptionsFor, type LocationCapability, LocationTransmitter, type LocationTransmitterOptions } from './transmitter';

// Background task runtime (the task is defined by '@resgrid/location/background-task')
export { getHeldLocationFix, handleLocationTaskEvent, type LocationTaskBody, type LocationTaskConsumer, type LocationTaskContext, registerBackgroundLocationBootstrap, setLocationTaskConsumer } from './task-runtime';

// Gate, payloads, profiles
export { distanceInMeters, isUsableCoordinate, newestFix } from './geo';
export { coalesceKeyFor, eventTypeFor, targetKeyFor, toWireFields } from './payload';
export { buildTaskOptions, hasSameTaskOptions, LOCATION_PROFILES, type LocationProfile, type LocationProfileId, profileForTarget } from './task-options';
export { LocationTransmissionGate, type LocationTransmissionGateOptions, type TransmissionDecision, type TransmissionRecord } from './transmission-gate';

// Outbox handlers
export { classifyLocationError, type LocationEvent, type LocationHandlerCallbacks, registerLocationOutboxHandlers, type RegisterLocationOutboxHandlersOptions } from './outbox-handlers';

// Permissions and on-demand fixes
export { LOCATION_I18N_FALLBACKS, LOCATION_I18N_KEYS, type LocationI18nKey } from './i18n-keys';
export { acquireLocationFix, getLocationFixErrorMessage, type LocationFixOutcome, type LocationFixResult } from './location-fix';
export {
  getBackgroundLocationPermission,
  getForegroundLocationPermission,
  getLocationPermissionRationale,
  getLocationPermissions,
  type LocationPermissionFlowOptions,
  type LocationPermissionFlowResult,
  type LocationPermissionOutcome,
  type LocationPermissionRationale,
  type LocationPermissionSnapshot,
  type LocationRationaleStep,
  type PermissionAnswer,
  requestBackgroundLocationPermission,
  requestForegroundLocationPermission,
  runLocationPermissionFlow,
} from './permissions';

// Stores
export { type CurrentLocation, getCurrentLocation, getLocationTransmissionStatus, type LocationTransmissionStatus, resetLocationStores, setCurrentLocation, type TransmissionMode } from './location-store';

// Live (realtime) locations for maps
export {
  applyLiveLocations,
  type ApplyLiveLocationsOptions,
  type ApplyLiveLocationsResult,
  changedLivePinIds,
  ingestLiveLocation,
  type LiveLocation,
  type LiveLocationKind,
  type LiveLocations,
  type LiveLocationState,
  liveLocationStore,
  markGeolocationJoined,
  mergeLiveLocation,
  parseLiveLocation,
  PERSONNEL_PIN_TYPE,
  resetLiveLocations,
  toLivePinKey,
  UNIT_PIN_TYPE,
  withLiveLocationsSince,
} from './live-locations';

// Hooks
export { useCurrentLocation } from './hooks/use-current-location';
export { useLocationTransmissionStatus } from './hooks/use-location-transmission-status';
export { LIVE_LOCATION_REFRESH_DELAY_MS, UNKNOWN_PIN_REFRESH_COOLDOWN_MS, useMapGeolocationUpdates, type UseMapGeolocationUpdatesOptions, type UseMapGeolocationUpdatesResult } from './hooks/use-map-geolocation-updates';

// Logger seam
export { setLocationLogger } from './logger';
