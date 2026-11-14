import { EtaSource, type NearestPersonnelResult, type NearestUnitBoard, type NearestUnitResult, UnitPositionSource } from '@resgrid/models';

import {
  boundsAround,
  buildDispatchMapOverlay,
  callLocationOf,
  formatAge,
  formatDistanceEta,
  formatDuration,
  formatEta,
  orderByBoard,
  parseGeofenceRing,
  positionNote,
  rankBoardUnits,
  unitResponseSeconds,
} from '../lib/dispatch-board';

const unit = (overrides: Partial<NearestUnitResult>): NearestUnitResult => ({
  UnitId: 1,
  Name: 'Unit',
  IsAvailable: true,
  PositionIsStale: false,
  PositionSource: UnitPositionSource.Live,
  LocationHidden: false,
  EtaSource: EtaSource.Estimated,
  TurnoutSeconds: 0,
  Crew: [],
  CrewCount: 0,
  CrewAvailableCount: 0,
  OnShiftCount: 0,
  ...overrides,
});

const person = (overrides: Partial<NearestPersonnelResult>): NearestPersonnelResult => ({
  UserId: 'u1',
  Name: 'Person',
  IsAvailable: true,
  IsOnShift: true,
  Roles: [],
  Latitude: 39.52,
  Longitude: -119.78,
  LocationIsStale: false,
  LocationHidden: false,
  DistanceMeters: 2000,
  EtaSource: EtaSource.Estimated,
  ...overrides,
});

const board = (units: NearestUnitResult[], personnel: NearestPersonnelResult[] = []): NearestUnitBoard => ({
  Latitude: 39.5,
  Longitude: -119.8,
  GeneratedOn: '',
  IsDepartmentWide: true,
  Units: units,
  Personnel: personnel,
  Notes: [],
});

const SOUTH = '[{"lat":39.5,"lng":-119.8},{"lat":39.6,"lng":-119.8},{"lat":39.6,"lng":-119.7}]';

