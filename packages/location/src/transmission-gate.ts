import { type Coordinates, distanceInMeters } from './geo';

/**
 * Decides which fixes are worth transmitting (Unit's `location-transmission-gate`, generalised from unit ids to any
 * target key: `p:{userId}` or `u:{unitId}`).
 *
 * The OS does not pace fixes the way the request asks: iOS ignores `timeInterval` and reports on every
 * `distanceInterval` of travel, so a vehicle at highway speed produces several fixes a second, and the OS task and the
 * foreground watcher can both be running. Transmitting each of those keeps the radio awake for nothing — dispatch only
 * needs the latest position at a steady cadence, and a parked target re-confirmed every heartbeat.
 *
 * Pure state machine; the caller owns the clock and the actual send.
 */
export interface LocationTransmissionGateOptions {
  /** Never transmit more often than this. */
  minIntervalMs: number;
  /** Movement below this since the last transmission is GPS jitter, not travel. */
  minDistanceMeters: number;
  /** A target that has not moved still re-confirms its position this often, when a fix (or the heartbeat) arrives. */
  stationaryIntervalMs: number;
}

export type TransmissionDecision =
  /** Transmit now. */
  | { action: 'send' }
  /** It moved, but the last transmission was too recent: transmit after `retryInMs`. */
  | { action: 'defer'; retryInMs: number }
  /** Nothing new to say: it is where it was when last transmitted. */
  | { action: 'skip' };

interface TransmittedFix extends Coordinates {
  targetKey: string;
  transmittedAt: number;
  /** False once the server refused it: the position is not on the server, only the pacing stands. */
  accepted: boolean;
}

/** Opaque handle for one recorded transmission. */
export type TransmissionRecord = Readonly<TransmittedFix>;

export class LocationTransmissionGate {
  private last: TransmittedFix | null = null;

  constructor(private options: LocationTransmissionGateOptions) {}

  /** Server thresholds can change after sign-in (config refresh); the next decision uses them. */
  updateOptions(options: LocationTransmissionGateOptions): void {
    this.options = options;
  }

  getOptions(): LocationTransmissionGateOptions {
    return this.options;
  }

  evaluate(targetKey: string, coordinates: Coordinates, now: number): TransmissionDecision {
    const last = this.last;

    // A different target has never been transmitted; a clock that went backwards makes the elapsed time meaningless.
    // Either way, start over.
    if (!last || last.targetKey !== targetKey || now < last.transmittedAt) {
      return { action: 'send' };
    }

    const elapsed = now - last.transmittedAt;

    // A refused position never reached the server, so any fix is news — but still no faster than the interval, or a
    // failing server would be retried on every fix.
    if (last.accepted && distanceInMeters(last, coordinates) < this.options.minDistanceMeters) {
      return elapsed >= this.options.stationaryIntervalMs ? { action: 'send' } : { action: 'skip' };
    }

    return elapsed >= this.options.minIntervalMs ? { action: 'send' } : { action: 'defer', retryInMs: this.options.minIntervalMs - elapsed };
  }

  /** Record a transmission attempt. Recorded before delivery, so fixes arriving meanwhile see it. */
  record(targetKey: string, coordinates: Coordinates, now: number): TransmissionRecord {
    const record: TransmittedFix = { targetKey, latitude: coordinates.latitude, longitude: coordinates.longitude, transmittedAt: now, accepted: true };
    this.last = record;
    return record;
  }

  /** The server refused `record` (or it never got queued). Ignored when a newer transmission was recorded since. */
  markRejected(record: TransmissionRecord): void {
    if (this.last === record) {
      this.last = { ...record, accepted: false };
    }
  }

  /** The newest recorded transmission, or null. */
  getLastRecord(): TransmissionRecord | null {
    return this.last;
  }

  /** When the last transmission was recorded (epoch ms), or null if none has been. */
  getLastTransmittedAt(): number | null {
    return this.last?.transmittedAt ?? null;
  }

  reset(): void {
    this.last = null;
  }
}
