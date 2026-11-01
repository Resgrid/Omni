import type { MapMakerInfoData } from '@resgrid/models';
import { createElement, type Dispatch, type SetStateAction, useState } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { LIVE_LOCATION_REFRESH_DELAY_MS } from '../constants';
import { emitRealtimeEvent, getRealtimeListenerCount } from '../event-bus';
import { useLiveLocation, useLiveLocations, useMapLiveLocations } from '../hooks/use-live-locations';
import { useRealtimeEvent } from '../hooks/use-realtime-event';
import { useRealtimeRefetch } from '../hooks/use-realtime-refetch';
import { type RealtimeStatus, useRealtimeStatus } from '../hooks/use-realtime-status';
import { MAP_PIN_TYPE } from '../live-locations';
import { useRealtimeStore } from '../realtime-store';
import { flush, resetRealtime } from './helpers/realtime-test-env';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const unitPin = (id: string, latitude = 1, longitude = 1): MapMakerInfoData => ({
  Id: id,
  Type: MAP_PIN_TYPE.Unit,
  Latitude: latitude,
  Longitude: longitude,
  Title: id,
  zIndex: 0,
  ImagePath: '',
  InfoWindowContent: '',
  Color: '',
  PoiImage: '',
});

let renderer: ReactTestRenderer | null = null;

const render = (element: ReturnType<typeof createElement>) => {
  act(() => {
    renderer = create(element);
  });
};

