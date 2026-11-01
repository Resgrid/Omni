import type { GetConfigResultData } from '@resgrid/models';
import type { DrainOptions, DrainResult, EnqueueInput, EnqueueResult } from '@resgrid/offline';

/** Who this device reports: the signed-in person (Responder), the active unit (Unit), or nobody (IC, Dispatch, BigBoard). */
export type LocationTarget = 'person' | 'unit';
export type TransmissionTarget = LocationTarget | 'none';

/** One position, shaped like expo-location's `LocationObject` so native, task and browser fixes are interchangeable. */
export interface LocationCoords {
  latitude: number;
  longitude: number;
  altitude: number | null;
  accuracy: number | null;
  altitudeAccuracy: number | null;
  heading: number | null;
  speed: number | null;
}

export interface LocationFix {
  coords: LocationCoords;
  /** Fix time, epoch ms (UTC). */
  timestamp: number;
  mocked?: boolean;
}

/** Where a fix came from. */
export type FixSource = 'watcher' | 'task' | 'web' | 'heartbeat' | 'deferred' | 'on-demand';

/**
 * User/device settings the transmitter obeys (owned and persisted by the data layer, injected here).
 * - `realtimeGeolocation`: Unit — governs foreground transmission; everywhere — receiving others' positions (geo hub).
 *   Default per variant: `capabilities.location.geoHubDefault` (Responder off, Unit on).
 * - `backgroundGeolocation`: transmit while backgrounded (only where `capabilities.location.background`).
 */
export interface LocationSettings {
  realtimeGeolocation: boolean;
  backgroundGeolocation: boolean;
}

/** Department thresholds from `Config/GetConfig` (Core `GetConfigResultData`). Missing on old servers → built-in defaults. */
export type LocationServerConfig = Partial<Pick<GetConfigResultData, 'PersonnelLocationStaleSeconds' | 'UnitLocationStaleSeconds' | 'PersonnelLocationMinMeters' | 'UnitLocationMinMeters'>>;

/** The signed-in session as far as location cares. Injected by the shell (auth is not a dependency of this package). */
export interface LocationSession {
  userId: string;
}

/**
 * The outbox surface this package needs — `@resgrid/offline`'s `Outbox` satisfies it. `drain` lets a background task run
 * deliver what it queued while the OS keeps the app awake (Android pauses JS timers in the background, so the outbox's
 * own timer trigger cannot be relied on there).
 */
export interface LocationOutbox {
  enqueue<P>(input: EnqueueInput<P>): Promise<EnqueueResult>;
  drain?(options?: DrainOptions): Promise<DrainResult>;
}

/** expo-location's foreground watcher subscription, or the browser `clearWatch` shim. */
export interface LocationWatch {
  remove(): void;
}

export type LocationPermissionStatus = 'granted' | 'denied' | 'undetermined';

/** Fields shared by the personnel and unit location inputs, already formatted for the wire (Core takes strings). */
export interface LocationWireFields {
  Timestamp: string;
  Latitude: string;
  Longitude: string;
  Accuracy: string;
  Altitude: string;
  AltitudeAccuracy: string;
  Speed: string;
  Heading: string;
}

/** Outbox payload for `location.person` (Core `PersonnelLocationInput`). */
export interface PersonLocationPayload extends LocationWireFields {
  UserId: string;
}

/** Outbox payload for `location.unit` (Core `UnitLocationInput`). */
export interface UnitLocationPayload extends LocationWireFields {
  UnitId: string;
}

export type LocationPayload = PersonLocationPayload | UnitLocationPayload;
