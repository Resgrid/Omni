/** The three Eventing hubs (omni-plan §7.5). Keys are Omni's names; the hub paths come from the client env. */
export const REALTIME_HUB_KEYS = ['eventing', 'geolocation', 'chat'] as const;
export type RealtimeHubKey = (typeof REALTIME_HUB_KEYS)[number];

// ---- signalr-service (Unit retry budget + Dispatch transport settings) ----

/** Rebuild attempts after a connection closed for good, before the hub is parked until connectivity returns. */
export const SIGNALR_MAX_RECONNECT_ATTEMPTS = 10;
/** Linear backoff step: attempt n waits n × 5 s… */
export const SIGNALR_RECONNECT_INTERVAL_MS = 5000;
/** …capped at 60 s. */
export const SIGNALR_MAX_RECONNECT_DELAY_MS = 60000;
/**
 * How long the client waits for any server message before declaring the connection dead. The client default (30 s)
 * is two server keep-alives; a frozen browser tab or a laptop that briefly slept blows past it (Dispatch).
 */
export const SIGNALR_SERVER_TIMEOUT_MS = 60000;
/** The client's own in-place reconnect schedule, tried before the connection closes and our rebuild loop takes over. */
export const SIGNALR_AUTOMATIC_RECONNECT_DELAYS_MS: readonly number[] = [0, 2000, 5000, 10000, 30000];

/** Linear rebuild delay for an attempt number (1-based). */
export const reconnectDelayForAttempt = (attempt: number): number => Math.min(SIGNALR_RECONNECT_INTERVAL_MS * Math.max(1, attempt), SIGNALR_MAX_RECONNECT_DELAY_MS);

// ---- realtime-store (Responder) ----

/** Group joins (`Connect`, `GeolocationConnect`, chat `Connect`) are retried a few times per connection. */
export const HUB_JOIN_RETRY_MS = 5000;
export const HUB_JOIN_MAX_ATTEMPTS = 3;
/** Chat presence heartbeat; skipped while the chat hub is not connected (Dispatch). */
export const CHAT_HEARTBEAT_INTERVAL_MS = 45000;

// ---- watchdog (BigBoard) ----

export const HUB_WATCHDOG_INTERVAL_MS = 30 * 1000;
/** Repair backoff after a failed repair: doubles from the base up to the cap. */
export const HUB_REPAIR_BASE_BACKOFF_MS = 30 * 1000;
export const HUB_REPAIR_MAX_BACKOFF_MS = 10 * 60 * 1000;

// ---- lifecycle ----

/** Native only: hubs close this long after the app leaves the foreground, so quick app switches keep them. */
export const BACKGROUND_DISCONNECT_GRACE_MS = 2000;
/** Native only: delay before reconnecting on resume, so a resume that bounces straight back is ignored. */
export const RESUME_RECONNECT_DELAY_MS = 1000;

// ---- refetch helpers (IC) ----

/** Trailing debounce for the full incident-command resync a burst of untracked-incident events triggers. */
export const INCIDENT_COMMAND_FULL_SYNC_DEBOUNCE_MS = 2000;

// ---- live locations (Dispatch) ----

/** Unknown pins and reconnect catch-ups arriving within this window share one background refetch. */
export const LIVE_LOCATION_REFRESH_DELAY_MS = 4000;
/**
 * An unknown pin id may request a refetch at most once in this window. The realtime feed covers every entity in the
 * department, including ones this viewer may not see on the map; without the cooldown each push would refetch the map.
 */
export const UNKNOWN_PIN_REFRESH_COOLDOWN_MS = 5 * 60 * 1000;
