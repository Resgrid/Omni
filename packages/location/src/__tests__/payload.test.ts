import { extractTaskFixes, newestFix, toLocationFix } from '../geo';
import { buildPersonLocationPayload, buildUnitLocationPayload, coalesceKeyFor, eventTypeFor, targetKeyFor } from '../payload';
import { buildTaskOptions, hasSameTaskOptions, profileForTarget } from '../task-options';
import { fixAt, ORIGIN } from './helpers';

const TIMESTAMP = Date.UTC(2026, 9, 31, 12, 0, 0);

describe('location payloads', () => {
  it('formats a personnel fix for SetPersonLocation (strings, UTC ISO timestamp with Z)', () => {
    expect(buildPersonLocationPayload('user-1', fixAt(ORIGIN, TIMESTAMP))).toEqual({
      UserId: 'user-1',
      Timestamp: '2026-10-31T12:00:00.000Z',
      Latitude: '37.7749',
      Longitude: '-122.4194',
      Accuracy: '5',
      Altitude: '10',
      AltitudeAccuracy: '3',
      Speed: '4',
      Heading: '90',
    });
  });

  it('formats a unit fix for SetUnitLocation', () => {
    expect(buildUnitLocationPayload('42', fixAt(ORIGIN, TIMESTAMP))).toMatchObject({ UnitId: '42', Latitude: '37.7749', Longitude: '-122.4194' });
  });

  it('sends 0 instead of the iOS -1 sentinels and null values (Unit)', () => {
    const payload = buildUnitLocationPayload('42', fixAt(ORIGIN, TIMESTAMP, { accuracy: -1, altitudeAccuracy: null, speed: -1, heading: -1 }));
    expect(payload).toMatchObject({ Accuracy: '0', AltitudeAccuracy: '0', Speed: '0', Heading: '0' });
  });

  it('preserves a legitimately negative altitude and replaces a missing one', () => {
    expect(buildUnitLocationPayload('42', fixAt(ORIGIN, TIMESTAMP, { altitude: -12.5 })).Altitude).toBe('-12.5');
    expect(buildUnitLocationPayload('42', fixAt(ORIGIN, TIMESTAMP, { altitude: null })).Altitude).toBe('0');
  });

  it('keys events, gates and coalescing per target', () => {
    expect(eventTypeFor('person')).toBe('location.person');
    expect(eventTypeFor('unit')).toBe('location.unit');
    expect(targetKeyFor('person', 'abc')).toBe('p:abc');
    expect(targetKeyFor('unit', '7')).toBe('u:7');
    expect(coalesceKeyFor('unit', '7')).toBe('location.unit:7');
    expect(coalesceKeyFor('person', 'abc')).toBe('location.person:abc');
  });
});

describe('task batches', () => {
  it('picks the newest fix of a batch, even out of order', () => {
    const batch = [fixAt(ORIGIN, 3_000), fixAt(ORIGIN, 9_000), fixAt(ORIGIN, 1_000)];
    expect(newestFix(batch)?.timestamp).toBe(9_000);
    expect(newestFix([])).toBeUndefined();
  });

  it('validates untrusted task data', () => {
    expect(extractTaskFixes({ locations: [fixAt(ORIGIN, 1), { coords: { latitude: 'x' }, timestamp: 2 }, null] })).toHaveLength(1);
    expect(extractTaskFixes(undefined)).toEqual([]);
    expect(toLocationFix({ coords: { latitude: 1, longitude: 2 }, timestamp: 3 })).toEqual({
      coords: { latitude: 1, longitude: 2, altitude: null, accuracy: null, altitudeAccuracy: null, heading: null, speed: null },
      timestamp: 3,
    });
  });
});

describe('task options profiles', () => {
  const notification = { notificationTitle: 'Location Tracking', notificationBody: 'Sharing' };

  it('uses the automotive profile for units and the personal profile for persons', () => {
    expect(profileForTarget('unit')).toBe('automotive');
    expect(profileForTarget('person')).toBe('personal');
    expect(buildTaskOptions('automotive', 'ios', notification)).toMatchObject({ activityType: 2, timeInterval: 30_000, distanceInterval: 0, deferredUpdatesInterval: 25_000, pausesUpdatesAutomatically: false });
    expect(buildTaskOptions('personal', 'ios', notification)).toMatchObject({ activityType: 1, timeInterval: 15_000, distanceInterval: 10, deferredUpdatesDistance: 25 });
  });

  it('drops the distance filters on Android so a stationary responder still delivers heartbeat batches (Responder)', () => {
    expect(buildTaskOptions('personal', 'android', notification)).toMatchObject({ distanceInterval: 0, deferredUpdatesDistance: 0, deferredUpdatesInterval: 30_000 });
  });

  it('compares stored options key by key, accepting booleans stored as 0/1 (Unit)', () => {
    const desired = buildTaskOptions('automotive', 'android', notification);
    expect(hasSameTaskOptions({ ...desired, pausesUpdatesAutomatically: 0, showsBackgroundLocationIndicator: 1, extra: 'ignored' }, desired)).toBe(true);
    expect(hasSameTaskOptions({ ...desired, timeInterval: 15_000 }, desired)).toBe(false);
    expect(hasSameTaskOptions({ ...desired, foregroundService: { ...notification, notificationBody: 'Old text' } }, desired)).toBe(false);
    expect(hasSameTaskOptions(null, desired)).toBe(false);
  });
});
