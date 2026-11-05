import { DEFAULT_MAX_ACCURACY_METERS } from '../constants';
import { getRecentLocation, patchTransmissionStatus, resetLocationStores, setCurrentLocation } from '../location-store';
import { fixAt, ORIGIN } from './helpers';

const NOW = 1_800_000_000_000;
const MINUTE = 60_000;

describe('getRecentLocation', () => {
  afterEach(() => resetLocationStores());

  it('has nothing before the first fix', () => {
    expect(getRecentLocation({ maxAgeMs: 2 * MINUTE, now: NOW })).toBeNull();
  });

  it('returns a fix inside the age limit and nothing once it is older', () => {
    setCurrentLocation(fixAt(ORIGIN, NOW - MINUTE), 'watcher');

    expect(getRecentLocation({ maxAgeMs: 2 * MINUTE, now: NOW })).toMatchObject(ORIGIN);
    expect(getRecentLocation({ maxAgeMs: 30_000, now: NOW })).toBeNull();
  });

  it('counts a repeated identical fix the transmitter recorded as confirming the stored position', () => {
    setCurrentLocation(fixAt(ORIGIN, NOW - 10 * MINUTE), 'watcher');
    // Identical coordinates: the store keeps the older fix and its timestamp.
    setCurrentLocation(fixAt(ORIGIN, NOW - 10_000), 'watcher');

    expect(getRecentLocation({ maxAgeMs: 2 * MINUTE, now: NOW })).toBeNull();

    patchTransmissionStatus({ lastFixAt: NOW - 10_000 });

    expect(getRecentLocation({ maxAgeMs: 2 * MINUTE, now: NOW })).toMatchObject(ORIGIN);
  });

  it('drops a fix less accurate than the limit and keeps one that reports no accuracy', () => {
    setCurrentLocation(fixAt(ORIGIN, NOW, { accuracy: DEFAULT_MAX_ACCURACY_METERS + 1 }), 'web');

    expect(getRecentLocation({ maxAgeMs: MINUTE, now: NOW })).toBeNull();
    expect(getRecentLocation({ maxAgeMs: MINUTE, maxAccuracyMeters: 500, now: NOW })).toMatchObject(ORIGIN);

    setCurrentLocation(fixAt(ORIGIN, NOW, { accuracy: null }), 'web');

    expect(getRecentLocation({ maxAgeMs: MINUTE, now: NOW })).toMatchObject(ORIGIN);
  });
});
