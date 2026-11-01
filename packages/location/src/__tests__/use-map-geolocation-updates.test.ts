// Ported from IC src/hooks/__tests__/use-map-geolocation-updates.test.ts (+ live-locations parsing and Dispatch's
// applyToFetchedPins/join rules), against the package's own live location store instead of the SignalR store.
import type { MapMakerInfoData } from '@resgrid/models';
import { createElement, type Dispatch, type SetStateAction, useState } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { LIVE_LOCATION_REFRESH_DELAY_MS, UNKNOWN_PIN_REFRESH_COOLDOWN_MS, useMapGeolocationUpdates, type UseMapGeolocationUpdatesResult } from '../hooks/use-map-geolocation-updates';
import { ingestLiveLocation, type LiveLocation, type LiveLocations, liveLocationStore, markGeolocationJoined, mergeLiveLocation, parseLiveLocation, resetLiveLocations, withLiveLocationsSince } from '../live-locations';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const pin = (overrides: Partial<MapMakerInfoData>): MapMakerInfoData => ({
  Id: '',
  Latitude: 10,
  Longitude: 20,
  Title: '',
  zIndex: 0,
  ImagePath: '',
  InfoWindowContent: '',
  Color: '',
  Type: 1,
  PoiImage: '',
  ...overrides,
});

const unit = pin({ Id: 'u12', Type: 1, Latitude: 10, Longitude: 20 });
const person = pin({ Id: 'pABC-def', Type: 3, Latitude: 11, Longitude: 21 });
const station = pin({ Id: 's3', Type: 2, Latitude: 12, Longitude: 22 });

const live = (pinId: string, latitude: number, longitude: number, receivedAt = Date.now()): LiveLocation => ({ pinId, latitude, longitude, timestamp: null, receivedAt });

/** Pushes positions the way the store does: a new map, new objects only for the updated entities. */
const push = (...locations: LiveLocation[]): void => {
  const next: LiveLocations = { ...liveLocationStore.getState().liveLocations };
  locations.forEach((location) => {
    next[location.pinId] = location;
  });
  liveLocationStore.setState({ ...liveLocationStore.getState(), liveLocations: next });
};

interface MapProbe {
  pins: MapMakerInfoData[];
  setPins: Dispatch<SetStateAction<MapMakerInfoData[]>>;
  hook: UseMapGeolocationUpdatesResult;
}

const renderMap = (initialPins: MapMakerInfoData[], requestRefresh?: () => void): { current: () => MapProbe; unmount: () => void } => {
  let latest: MapProbe | null = null;
  const Probe = (): null => {
    const [pins, setPins] = useState(initialPins);
    const hook = useMapGeolocationUpdates({ pins, setPins, requestRefresh });
    latest = { pins, setPins, hook };
    return null;
  };
  let renderer: ReactTestRenderer | undefined;
  act(() => {
    renderer = create(createElement(Probe));
  });
  return {
    current: () => {
      if (!latest) throw new Error('not rendered');
      return latest;
    },
    unmount: () => act(() => renderer?.unmount()),
  };
};

let consoleError: jest.SpyInstance;

beforeEach(() => {
  jest.useFakeTimers();
  resetLiveLocations();
  // react-test-renderer prints a deprecation notice under React 19.
  consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  consoleError.mockRestore();
  jest.useRealTimers();
});

