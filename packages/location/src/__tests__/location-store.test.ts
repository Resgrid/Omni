import { DEFAULT_MAX_ACCURACY_METERS } from '../constants';
import { getRecentLocation, patchTransmissionStatus, resetLocationStores, setCurrentLocation } from '../location-store';
import { FAR, fixAt, ORIGIN } from './helpers';

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

  it('counts a repeated identical fix as confirming the stored position, and an older identical one as not undoing it', () => {
    setCurrentLocation(fixAt(ORIGIN, NOW - 10 * MINUTE), 'watcher');

    expect(getRecentLocation({ maxAgeMs: 2 * MINUTE, now: NOW })).toBeNull();

    // Identical coordinates: the store keeps the older fix and its timestamp, and the new fix confirms it.
    setCurrentLocation(fixAt(ORIGIN, NOW - 10_000), 'watcher');

    expect(getRecentLocation({ maxAgeMs: 2 * MINUTE, now: NOW })).toMatchObject({ ...ORIGIN, timestamp: NOW - 10 * MINUTE });

    // A cached on-demand fix of the same position, older still.
    setCurrentLocation(fixAt(ORIGIN, NOW - 20 * MINUTE), 'on-demand');

    expect(getRecentLocation({ maxAgeMs: 2 * MINUTE, now: NOW })).toMatchObject(ORIGIN);
  });

  it('never lets an older cached fix that replaced the position borrow a newer fix time', () => {
    setCurrentLocation(fixAt(ORIGIN, NOW - 10_000), 'watcher');
    patchTransmissionStatus({ lastFixAt: NOW - 10_000 });
    // acquireLocationFix falls back to the OS's last known position, which can be older and elsewhere.
    setCurrentLocation(fixAt(FAR, NOW - 30 * MINUTE), 'on-demand');

    expect(getRecentLocation({ maxAgeMs: 2 * MINUTE, now: NOW })).toBeNull();
  });

  it('drops a fix less accurate than the limit and keeps one that reports no accuracy', () => {
    setCurrentLocation(fixAt(ORIGIN, NOW, { accuracy: DEFAULT_MAX_ACCURACY_METERS + 1 }), 'web');

    expect(getRecentLocation({ maxAgeMs: MINUTE, now: NOW })).toBeNull();
    expect(getRecentLocation({ maxAgeMs: MINUTE, maxAccuracyMeters: 500, now: NOW })).toMatchObject(ORIGIN);

    setCurrentLocation(fixAt(ORIGIN, NOW, { accuracy: null }), 'web');

    expect(getRecentLocation({ maxAgeMs: MINUTE, now: NOW })).toMatchObject(ORIGIN);
  });
});
