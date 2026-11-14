import React, { act } from 'react';

import { MapProvider } from '../provider/map-provider';
import { MapView, RasterLayer, RasterSource } from '../rg';
import { loadMapLibre } from '../rg/maplibre-loader.web';
import { TrafficLayer } from '../rg/traffic-layer';
import { type FakeMap, mockCalls, mockMaps, resetMaplibreGlFakes } from './fakes/maplibre-gl';

interface Root {
  render(node: React.ReactNode): void;
  unmount(): void;
}
// react-dom ships without types in this workspace (no @types/react-dom).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createRoot } = require('react-dom/client') as { createRoot: (element: Element) => Root };

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const DAY = 'https://maps.example.org/day.json';
const TRAFFIC_URL = 'https://api.mapbox.com/v4/mapbox.mapbox-traffic-v1/{z}/{x}/{y}.vector.pbf?access_token=pk.test';
const CONFIG = { MapLibreStyleUrlDay: DAY, TrafficAvailable: true, TrafficTileUrl: TRAFFIC_URL, TrafficRefreshSeconds: 60 };

let container: HTMLDivElement;
let root: Root;

beforeAll(async () => {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 800 });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 600 });
  await loadMapLibre();
});

beforeEach(() => {
  resetMaplibreGlFakes();
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-11-01T12:00:00Z'));
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  jest.useRealTimers();
});

/** Loads the map with a base style that has a road line and a label layer (what `belowLabels` looks for). */
const loadedMap = (): FakeMap => {
  const map = mockMaps[0];
  map.layers.push({ id: 'road', type: 'line', source: 'base' }, { id: 'road-label', type: 'symbol', source: 'base' });
  act(() => map.emit('load'));
  return map;
};

describe('TrafficLayer — web renderer', () => {
  it('adds a vector source and the congestion / closure line layers under the style labels', () => {
    act(() =>
      root.render(
        <MapProvider config={CONFIG} colorScheme="light">
          <MapView testID="map">
            <TrafficLayer />
          </MapView>
        </MapProvider>
      )
    );
    const map = loadedMap();
    const source = map.getSource('rg-traffic-source');
    expect(source).toMatchObject({ type: 'vector', maxzoom: 16 });
    expect(source.tiles[0]).toMatch(/^https:\/\/api\.mapbox\.com\/v4\/mapbox\.mapbox-traffic-v1\/\{z\}\/\{x\}\/\{y\}\.vector\.pbf\?access_token=pk\.test&rgts=\d+$/);
    const added = mockCalls.addLayer.filter((call) => call.id.startsWith('rg-traffic'));
    expect(added.map((call) => [call.id, call.beforeId])).toEqual([
      ['rg-traffic-line', 'road-label'],
      ['rg-traffic-closed', 'road-label'],
    ]);
    expect(added[0].spec).toMatchObject({ 'source-layer': 'traffic', minzoom: 10, filter: ['!=', ['get', 'closed'], 'yes'], layout: { visibility: 'visible' } });
  });

  it('reloads the tiles in place with setTiles on each refresh and hides through layout visibility', () => {
    const tree = (visible: boolean) => (
      <MapProvider config={CONFIG} colorScheme="light">
        <MapView testID="map">
          <TrafficLayer visible={visible} />
        </MapView>
      </MapProvider>
    );
    act(() => root.render(tree(true)));
    const map = loadedMap();
    const source = map.getSource('rg-traffic-source');
    const first = source.tiles[0];
    act(() => {
      jest.advanceTimersByTime(60_000);
    });
    expect(source.setTiles).toHaveBeenCalledTimes(1);
    expect(source.tiles[0]).not.toBe(first);
    expect(mockCalls.addSource.filter((id) => id === 'rg-traffic-source')).toHaveLength(1);

    act(() => root.render(tree(false)));
    expect(map.setLayoutProperty).toHaveBeenCalledWith('rg-traffic-line', 'visibility', 'none');
    act(() => {
      jest.advanceTimersByTime(120_000);
    });
    expect(source.setTiles).toHaveBeenCalledTimes(1);
  });

  it("adds the department's image tiles as a raster source and layer under the labels", () => {
    const rasterUrl = 'https://api.tomtom.com/traffic/map/4/tile/flow/relative0/{z}/{x}/{y}.png?key=test';
    act(() =>
      root.render(
        <MapProvider config={{ MapLibreStyleUrlDay: DAY, TrafficAvailable: false, TrafficRasterTileUrl: rasterUrl, TrafficRefreshSeconds: 60 }} colorScheme="light">
          <MapView testID="map">
            <TrafficLayer />
          </MapView>
        </MapProvider>
      )
    );
    const map = loadedMap();
    const source = map.getSource('rg-traffic-raster-source');
    expect(source).toMatchObject({ type: 'raster', tileSize: 256 });
    expect(source.tiles[0]).toMatch(/^https:\/\/api\.tomtom\.com\/traffic\/map\/4\/tile\/flow\/relative0\/\{z\}\/\{x\}\/\{y\}\.png\?key=test&rgts=\d+$/);
    expect(map.getSource('rg-traffic-source')).toBeUndefined();
    const added = mockCalls.addLayer.filter((call) => call.id.startsWith('rg-traffic'));
    expect(added.map((call) => [call.id, call.beforeId])).toEqual([['rg-traffic-raster', 'road-label']]);
    expect(added[0].spec).toMatchObject({ type: 'raster', paint: { 'raster-opacity': 0.85 }, layout: { visibility: 'visible' } });
  });

  it('draws nothing without server traffic', () => {
    act(() =>
      root.render(
        <MapProvider config={{ MapLibreStyleUrlDay: DAY }} colorScheme="light">
          <MapView testID="map">
            <TrafficLayer />
          </MapView>
        </MapProvider>
      )
    );
    loadedMap();
    expect(mockCalls.addSource).toEqual([]);
  });
});

describe('RasterSource — new tiles (renewed signature)', () => {
  it('replaces the tiles of the existing source instead of keeping the stale ones', () => {
    const tree = (url: string) => (
      <MapProvider config={{ MapLibreStyleUrlDay: DAY }} colorScheme="light">
        <MapView testID="map">
          <RasterSource id="custom" tileUrlTemplates={[url]}>
            <RasterLayer id="custom-layer" />
          </RasterSource>
        </MapView>
      </MapProvider>
    );
    act(() => root.render(tree('https://api.example.org/t/{z}/{x}/{y}?sig=1')));
    const map = loadedMap();
    const source = map.getSource('custom');
    expect(source.tiles).toEqual(['https://api.example.org/t/{z}/{x}/{y}?sig=1']);
    act(() => root.render(tree('https://api.example.org/t/{z}/{x}/{y}?sig=2')));
    expect(source.setTiles).toHaveBeenCalledWith(['https://api.example.org/t/{z}/{x}/{y}?sig=2']);
    expect(map.getSource('custom').tiles).toEqual(['https://api.example.org/t/{z}/{x}/{y}?sig=2']);
  });
});
