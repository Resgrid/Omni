// Shared constants for @resgrid/location. Kept free of imports so the app entry can load them cheaply.

/**
 * The OS task name. Frozen: the config plugin registers it (`expo-task-manager` plugin options) and installed apps hold
 * a registration under this name — renaming it would orphan the running task on upgrade.
 */
export const LOCATION_TASK_NAME = 'location-updates';

/** Outbox event type for a personnel location fix (`POST /PersonnelLocation/SetPersonLocation`). */
export const LOCATION_PERSON_EVENT = 'location.person';

/** Outbox event type for a unit location fix (`POST /UnitLocation/SetUnitLocation`). */
export const LOCATION_UNIT_EVENT = 'location.unit';

/** Minimum gap between transmissions, whichever consumer produced the fix (Responder and Unit: 15 s). */
export const DEFAULT_MIN_TRANSMIT_INTERVAL_MS = 15_000;

/** Movement below this since the last transmission is GPS jitter (Responder and Unit: 25 m) unless the server says otherwise. */
export const DEFAULT_MIN_TRANSMIT_DISTANCE_METERS = 25;

/** A target that has not moved is re-reported this often at most (Responder heartbeat / Unit keep-alive: 5 min). */
export const DEFAULT_HEARTBEAT_INTERVAL_MS = 5 * 60_000;

/** Floor for a heartbeat derived from a very short server stale threshold. */
export const MIN_HEARTBEAT_INTERVAL_MS = 60_000;

/** Fraction of the server stale threshold the heartbeat fires at, so a parked target's marker never ages off between reports. */
export const HEARTBEAT_STALE_FRACTION = 0.8;

/** Fixes worse than this are kept locally but never transmitted (Responder). */
export const DEFAULT_MAX_ACCURACY_METERS = 100;

/** First backoff after the server refused a fix (4xx) for a target; doubles per rejection (Unit). */
export const REJECTION_BACKOFF_BASE_MS = 30_000;

/** Ceiling of the rejection backoff (Unit). */
export const REJECTION_BACKOFF_MAX_MS = 15 * 60_000;

/** How long a background task run waits for the outbox to deliver what it queued (the OS gives a task ~30 s). */
export const BACKGROUND_DRAIN_TIMEOUT_MS = 20_000;

/** How long a background task run waits for the headless bootstrap to make the transmitter available. */
export const BOOTSTRAP_TIMEOUT_MS = 10_000;
