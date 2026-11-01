import type { MapMakerInfoData } from '@resgrid/models';

import {
  applyLiveLocations,
  getPinEntityId,
  isValidLiveCoordinate,
  type LiveLocation,
  type LiveLocations,
  MAP_PIN_TYPE,
  parsePersonnelLocationUpdate,
  parseUnitLocationUpdate,
  upsertLiveLocation,
} from '../live-locations';

const pin = (id: string, type: number, latitude = 1, longitude = 1): MapMakerInfoData => ({
  Id: id,
  Type: type,
  Latitude: latitude,
  Longitude: longitude,
  Title: id,
  zIndex: 0,
  ImagePath: '',
  InfoWindowContent: '',
  Color: '',
  PoiImage: '',
});

const live = (pinId: string, latitude: number, longitude: number, timestamp: number | null = null, receivedAt = 1000): LiveLocation => ({ pinId, latitude, longitude, timestamp, receivedAt });

describe('live locations (Dispatch baseline)', () => {
  describe('parsing', () => {
    it('reads camelCase and PascalCase payloads and JSON strings', () => {
      expect(parseUnitLocationUpdate({ unitId: 12, latitude: 39.1, longitude: -104.2, timestamp: '2026-10-31T10:00:00Z' }, 5)).toEqual({
        pinId: 'u12',
        latitude: 39.1,
        longitude: -104.2,
        timestamp: Date.parse('2026-10-31T10:00:00Z'),
        receivedAt: 5,
      });
      expect(parsePersonnelLocationUpdate(JSON.stringify({ UserId: 'AbC-1', Latitude: '40.5', Longitude: '-105' }), 6)).toEqual({ pinId: 'pabc-1', latitude: 40.5, longitude: -105, timestamp: null, receivedAt: 6 });
    });

    it('rejects payloads that cannot move a pin', () => {
      expect(parseUnitLocationUpdate(null)).toBeNull();
      expect(parseUnitLocationUpdate('not json')).toBeNull();
      expect(parseUnitLocationUpdate([1, 2])).toBeNull();
      expect(parseUnitLocationUpdate({ UnitId: 1, Latitude: 0, Longitude: 0 })).toBeNull();
      expect(parseUnitLocationUpdate({ UnitId: 1, Latitude: 91, Longitude: 0 })).toBeNull();
      expect(parseUnitLocationUpdate({ UnitId: ' ', Latitude: 10, Longitude: 10 })).toBeNull();
      expect(parsePersonnelLocationUpdate({ UserId: 'u', Latitude: 'abc', Longitude: 10 })).toBeNull();
      expect(isValidLiveCoordinate(Number.NaN, 1)).toBe(false);
      expect(isValidLiveCoordinate(10, 10)).toBe(true);
    });
  });

  describe('upsertLiveLocation', () => {
    it('drops older fixes and identical repeats, returning the same object', () => {
      const current: LiveLocations = { u1: live('u1', 10, 10, 2000) };
      expect(upsertLiveLocation(current, live('u1', 11, 11, 1000))).toBe(current);
      expect(upsertLiveLocation(current, live('u1', 10, 10, 2000))).toBe(current);
      expect(upsertLiveLocation(current, live('u1', 12, 12, 3000)).u1.latitude).toBe(12);
    });

    it('always applies a fix with an unknown time', () => {
      const current: LiveLocations = { u1: live('u1', 10, 10, 2000) };
      expect(upsertLiveLocation(current, live('u1', 5, 5, null)).u1.latitude).toBe(5);
      expect(upsertLiveLocation({}, live('p2', 5, 5)).p2).toBeDefined();
    });
  });

  describe('applyLiveLocations', () => {
    it('moves unit and personnel pins only, keeping untouched pins and the array identity when nothing moved', () => {
      const pins = [pin('u12', MAP_PIN_TYPE.Unit), pin('pABC', MAP_PIN_TYPE.Personnel), pin('c5', MAP_PIN_TYPE.Call)];
      const result = applyLiveLocations(pins, { u12: live('u12', 20, 20), c5: live('c5', 30, 30) });
      expect(result.pins).not.toBe(pins);
      expect(result.pins[0]).toMatchObject({ Latitude: 20, Longitude: 20 });
      expect(result.pins[1]).toBe(pins[1]);
      expect(result.pins[2]).toBe(pins[2]);
      expect(result.unknownPinIds).toEqual(['c5']);

      const unchanged = applyLiveLocations(result.pins, { u12: live('u12', 20, 20) });
      expect(unchanged.pins).toBe(result.pins);
      expect(applyLiveLocations(pins, {}).pins).toBe(pins);
    });

    it('matches legacy unprefixed pin ids', () => {
      const pins = [pin('12', MAP_PIN_TYPE.Unit), pin('abc', MAP_PIN_TYPE.Personnel)];
      const result = applyLiveLocations(pins, { u12: live('u12', 3, 3), pabc: live('pabc', 4, 4) });
      expect(result.pins.map((p) => p.Latitude)).toEqual([3, 4]);
    });

    it('honours receivedSince and onlyPinIds', () => {
      const pins = [pin('u1', MAP_PIN_TYPE.Unit), pin('u2', MAP_PIN_TYPE.Unit)];
      const locations = { u1: live('u1', 5, 5, null, 100), u2: live('u2', 6, 6, null, 300) };
      expect(applyLiveLocations(pins, locations, { receivedSince: 200 }).pins.map((p) => p.Latitude)).toEqual([1, 6]);
      expect(applyLiveLocations(pins, locations, { onlyPinIds: ['U1'] }).pins.map((p) => p.Latitude)).toEqual([5, 1]);
    });
  });

  it('strips type prefixes from pin ids', () => {
    expect(getPinEntityId({ Id: 'c123', Type: MAP_PIN_TYPE.Call })).toBe('123');
    expect(getPinEntityId({ Id: 'p6a5b', Type: MAP_PIN_TYPE.Personnel })).toBe('6a5b');
    expect(getPinEntityId({ Id: 'cabc', Type: MAP_PIN_TYPE.Call })).toBe('cabc');
    expect(getPinEntityId({ Id: '77', Type: MAP_PIN_TYPE.Unit })).toBe('77');
  });
});
