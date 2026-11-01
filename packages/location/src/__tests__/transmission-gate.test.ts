// Ported from Unit src/lib/__tests__/location-transmission-gate.test.ts (unit ids generalised to target keys).
import { distanceInMeters } from '../geo';
import { LocationTransmissionGate } from '../transmission-gate';
import { JITTER, MOVED, ORIGIN } from './helpers';

describe('distanceInMeters', () => {
  it('is zero for the same point', () => {
    expect(distanceInMeters(ORIGIN, ORIGIN)).toBe(0);
  });

  it('measures about 111 km per degree of latitude', () => {
    expect(distanceInMeters({ latitude: 0, longitude: 0 }, { latitude: 1, longitude: 0 })).toBeCloseTo(111195, -1);
  });

  it('shrinks a degree of longitude towards the poles', () => {
    const atEquator = distanceInMeters({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 });
    const at60North = distanceInMeters({ latitude: 60, longitude: 0 }, { latitude: 60, longitude: 1 });
    expect(at60North).toBeCloseTo(atEquator / 2, -2);
  });
});

describe('LocationTransmissionGate', () => {
  const options = { minIntervalMs: 15_000, minDistanceMeters: 25, stationaryIntervalMs: 300_000 };
  let gate: LocationTransmissionGate;

  beforeEach(() => {
    gate = new LocationTransmissionGate(options);
  });

  it('sends the first fix', () => {
    expect(gate.evaluate('u:1', ORIGIN, 0)).toEqual({ action: 'send' });
  });

  it('defers a moving fix inside the interval until the interval expires', () => {
    gate.record('u:1', ORIGIN, 0);
    expect(gate.evaluate('u:1', MOVED, 4_000)).toEqual({ action: 'defer', retryInMs: 11_000 });
  });

  it('sends a moving fix once the interval has elapsed', () => {
    gate.record('u:1', ORIGIN, 0);
    expect(gate.evaluate('u:1', MOVED, 15_000)).toEqual({ action: 'send' });
  });

  it('skips jitter until the stationary interval (heartbeat) elapses', () => {
    gate.record('u:1', ORIGIN, 0);
    expect(gate.evaluate('u:1', JITTER, 60_000)).toEqual({ action: 'skip' });
    expect(gate.evaluate('u:1', JITTER, 299_999)).toEqual({ action: 'skip' });
    expect(gate.evaluate('u:1', JITTER, 300_000)).toEqual({ action: 'send' });
  });

  it('sends immediately for a different target', () => {
    gate.record('u:1', ORIGIN, 0);
    expect(gate.evaluate('u:2', ORIGIN, 1_000)).toEqual({ action: 'send' });
    expect(gate.evaluate('p:user-1', ORIGIN, 1_000)).toEqual({ action: 'send' });
  });

  it('starts over when the clock goes backwards', () => {
    gate.record('u:1', ORIGIN, 100_000);
    expect(gate.evaluate('u:1', ORIGIN, 50_000)).toEqual({ action: 'send' });
  });

  it('measures distance from the last recorded transmission', () => {
    gate.record('u:1', ORIGIN, 0);
    gate.record('u:1', MOVED, 15_000);
    expect(gate.evaluate('u:1', ORIGIN, 30_000)).toEqual({ action: 'send' });
    expect(gate.evaluate('u:1', MOVED, 30_000)).toEqual({ action: 'skip' });
  });

  it('applies new thresholds (server config refresh) to the next decision', () => {
    gate.record('u:1', ORIGIN, 0);
    expect(gate.evaluate('u:1', JITTER, 1_000)).toEqual({ action: 'skip' });
    gate.updateOptions({ ...options, minDistanceMeters: 5 });
    expect(gate.evaluate('u:1', JITTER, 1_000)).toEqual({ action: 'defer', retryInMs: 14_000 });
  });

  describe('after a rejection', () => {
    it('retries an unmoved position once the interval allows, instead of treating it as delivered', () => {
      const record = gate.record('u:1', ORIGIN, 0);
      gate.markRejected(record);
      expect(gate.evaluate('u:1', ORIGIN, 5_000)).toEqual({ action: 'defer', retryInMs: 10_000 });
      expect(gate.evaluate('u:1', ORIGIN, 15_000)).toEqual({ action: 'send' });
    });

    it('ignores a rejection for a transmission that has since been superseded', () => {
      const first = gate.record('u:1', ORIGIN, 0);
      gate.record('u:1', MOVED, 15_000);
      gate.markRejected(first);
      expect(gate.evaluate('u:1', MOVED, 20_000)).toEqual({ action: 'skip' });
    });
  });

  it('forgets everything on reset', () => {
    gate.record('u:1', ORIGIN, 0);
    gate.reset();
    expect(gate.evaluate('u:1', ORIGIN, 1_000)).toEqual({ action: 'send' });
    expect(gate.getLastTransmittedAt()).toBeNull();
  });
});
