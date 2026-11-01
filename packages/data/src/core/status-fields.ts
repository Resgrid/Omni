import { type DataLocationFix, getDataLocationFix } from './runtime';

/**
 * Timestamps a status carries: the moment the person or crew set it (Unit rule). The queued event replays
 * these values, so a status queued offline keeps its real time on the call timeline, not the drain time.
 */
export function statusTimestamps(at: number): { Timestamp: string; TimestampUtc: string } {
  const date = new Date(at);
  return { Timestamp: date.toISOString(), TimestampUtc: date.toUTCString().replace('UTC', 'GMT') };
}

export interface GpsFields {
  Latitude: string;
  Longitude: string;
  Accuracy: string;
  Altitude: string;
  AltitudeAccuracy: string;
  Speed: string;
  Heading: string;
}

const text = (value: number | null | undefined): string => (typeof value === 'number' && Number.isFinite(value) ? String(value) : '');

/** GPS fields from the caller's fix, else the last known position, else empty strings (never 0,0). */
export function gpsFields(fix?: DataLocationFix | null): GpsFields {
  const source = fix ?? getDataLocationFix();
  if (!source || !Number.isFinite(source.latitude) || !Number.isFinite(source.longitude) || (source.latitude === 0 && source.longitude === 0)) {
    return { Latitude: '', Longitude: '', Accuracy: '', Altitude: '', AltitudeAccuracy: '', Speed: '', Heading: '' };
  }
  return {
    Latitude: String(source.latitude),
    Longitude: String(source.longitude),
    Accuracy: text(source.accuracy),
    Altitude: text(source.altitude),
    AltitudeAccuracy: text(source.altitudeAccuracy),
    Speed: text(source.speed),
    Heading: text(source.heading),
  };
}