describe('realtime hooks', () => {
  let consoleError: jest.SpyInstance;

  beforeEach(async () => {
    await resetRealtime();
    // react-test-renderer (used so hook tests run in the Node preset, like @resgrid/core's) warns that it is deprecated.
    const original = console.error;
    consoleError = jest.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      if (typeof args[0] === 'string' && args[0].includes('react-test-renderer is deprecated')) return;
      original(...args);
    });
  });

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = null;
    consoleError.mockRestore();
  });

  it('useRealtimeEvent delivers typed events to the latest handler and unsubscribes on unmount', () => {
    const received: string[] = [];
    const Probe = ({ prefix }: { prefix: string }) => {
      useRealtimeEvent('callAdded', (id) => {
        received.push(`${prefix}:${id}`);
      });
      return null;
    };
    render(createElement(Probe, { prefix: 'a' }));
    act(() => emitRealtimeEvent('callAdded', '1'));
    act(() => renderer?.update(createElement(Probe, { prefix: 'b' })));
    act(() => emitRealtimeEvent('callAdded', '2'));
    expect(received).toEqual(['a:1', 'b:2']);
    expect(getRealtimeListenerCount('callAdded')).toBe(1);

    act(() => renderer?.unmount());
    renderer = null;
    expect(getRealtimeListenerCount('callAdded')).toBe(0);
  });

  it('useRealtimeStatus reflects hub joins and outages', () => {
    let status: RealtimeStatus | null = null;
    const Probe = () => {
      status = useRealtimeStatus();
      return null;
    };
    render(createElement(Probe));
    expect(status).toMatchObject({ isLive: false, hasOutage: false, outageSince: null, isExhausted: false });

    act(() => {
      useRealtimeStore.setState((state) => ({ hubs: { ...state.hubs, eventing: { status: 'connected', joined: true, joinedAt: 5 } } }));
    });
    expect(status).toMatchObject({ isLive: true });

    act(() => {
      useRealtimeStore.setState({ outages: { eventing: { since: 200, exhausted: false }, chat: { since: 100, exhausted: true } } });
    });
    expect(status).toMatchObject({ hasOutage: true, outageSince: 100, isExhausted: true });
  });

  it('useRealtimeRefetch runs a cache-bypassing single-flight refetch on its events', async () => {
    const fetcher = jest.fn().mockResolvedValue(undefined);
    const Probe = () => {
      useRealtimeRefetch(['personnelStatusUpdated', 'personnelStaffingUpdated'], fetcher);
      return null;
    };
    render(createElement(Probe));
    act(() => emitRealtimeEvent('personnelStatusUpdated', 'u1'));
    await act(async () => {
      await flush();
    });
    expect(fetcher).toHaveBeenCalledWith({ bypassCache: true, forceRefresh: true });
  });

  it('useLiveLocations and useLiveLocation read the merged positions', () => {
    let all: unknown = null;
    let one: unknown = null;
    const Probe = () => {
      all = useLiveLocations();
      one = useLiveLocation('U7');
      return null;
    };
    render(createElement(Probe));
    act(() => {
      useRealtimeStore.setState({ liveLocations: { u7: { pinId: 'u7', latitude: 3, longitude: 4, timestamp: null, receivedAt: 1 } } });
    });
    expect(Object.keys(all as object)).toEqual(['u7']);
    expect(one).toMatchObject({ latitude: 3, longitude: 4 });
  });

  describe('useMapLiveLocations', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('moves pins on pushes, re-applies positions newer than a fetch, and refetches for unknown pins once', () => {
      const requestRefresh = jest.fn();
      let pinsState: MapMakerInfoData[] = [];
      let apply: ((pins: MapMakerInfoData[], startedAt: number) => MapMakerInfoData[]) | null = null;
      let setPinsRef: Dispatch<SetStateAction<MapMakerInfoData[]>> | null = null;

      const MapProbe = () => {
        const [pins, setPins] = useState<MapMakerInfoData[]>([]);
        pinsState = pins;
        setPinsRef = setPins;
        apply = useMapLiveLocations({ pins, setPins, requestRefresh }).applyToFetchedPins;
        return null;
      };
      render(createElement(MapProbe));

      // A push that arrives while the REST request is in flight is applied to its result.
      act(() => {
        useRealtimeStore.setState({ liveLocations: { u1: { pinId: 'u1', latitude: 9, longitude: 9, timestamp: null, receivedAt: Date.now() } } });
      });
      act(() => setPinsRef?.(apply?.([unitPin('u1'), unitPin('u2')], Date.now() - 10) ?? []));
      expect(pinsState.map((p) => p.Latitude)).toEqual([9, 1]);

      act(() => {
        useRealtimeStore.setState((state) => ({ liveLocations: { ...state.liveLocations, u2: { pinId: 'u2', latitude: 5, longitude: 5, timestamp: null, receivedAt: Date.now() } } }));
      });
      expect(pinsState.map((p) => p.Latitude)).toEqual([9, 5]);

      act(() => {
        useRealtimeStore.setState((state) => ({ liveLocations: { ...state.liveLocations, u99: { pinId: 'u99', latitude: 5, longitude: 5, timestamp: null, receivedAt: Date.now() } } }));
      });
      act(() => {
        useRealtimeStore.setState((state) => ({ liveLocations: { ...state.liveLocations, u99: { pinId: 'u99', latitude: 6, longitude: 6, timestamp: null, receivedAt: Date.now() } } }));
      });
      act(() => jest.advanceTimersByTime(LIVE_LOCATION_REFRESH_DELAY_MS));
      expect(requestRefresh).toHaveBeenCalledTimes(1);
      expect(pinsState).toHaveLength(2);
    });

    it('refetches once when the geolocation hub rejoins after the snapshot was taken', () => {
      const requestRefresh = jest.fn();
      let apply: ((pins: MapMakerInfoData[], startedAt: number) => MapMakerInfoData[]) | null = null;
      const MapProbe = () => {
        const [pins, setPins] = useState<MapMakerInfoData[]>([]);
        apply = useMapLiveLocations({ pins, setPins, requestRefresh }).applyToFetchedPins;
        return null;
      };
      render(createElement(MapProbe));
      act(() => {
        apply?.([unitPin('u1')], 1000);
      });

      act(() => {
        useRealtimeStore.setState((state) => ({ hubs: { ...state.hubs, geolocation: { status: 'connected', joined: true, joinedAt: 5000 } } }));
      });
      act(() => jest.advanceTimersByTime(LIVE_LOCATION_REFRESH_DELAY_MS));
      expect(requestRefresh).toHaveBeenCalledTimes(1);
    });
  });
});