describe('useMapGeolocationUpdates', () => {
  it('moves a known pin in place and leaves the others untouched', () => {
    const map = renderMap([unit, person, station]);
    act(() => push(live('u12', 10.5, 20.5)));
    expect(map.current().pins[0]).toEqual({ ...unit, Latitude: 10.5, Longitude: 20.5 });
    expect(map.current().pins[1]).toBe(person);
    expect(map.current().pins[2]).toBe(station);
    map.unmount();
  });

  it('matches personnel case-insensitively', () => {
    const map = renderMap([unit, person]);
    act(() => push(live('pabc-def', 11.5, 21.5)));
    expect(map.current().pins[1]).toEqual({ ...person, Latitude: 11.5, Longitude: 21.5 });
    map.unmount();
  });

  it('applies every position in a burst that lands in one render', () => {
    const second = pin({ Id: 'u13', Type: 1 });
    const map = renderMap([unit, second]);
    act(() => {
      push(live('u12', 1, 1));
      push(live('u13', 2, 2));
    });
    expect(map.current().pins.map((p) => [p.Latitude, p.Longitude])).toEqual([
      [1, 1],
      [2, 2],
    ]);
    map.unmount();
  });

  it('does not lay positions received before the map mounted over its own snapshot', () => {
    push(live('u12', 1, 1));
    const map = renderMap([unit]);
    expect(map.current().pins[0]).toBe(unit);
    map.unmount();
  });

  it('does not roll a fresh snapshot back to an older live position', () => {
    const map = renderMap([unit]);
    act(() => push(live('u12', 1, 1)));
    const fresh = { ...unit, Latitude: 3, Longitude: 3 };
    act(() => map.current().setPins([fresh]));
    expect(map.current().pins[0]).toBe(fresh);

    act(() => push(live('u12', 4, 4)));
    expect(map.current().pins[0]).toEqual({ ...unit, Latitude: 4, Longitude: 4 });
    map.unmount();
  });

  it('never adds a pin for a position it does not know', () => {
    const map = renderMap([unit]);
    act(() => push(live('u99', 1, 1)));
    expect(map.current().pins).toEqual([unit]);
    map.unmount();
  });

  it('requests one coalesced refetch for unknown pins', () => {
    const requestRefresh = jest.fn();
    const map = renderMap([unit], requestRefresh);
    act(() => push(live('u98', 1, 1)));
    act(() => push(live('u99', 1, 1)));
    act(() => jest.advanceTimersByTime(LIVE_LOCATION_REFRESH_DELAY_MS - 1));
    expect(requestRefresh).not.toHaveBeenCalled();
    act(() => jest.advanceTimersByTime(1));
    expect(requestRefresh).toHaveBeenCalledTimes(1);
    map.unmount();
  });

  it('lets each unknown pin ask for a refetch at most once per cooldown', () => {
    const requestRefresh = jest.fn();
    const map = renderMap([unit], requestRefresh);
    act(() => push(live('u99', 1, 1)));
    act(() => jest.advanceTimersByTime(LIVE_LOCATION_REFRESH_DELAY_MS));
    expect(requestRefresh).toHaveBeenCalledTimes(1);

    act(() => push(live('u99', 2, 2)));
    act(() => jest.advanceTimersByTime(LIVE_LOCATION_REFRESH_DELAY_MS));
    expect(requestRefresh).toHaveBeenCalledTimes(1);

    act(() => jest.advanceTimersByTime(UNKNOWN_PIN_REFRESH_COOLDOWN_MS));
    act(() => push(live('u99', 3, 3)));
    act(() => jest.advanceTimersByTime(LIVE_LOCATION_REFRESH_DELAY_MS));
    expect(requestRefresh).toHaveBeenCalledTimes(2);
    map.unmount();
  });

  it('does not ask for a refetch while the first snapshot is still loading', () => {
    const requestRefresh = jest.fn();
    const map = renderMap([], requestRefresh);
    act(() => push(live('u12', 1, 1)));
    act(() => jest.advanceTimersByTime(LIVE_LOCATION_REFRESH_DELAY_MS));
    expect(requestRefresh).not.toHaveBeenCalled();
    map.unmount();
  });

  it('requests one catch-up refetch when the hub (re)joins', () => {
    const requestRefresh = jest.fn();
    const map = renderMap([unit], requestRefresh);
    act(() => markGeolocationJoined(Date.now()));
    act(() => jest.advanceTimersByTime(LIVE_LOCATION_REFRESH_DELAY_MS));
    expect(requestRefresh).toHaveBeenCalledTimes(1);
    map.unmount();
  });

  it('skips the catch-up when the displayed snapshot was fetched after the join (Dispatch)', () => {
    const requestRefresh = jest.fn();
    const map = renderMap([], requestRefresh);
    const joinedAt = Date.now();
    act(() => markGeolocationJoined(joinedAt));
    act(() => {
      map.current().setPins(map.current().hook.applyToFetchedPins([unit], joinedAt + 1));
    });
    act(() => jest.advanceTimersByTime(LIVE_LOCATION_REFRESH_DELAY_MS));
    expect(requestRefresh).not.toHaveBeenCalled();

    act(() => markGeolocationJoined(joinedAt + 10_000));
    act(() => jest.advanceTimersByTime(LIVE_LOCATION_REFRESH_DELAY_MS));
    expect(requestRefresh).toHaveBeenCalledTimes(1);
    map.unmount();
  });

  it('re-applies positions received while a fetch was in flight to its result', () => {
    const map = renderMap([unit]);
    const fetchStartedAt = Date.now();
    jest.advanceTimersByTime(10);
    act(() => push(live('u12', 7, 7)));
    expect(map.current().hook.applyToFetchedPins([unit], fetchStartedAt)[0]).toEqual({ ...unit, Latitude: 7, Longitude: 7 });
    map.unmount();
  });

  it('drops a pending refetch when the map unmounts', () => {
    const requestRefresh = jest.fn();
    const map = renderMap([unit], requestRefresh);
    act(() => markGeolocationJoined(Date.now()));
    map.unmount();
    jest.advanceTimersByTime(LIVE_LOCATION_REFRESH_DELAY_MS);
    expect(requestRefresh).not.toHaveBeenCalled();
  });
});