describe('dispatch board helpers', () => {
  it('ranks only the available entries with a distance as nearest', () => {
    const ranks = rankBoardUnits(
      board([unit({ UnitId: 1, DistanceMeters: 500 }), unit({ UnitId: 2, DistanceMeters: 800, IsAvailable: false }), unit({ UnitId: 3, DistanceMeters: null }), unit({ UnitId: 4, DistanceMeters: 1200 })])
    );

    expect(ranks.get('1')?.nearestRank).toBe(1);
    expect(ranks.get('2')?.nearestRank).toBeNull();
    expect(ranks.get('3')?.nearestRank).toBeNull();
    expect(ranks.get('4')?.nearestRank).toBe(2);
    expect(ranks.get('4')?.index).toBe(3);
  });

  it('orders the rows the board lists first, in its order, then the rest by name', () => {
    const ranks = rankBoardUnits(board([unit({ UnitId: 2, DistanceMeters: 100 }), unit({ UnitId: 1, DistanceMeters: 900, IsAvailable: false })]));

    const items = [
      { id: '1', name: 'Alpha' },
      { id: '3', name: 'Charlie' },
      { id: '2', name: 'Bravo' },
    ];

    const order = (sort: 'closest' | 'name', withRanks = ranks) =>
      orderByBoard(
        items,
        (item) => item.id,
        (item) => item.name,
        withRanks,
        sort
      ).map((item) => item.id);

    expect(order('closest')).toEqual(['2', '1', '3']);
    expect(order('name')).toEqual(['1', '2', '3']);
    expect(order('closest', new Map())).toEqual(['1', '2', '3']);
  });

  it('formats times to the second, as Core ranks them', () => {
    expect(formatDuration(995)).toBe('16:35');
    expect(formatDuration(1029.6)).toBe('17:10');
    expect(formatDuration(-1)).toBeNull();
    expect(formatEta(45)).toBe('0:45 min');
    expect(formatEta(null)).toBeNull();
    // A 5:01 unit reads as quicker than a 5:59 one; in whole minutes both used to read "6 min".
    expect(formatEta(301)).toBe('5:01 min');
    expect(formatEta(359)).toBe('5:59 min');
  });

  it('formats distance and ETA, marking estimates', () => {
    expect(formatDistanceEta(1400, 240, EtaSource.Estimated)).toBe('1.4 km · ~4:00 min');
    expect(formatDistanceEta(650, 45, EtaSource.Road)).toBe('650 m · 0:45 min');
    expect(formatDistanceEta(null, null)).toBeNull();
  });

  it('shows a unit the time it is ranked on: turnout plus travel', () => {
    expect(unitResponseSeconds({ EtaSeconds: 940, ResponseSeconds: 1000 })).toBe(1000);
    expect(unitResponseSeconds({ EtaSeconds: 940, ResponseSeconds: null })).toBe(940);
  });

  it('formats the age of a position, zone-less timestamps as UTC', () => {
    const now = Date.parse('2026-10-22T16:00:00Z');

    expect(formatAge('2026-10-22T15:35:00Z', now)).toBe('25 min');
    expect(formatAge('2026-10-22T13:00:00', now)).toBe('3 h');
    expect(formatAge('2026-10-22T15:59:40Z', now)).toBeNull();
    expect(formatAge(null, now)).toBeNull();
  });

  it('says why a position needs a second look', () => {
    expect(positionNote({ LocationHidden: true, DistanceMeters: 100 })?.key).toBe('calls.dispatch_board.location_hidden');
    expect(positionNote({ LocationHidden: false, DistanceMeters: null })?.key).toBe('calls.dispatch_board.no_location');
    expect(positionNote({ LocationHidden: false, DistanceMeters: 100, PositionSource: UnitPositionSource.Station })?.key).toBe('calls.dispatch_board.at_station');
    expect(positionNote({ LocationHidden: false, DistanceMeters: 100, LocationIsStale: true, LocationTimestamp: '2026-10-22T15:35:00Z' }, Date.parse('2026-10-22T16:00:00Z'))).toEqual({
      key: 'calls.dispatch_board.location_stale',
      values: { age: '25 min' },
    });
    expect(positionNote({ LocationHidden: false, DistanceMeters: 100 })).toBeNull();
  });

  it('parses a geofence into a closed GeoJSON ring, including legacy keys', () => {
    expect(parseGeofenceRing(SOUTH)).toEqual([
      [-119.8, 39.5],
      [-119.8, 39.6],
      [-119.7, 39.6],
      [-119.8, 39.5],
    ]);
    expect(parseGeofenceRing('[{"k":1,"A":2},{"k":1,"A":3},{"k":2,"A":3}]')).toHaveLength(4);
    expect(parseGeofenceRing('[{"lat":1,"lng":2},{"lat":1,"lng":3}]')).toBeNull();
    expect(parseGeofenceRing('not json')).toBeNull();
    expect(parseGeofenceRing('')).toBeNull();
  });

  it('draws placed resources and boundaries, leaving hidden positions off', () => {
    const overlay = buildDispatchMapOverlay(
      board(
        [unit({ UnitId: 1, Name: 'MCT 1', Latitude: 39.51, Longitude: -119.79, StatusColor: '#2f9e44', DistanceMeters: 1400, StatusText: 'Available' }), unit({ UnitId: 2, LocationHidden: true, DistanceMeters: 300 })],
        [person({ Name: 'Taylor' })]
      ),
      [{ GroupId: '7', Name: 'South', Geofence: SOUTH, GeofenceColor: 'not-a-colour' }]
    );

    expect(overlay?.unitCount).toBe(1);
    expect(overlay?.personCount).toBe(1);
    expect(overlay?.points.features[0]?.properties).toMatchObject({ id: 'u1', kind: 'unit', color: '#2f9e44', detail: 'Available · 1.4 km' });
    expect(overlay?.boundaries.features[0]?.properties.color).toBe('#0ea5e9');
    expect(overlay?.nearest).toEqual([
      [-119.79, 39.51],
      [-119.78, 39.52],
    ]);
  });

  it('does not frame the call with a far-off fix, and leaves out-of-range positions off', () => {
    const far = buildDispatchMapOverlay(board([unit({ UnitId: 1, Latitude: 41.8, Longitude: -87.6, DistanceMeters: 2_700_000 }), unit({ UnitId: 2, Latitude: 39.51, Longitude: -119.79, DistanceMeters: 1400 })]), []);
    const outOfRange = buildDispatchMapOverlay(board([unit({ UnitId: 1, Latitude: 139.5, Longitude: -119.79, DistanceMeters: 900 }), unit({ UnitId: 3, Latitude: 39.51, Longitude: -119.79, DistanceMeters: 1400 })]), []);

    expect(far?.unitCount).toBe(2);
    expect(far?.nearest).toEqual([[-119.79, 39.51]]);
    expect(outOfRange?.unitCount).toBe(1);
  });

  it('maps only the available resources, while the picker still ranks everyone', () => {
    const nearestBoard = board(
      [unit({ UnitId: 1, Name: 'Busy', IsAvailable: false, Latitude: 39.5, Longitude: -119.8, DistanceMeters: 100 }), unit({ UnitId: 2, Name: 'Free', Latitude: 39.51, Longitude: -119.79, DistanceMeters: 1400 })],
      [person({ UserId: 'busy', IsAvailable: false, Latitude: 39.501, Longitude: -119.801, DistanceMeters: 150 }), person({ UserId: 'free' })]
    );

    const overlay = buildDispatchMapOverlay(nearestBoard, []);

    expect(overlay?.points.features.map((feature) => feature.properties.id)).toEqual(['u2', 'pfree']);
    expect(rankBoardUnits(nearestBoard).get('1')).toMatchObject({ index: 0, nearestRank: null });
    expect(buildDispatchMapOverlay(board([unit({ IsAvailable: false, Latitude: 39.51, Longitude: -119.79, DistanceMeters: 1400 })]), [])).toBeNull();
    expect(buildDispatchMapOverlay(null, [])).toBeNull();
  });

  it('reads a call location from string or number coordinates', () => {
    expect(callLocationOf('39.178716', '-119.767430')).toEqual({ latitude: 39.178716, longitude: -119.76743 });
    expect(callLocationOf(51.05, 3.72)).toEqual({ latitude: 51.05, longitude: 3.72 });
    expect(callLocationOf('0', '0')).toBeNull();
    expect(callLocationOf('', '')).toBeNull();
    expect(callLocationOf(null, undefined)).toBeNull();
  });

  it('frames the call with the closest resources', () => {
    expect(boundsAround({ latitude: 39.5, longitude: -119.8 }, [[-119.7, 39.6]])).toEqual({ sw: [-119.8, 39.5], ne: [-119.7, 39.6] });
    expect(boundsAround({ latitude: 39.5, longitude: -119.8 }, [])).toBeNull();
  });
});
