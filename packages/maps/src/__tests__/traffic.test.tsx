import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { AppState, Text } from 'react-native';

import { MapTrafficButton } from '../components/map-controls';
import { useMapRouting, useMapTraffic } from '../provider/context';
import { MapProvider, type MapProviderProps } from '../provider/map-provider';
import { resolveMapRouting, resolveMapTraffic } from '../provider/routing-traffic';
import type { MapConfigInput } from '../provider/style-resolution';
import { MapView } from '../rg';
import { TRAFFIC_COLORS, TrafficLayer, trafficTilesFor } from '../rg/traffic-layer';
import type { StyleSpecification } from '../types';
import { resetMaplibreFakes } from './fakes/maplibre-react-native';

const TRAFFIC_URL = 'https://api.mapbox.com/v4/mapbox.mapbox-traffic-v1/{z}/{x}/{y}.vector.pbf?access_token=pk.test';
const CONFIG: MapConfigInput = {
  MapLibreStyleUrlDay: 'https://maps.example.org/day.json',
  TrafficAvailable: true,
  TrafficTileUrl: TRAFFIC_URL,
  TrafficRefreshSeconds: 120,
  RoutingProvider: ' Valhalla ',
  RoutingSupportsTraffic: true,
  RoutingSupportsIncidents: false,
  RoutingSupportsVoice: true,
  NavigationAvailable: true,
};
const CAPABILITIES = { layers: true, customIndoor: false, navigationInApp: true };

const renderWith = async (ui: React.ReactElement, props: Partial<MapProviderProps> = {}) =>
  render(
    <MapProvider config={CONFIG} colorScheme="light" capabilities={CAPABILITIES} {...props}>
      {ui}
    </MapProvider>
  );

function Probe() {
  const routing = useMapRouting();
  const traffic = useMapTraffic();
  return <Text testID="probe">{JSON.stringify({ routing, traffic })}</Text>;
}

const probe = (): { routing: ReturnType<typeof useMapRouting>; traffic: ReturnType<typeof useMapTraffic> } => JSON.parse(String(screen.getByTestId('probe').props.children));

describe('routing and traffic capabilities (§5.4)', () => {
  it('exposes the provider, its support flags and navigation availability from config', async () => {
    await renderWith(<Probe />);
    expect(probe().routing).toEqual({ provider: 'valhalla', supportsTraffic: true, supportsIncidents: false, supportsVoice: true, navigationAvailable: true });
    expect(probe().traffic).toEqual({ available: true, tileUrl: TRAFFIC_URL, refreshSeconds: 120 });
  });

  it('keeps navigation off without the variant capability and everything off against an older server', async () => {
    expect(resolveMapRouting(CONFIG, false).navigationAvailable).toBe(false);
    await renderWith(<Probe />, { config: { MapLibreStyleUrlDay: 'https://maps.example.org/day.json' } });
    expect(probe().routing).toEqual({ provider: null, supportsTraffic: false, supportsIncidents: false, supportsVoice: false, navigationAvailable: false });
    expect(probe().traffic).toEqual({ available: false, tileUrl: null, refreshSeconds: 300 });
  });

  it('accepts traffic tiles only over https with {z}/{x}/{y}, and not while the map is offline', () => {
    expect(resolveMapTraffic({ ...CONFIG, TrafficTileUrl: 'http://tiles.example.org/{z}/{x}/{y}.pbf' }, false, false).available).toBe(false);
    expect(resolveMapTraffic({ ...CONFIG, TrafficTileUrl: 'https://tiles.example.org/traffic.pbf' }, false).available).toBe(false);
    expect(resolveMapTraffic({ ...CONFIG, TrafficAvailable: false }, false).available).toBe(false);
    expect(resolveMapTraffic(CONFIG, true)).toEqual({ available: false, tileUrl: TRAFFIC_URL, refreshSeconds: 120 });
    expect(resolveMapTraffic({ ...CONFIG, TrafficRefreshSeconds: 5 }, false).refreshSeconds).toBe(60);
  });
});