describe('withLiveLocationsSince', () => {
  it('applies only positions received at or after the fetch started', () => {
    const fetchStartedAt = 5_000;
    push(live('u12', 1, 1, fetchStartedAt), live('pabc-def', 2, 2, fetchStartedAt - 1));
    const pins = withLiveLocationsSince([unit, person], fetchStartedAt);
    expect(pins[0]).toEqual({ ...unit, Latitude: 1, Longitude: 1 });
    expect(pins[1]).toBe(person);
  });

  it('returns the snapshot itself when nothing applies', () => {
    const snapshot = [unit, person];
    expect(withLiveLocationsSince(snapshot, 0)).toBe(snapshot);
  });
});

describe('live location parsing', () => {
  it('parses camelCase and PascalCase hub payloads, and JSON strings', () => {
    expect(parseLiveLocation('unit', { unitId: 12, latitude: 1.5, longitude: 2.5, timestamp: '2026-10-31T12:00:00' }, 99)).toEqual({
      pinId: 'u12',
      latitude: 1.5,
      longitude: 2.5,
      timestamp: Date.UTC(2026, 9, 31, 12, 0, 0),
      receivedAt: 99,
    });
    expect(parseLiveLocation('personnel', JSON.stringify({ UserId: 'ABC-def', Latitude: '3', Longitude: '4' }), 1)).toMatchObject({ pinId: 'pabc-def', latitude: 3, longitude: 4, timestamp: null });
  });

  it('rejects positions that cannot be placed on a map', () => {
    expect(parseLiveLocation('unit', { unitId: 1, latitude: 0, longitude: 0 })).toBeNull();
    expect(parseLiveLocation('unit', { unitId: 1, latitude: 91, longitude: 0 })).toBeNull();
    expect(parseLiveLocation('unit', { latitude: 1, longitude: 1 })).toBeNull();
    expect(parseLiveLocation('unit', 'not json')).toBeNull();
  });

  it('ignores a fix older than the one held, and always applies one without a timestamp', () => {
    const held: LiveLocations = { u1: { pinId: 'u1', latitude: 1, longitude: 1, timestamp: 2_000, receivedAt: 0 } };
    expect(mergeLiveLocation(held, { pinId: 'u1', latitude: 2, longitude: 2, timestamp: 1_000, receivedAt: 1 })).toBe(held);
    expect(mergeLiveLocation(held, { pinId: 'u1', latitude: 2, longitude: 2, timestamp: null, receivedAt: 1 }).u1.latitude).toBe(2);
  });

  it('feeds the store from hub payloads', () => {
    expect(ingestLiveLocation('unit', { unitId: 5, latitude: 1, longitude: 1, timestamp: 2_000 }, 10)).toBe(true);
    expect(ingestLiveLocation('unit', { unitId: 5, latitude: 2, longitude: 2, timestamp: 1_000 }, 11)).toBe(false);
    expect(liveLocationStore.getState().liveLocations.u5).toMatchObject({ latitude: 1 });
  });
});
