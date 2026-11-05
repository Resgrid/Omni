import { DEFAULT_MAX_ACCURACY_METERS } from './constants';
import { createObservableStore } from './observable';
import type { FixSource, LocationFix, LocationPermissionStatus, TransmissionTarget } from './types';

/** The device's own latest position (not persisted: a cold start must not show yesterday's position as current). */
export interface CurrentLocation {
  latitude: number;
  longitude: number;
  heading: number | null;
  accuracy: number | null;
  speed: number | null;
  altitude: number | null;
  /** Fix time, epoch ms. */
  timestamp: number;
  source: FixSource;
}

export const currentLocationStore = createObservableStore<CurrentLocation | null>(null);

/**
 * When a fix last confirmed the stored position, epoch ms: its own fix time, or a later identical fix's. Kept with the
 * position (replaced whenever it is), never taken from another fix, so an older cached fix replacing a newer position
 * cannot pass as recent.
 */
let positionConfirmedAt: number | null = null;

/**
 * Records a fix locally, from every source (watcher, task, browser, on-demand). iOS ignores `timeInterval` on the
 * watcher, so a stationary device delivers identical fixes many times a second; notifying every subscriber at that rate
 * ended in "Maximum update depth exceeded" (Unit's store fix). A fix that changes nothing but its timestamp is not
 * stored again; it only confirms the stored position.
 */
export function setCurrentLocation(fix: LocationFix, source: FixSource): void {
  const { latitude, longitude, heading, accuracy, speed, altitude } = fix.coords;
  const current = currentLocationStore.getState();
  if (current && current.latitude === latitude && current.longitude === longitude && current.heading === heading && current.accuracy === accuracy && current.speed === speed && current.altitude === altitude) {
    positionConfirmedAt = Math.max(positionConfirmedAt ?? current.timestamp, fix.timestamp);

    return;
  }
  currentLocationStore.setState({ latitude, longitude, heading, accuracy, speed, altitude, timestamp: fix.timestamp, source });
  positionConfirmedAt = fix.timestamp;
}

export function getCurrentLocation(): CurrentLocation | null {
  return currentLocationStore.getState();
}

/** Every new position (turn-by-turn navigation follows the device fix by fix). Returns the unsubscribe. */
export function subscribeCurrentLocation(listener: (location: CurrentLocation | null) => void): () => void {
  return currentLocationStore.subscribe((state) => listener(state));
}

/** As a fix (heartbeat fallback when the OS has nothing cached). */
export function currentLocationAsFix(): LocationFix | null {
  const current = currentLocationStore.getState();
  if (!current) return null;
  return {
    coords: { latitude: current.latitude, longitude: current.longitude, heading: current.heading, accuracy: current.accuracy, speed: current.speed, altitude: current.altitude, altitudeAccuracy: null },
    timestamp: current.timestamp,
  };
}

/**
 * - `stopped`: not tracking (signed out, or never started).
 * - `foreground`: the foreground watcher delivers fixes; `background-task`: the OS task does (it also covers the
 *   foreground for the personal profile); `web`: browser geolocation.
 * - `permission-denied`: tracking was requested but location access is refused.
 * - `unavailable`: no location on this device/browser.
 */
export type TransmissionMode = 'stopped' | 'foreground' | 'background-task' | 'web' | 'permission-denied' | 'unavailable';

export interface LocationTransmissionStatus {
  target: TransmissionTarget;
  mode: TransmissionMode;
  /** Tracking requested by the session (signed in, start called). */
  tracking: boolean;
  watcherActive: boolean;
  backgroundTaskRegistered: boolean;
  foregroundPermission: LocationPermissionStatus;
  backgroundPermission: LocationPermissionStatus;
  /** Whether the latest fix was allowed to go out under the current settings and app state (null before the first fix). */
  transmissionAllowed: boolean | null;
  lastFixAt: number | null;
  /** Last fix handed to the outbox. */
  lastQueuedAt: number | null;
  /** Last fix the server acknowledged. */
  lastDeliveredAt: number | null;
  /** Last fix the server refused (dead-lettered). */
  lastRejectedAt: number | null;
  /** No fix is queued for this target before this time (repeated server refusals). */
  backoffUntil: number | null;
  /** A queued fix has not been acknowledged yet (offline, or a send in flight). */
  awaitingDelivery: boolean;
}

export const initialTransmissionStatus = (target: TransmissionTarget): LocationTransmissionStatus => ({
  target,
  mode: 'stopped',
  tracking: false,
  watcherActive: false,
  backgroundTaskRegistered: false,
  foregroundPermission: 'undetermined',
  backgroundPermission: 'undetermined',
  transmissionAllowed: null,
  lastFixAt: null,
  lastQueuedAt: null,
  lastDeliveredAt: null,
  lastRejectedAt: null,
  backoffUntil: null,
  awaitingDelivery: false,
});

export const transmissionStatusStore = createObservableStore<LocationTransmissionStatus>(initialTransmissionStatus('none'));

/** Merges a patch; a patch that changes nothing notifies nobody. */
export function patchTransmissionStatus(patch: Partial<LocationTransmissionStatus>): void {
  transmissionStatusStore.setState((current) => {
    const keys = Object.keys(patch) as (keyof LocationTransmissionStatus)[];
    return keys.some((key) => !Object.is(current[key], patch[key])) ? { ...current, ...patch } : current;
  });
}

export function getLocationTransmissionStatus(): LocationTransmissionStatus {
  return transmissionStatusStore.getState();
}

export interface RecentLocationOptions {
  /** How long ago a fix must have confirmed the position. */
  maxAgeMs: number;
  /** Worst accuracy accepted, in meters (default DEFAULT_MAX_ACCURACY_METERS); a fix that reports none is accepted. */
  maxAccuracyMeters?: number;
  /** Epoch ms. */
  now?: number;
}

/**
 * The device's own position when a fix confirmed it within `maxAgeMs` and it is accurate enough, else null. A repeated
 * identical fix does not replace the stored one (setCurrentLocation) but confirms it, so a device standing still keeps a
 * recent position.
 */
export function getRecentLocation({ maxAgeMs, maxAccuracyMeters = DEFAULT_MAX_ACCURACY_METERS, now = Date.now() }: RecentLocationOptions): CurrentLocation | null {
  const current = currentLocationStore.getState();

  if (!current) return null;

  if (current.accuracy !== null && current.accuracy > maxAccuracyMeters) return null;

  const confirmedAt = Math.max(current.timestamp, positionConfirmedAt ?? 0);

  return now - confirmedAt <= maxAgeMs ? current : null;
}

/** Test helper and sign-out: forget the position and status. */
export function resetLocationStores(target: TransmissionTarget = 'none'): void {
  currentLocationStore.setState(null);
  positionConfirmedAt = null;
  transmissionStatusStore.setState(initialTransmissionStatus(target));
}