describe('TrafficLayer (§11.1)', () => {
  beforeEach(() => resetMaplibreFakes());
  afterEach(() => jest.useRealTimers());

  it('draws congestion and closures from the traffic source layer at zoom 10+, under the overlay anchor on a URL style', async () => {
    await renderWith(
      <MapView testID="map">
        <TrafficLayer />
      </MapView>
    );
    const source = screen.getByTestId('mlrn-vector-source-rg-traffic-source');
    expect(source.props.tiles).toEqual(trafficTilesFor(TRAFFIC_URL, Math.floor(Date.now() / 60_000)));
    expect(source.props.tiles[0]).toMatch(/access_token=pk\.test&rgts=\d+$/);
    expect(source.props.maxzoom).toBe(16);
    const line = screen.getByTestId('mlrn-layer-rg-traffic-line');
    expect(line.props).toMatchObject({ type: 'line', source: 'rg-traffic-source', 'source-layer': 'traffic', minzoom: 10, filter: ['!=', ['get', 'closed'], 'yes'] });
    expect(line.props.paint['line-color']).toEqual([
      'match',
      ['get', 'congestion'],
      'low',
      TRAFFIC_COLORS.low,
      'moderate',
      TRAFFIC_COLORS.moderate,
      'heavy',
      TRAFFIC_COLORS.heavy,
      'severe',
      TRAFFIC_COLORS.severe,
      TRAFFIC_COLORS.low,
    ]);
    expect(line.props.paint['line-offset']).toEqual(['interpolate', ['linear'], ['zoom'], 10, 1, 16, 4]);
    expect(line.props.layout).toMatchObject({ visibility: 'visible' });
    // A URL style hides its label layers from the native renderer: the overlay goes under the wrapper's anchor.
    expect(screen.getByTestId('mlrn-layer-rg-overlay-anchor')).toBeTruthy();
    expect(line.props.beforeId).toBe('rg-overlay-anchor');
    const closed = screen.getByTestId('mlrn-layer-rg-traffic-closed');
    expect(closed.props.filter).toEqual(['==', ['get', 'closed'], 'yes']);
    expect(closed.props.paint).toMatchObject({ 'line-color': TRAFFIC_COLORS.closed, 'line-dasharray': [1.5, 1] });
  });

  it('goes under the first label layer of a JSON style, offsets left for left-hand traffic and hides without unmounting', async () => {
    const style = {
      version: 8,
      sources: {},
      layers: [
        { id: 'background', type: 'background' },
        { id: 'road', type: 'line', source: 'x' },
        { id: 'road-label', type: 'symbol', source: 'x' },
      ],
    } as unknown as StyleSpecification;
    const { rerender } = await renderWith(
      <MapView testID="map" mapStyle={style}>
        <TrafficLayer drivingSide="left" />
      </MapView>
    );
    const line = screen.getByTestId('mlrn-layer-rg-traffic-line');
    expect(line.props.beforeId).toBe('road-label');
    expect(line.props.paint['line-offset']).toEqual(['interpolate', ['linear'], ['zoom'], 10, -1, 16, -4]);
    expect(screen.queryByTestId('mlrn-layer-rg-overlay-anchor')).toBeNull();
    await rerender(
      <MapProvider config={CONFIG} colorScheme="light" capabilities={CAPABILITIES}>
        <MapView testID="map" mapStyle={style}>
          <TrafficLayer visible={false} belowLayerID="pins" />
        </MapView>
      </MapProvider>
    );
    const hidden = screen.getByTestId('mlrn-layer-rg-traffic-line');
    expect(hidden.props.layout).toMatchObject({ visibility: 'none' });
    expect(hidden.props.beforeId).toBe('pins');
  });

  it('reloads the tiles every TrafficRefreshSeconds in the foreground only', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-11-01T12:00:00Z'));
    await renderWith(
      <MapView testID="map">
        <TrafficLayer />
      </MapView>
    );
    const first = screen.getByTestId('mlrn-vector-source-rg-traffic-source').props.tiles[0];
    await act(async () => {
      jest.advanceTimersByTime(120_000);
    });
    const second = screen.getByTestId('mlrn-vector-source-rg-traffic-source').props.tiles[0];
    expect(second).not.toBe(first);
    expect(second).toMatch(/rgts=\d+$/);

    // The jest-expo AppState stand-in is not a plain string property: swap it for this check.
    const appState = AppState as unknown as { currentState: unknown };
    const original = appState.currentState;
    appState.currentState = 'background';
    await act(async () => {
      jest.advanceTimersByTime(120_000);
    });
    appState.currentState = original;
    expect(screen.getByTestId('mlrn-vector-source-rg-traffic-source').props.tiles[0]).toBe(second);
  });

  it('renders nothing when the server has no traffic', async () => {
    await renderWith(
      <MapView testID="map">
        <TrafficLayer />
      </MapView>,
      { config: { MapLibreStyleUrlDay: 'https://maps.example.org/day.json' } }
    );
    expect(screen.queryByTestId('mlrn-vector-source-rg-traffic-source')).toBeNull();
  });
});

describe('MapTrafficButton', () => {
  it('toggles traffic and shows its state; hidden when traffic is unavailable', async () => {
    const onPress = jest.fn();
    const { rerender } = await renderWith(<MapTrafficButton isOn={true} onPress={onPress} />);
    const button = screen.getByRole('button', { name: 'maps.traffic' });
    expect(button).toBeSelected();
    await fireEvent.press(button);
    expect(onPress).toHaveBeenCalledTimes(1);
    await rerender(
      <MapProvider config={{ MapLibreStyleUrlDay: 'https://maps.example.org/day.json' }} colorScheme="light" capabilities={CAPABILITIES}>
        <MapTrafficButton isOn={true} onPress={onPress} />
      </MapProvider>
    );
    expect(screen.queryByTestId('map-traffic-button')).toBeNull();
  });
});
