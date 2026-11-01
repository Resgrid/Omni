import React, { act } from 'react';

import { MapProvider } from '../provider/map-provider';
import { Images, LineLayer, MapView, MarkerView, ShapeSource } from '../rg';
import { loadMapLibre } from '../rg/maplibre-loader.web';
import type { MapPressEvent } from '../rg/types';
import { type FakeMap, mockCalls, mockMaps, mockMarkers, resetMaplibreGlFakes } from './fakes/maplibre-gl';

interface Root {
  render(node: React.ReactNode): void;
  unmount(): void;
}
// react-dom ships without types in this workspace (no @types/react-dom).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createRoot } = require('react-dom/client') as { createRoot: (element: Element) => Root };

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const DAY = 'https://maps.example.org/day.json';
const NIGHT = 'https://maps.example.org/night.json';
const line = {
  type: 'Feature' as const,
  properties: {},
  geometry: {
    type: 'LineString' as const,
    coordinates: [
      [0, 0],
      [1, 1],
    ],
  },
};

let container: HTMLDivElement;
let root: Root;

beforeAll(async () => {
  // jsdom has no layout: report a size so the renderer creates the map.
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 800 });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 600 });
  // maplibre-gl loads with the first map; loaded up front, every map below is created synchronously.
  await loadMapLibre();
});

beforeEach(() => {
  resetMaplibreGlFakes();
  jest.useFakeTimers();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  jest.useRealTimers();
});

const tree = (scheme: 'light' | 'dark', onPress?: (event: MapPressEvent) => void, extra?: React.ReactNode) => (
  <MapProvider config={{ MapLibreStyleUrlDay: DAY, MapLibreStyleUrlNight: NIGHT, MapAttribution: '© OpenStreetMap' }} colorScheme={scheme}>
    <MapView testID="map" onPress={onPress}>
      <Images images={{ pin: 'https://example.org/pin.png' }} />
      <ShapeSource id="route" shape={line}>
        <LineLayer id="route-line" style={{ lineColor: '#f00', lineWidth: 3, lineJoin: 'round' }} />
      </ShapeSource>
      {extra}
    </MapView>
  </MapProvider>
);

const loadedMap = (): FakeMap => {
  const map = mockMaps[0];
  act(() => map.emit('load'));
  return map;
};

describe('rg wrapper — web renderer (maplibre-gl)', () => {
  it('creates a maplibre-gl map with the provider style and an always-on attribution control', () => {
    act(() => root.render(tree('light')));
    expect(mockMaps).toHaveLength(1);
    expect(mockMaps[0].options).toMatchObject({ style: DAY, attributionControl: false, maplibreLogo: false });
    const map = loadedMap();
    const attribution = map.controls.find((entry) => entry.control.constructor.name === 'AttributionControl');
    expect(attribution?.control.options).toEqual({ compact: true, customAttribution: '© OpenStreetMap' });
    expect(attribution?.position).toBe('bottom-right');
  });

  it('adds sources and layers (camelCase style converted to paint/layout) once the map has loaded', () => {
    act(() => root.render(tree('light')));
    expect(mockCalls.addSource).toEqual([]);
    const map = loadedMap();
    expect(map.getSource('route')).toMatchObject({ type: 'geojson', data: line });
    expect(map.getLayer('route-line')).toEqual({ id: 'route-line', type: 'line', source: 'route', paint: { 'line-color': '#f00', 'line-width': 3 }, layout: { 'line-join': 'round' } });
  });

  it('re-adds sources and layers after a theme switch rebuilds the style', () => {
    act(() => root.render(tree('light')));
    const map = loadedMap();
    expect(mockCalls.addLayer.map((call) => call.id)).toEqual(['route-line']);

    act(() => root.render(tree('dark')));
    expect(mockCalls.setStyle).toEqual([{ style: NIGHT, options: { diff: false } }]);
    expect(map.getLayer('route-line')).toBeUndefined();

    act(() => map.emit('style.load'));
    act(() => {
      jest.runOnlyPendingTimers();
    });
    expect(mockCalls.addSource).toEqual(['route', 'route']);
    expect(mockCalls.addLayer.map((call) => call.id)).toEqual(['route-line', 'route-line']);
    expect(map.getLayer('route-line')).toBeDefined();
    expect(map.getSource('route')).toBeDefined();
  });

  it('normalizes clicks into press events', () => {
    const onPress = jest.fn();
    act(() => root.render(tree('light', onPress)));
    const map = loadedMap();
    act(() => map.emit('click', { lngLat: { lng: 3.7, lat: 50.9 }, point: { x: 4, y: 5 } }));
    expect(onPress).toHaveBeenCalledWith({ coordinates: [3.7, 50.9], point: [4, 5], geometry: { type: 'Point', coordinates: [3.7, 50.9] } });
  });

  it('renders MarkerView children into a maplibre-gl Marker through a portal', () => {
    act(() =>
      root.render(
        tree(
          'light',
          undefined,
          <MarkerView id="selected" coordinate={[3.7, 50.9]} anchor={{ x: 0.5, y: 1 }} testID="selected-marker">
            <span data-testid="marker-content">pin</span>
          </MarkerView>
        )
      )
    );
    const map = loadedMap();
    expect(mockMarkers).toHaveLength(1);
    const marker = mockMarkers[0];
    expect(marker.map).toBe(map);
    expect(marker.lngLat).toEqual([3.7, 50.9]);
    expect(marker.options.anchor).toBe('bottom');
    const element = marker.options.element as HTMLElement;
    expect(element.getAttribute('data-testid')).toBe('selected-marker');
    expect(element.querySelector('[data-testid="marker-content"]')?.textContent).toBe('pin');
  });

  it('shows the unavailable placeholder instead of a map when there is no style', () => {
    act(() =>
      root.render(
        <MapProvider config={{}} colorScheme="light">
          <MapView testID="map" />
        </MapProvider>
      )
    );
    expect(mockMaps).toHaveLength(0);
    expect(document.querySelector('[data-testid="map-unavailable"]')).not.toBeNull();
  });
});
