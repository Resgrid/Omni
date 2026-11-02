import React, { act } from 'react';

import type { MapOfflineOptions } from '../offline/types';
import { MapProvider } from '../provider/map-provider';
import { LineLayer, MapView, ShapeSource } from '../rg';
import { loadMapLibre } from '../rg/maplibre-loader.web';
import { mockMaps, resetMaplibreGlFakes } from './fakes/maplibre-gl';

interface Root {
  render(node: React.ReactNode): void;
  unmount(): void;
}
// react-dom ships without types in this workspace (no @types/react-dom).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createRoot } = require('react-dom/client') as { createRoot: (element: Element) => Root };

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const config = { MapLibreStyleUrlDay: 'https://maps.example.org/day.json', MapAttribution: '© OpenStreetMap' };
const offline = (overrides: Partial<MapOfflineOptions> = {}): MapOfflineOptions => ({
  mode: 'online',
  getStyle: () => ({ version: 8, sources: {}, layers: [] }) as never,
  attribution: 'Protomaps © OpenStreetMap',
  updatedAt: Date.now() - 60 * 60 * 1000,
  staleAfterMs: 7 * 24 * 60 * 60 * 1000,
  ...overrides,
});

let container: HTMLDivElement;
let root: Root;

beforeAll(async () => {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 800 });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 600 });
  await loadMapLibre();
});

beforeEach(() => {
  resetMaplibreGlFakes();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('web map errors and the offline badge (D16, §19.8)', () => {
  it('reports a style that fails before loading and base-style tile errors afterwards to the offline switch', () => {
    const reportMapError = jest.fn();
    const route = { type: 'FeatureCollection' as const, features: [] };
    act(() =>
      root.render(
        <MapProvider config={config} colorScheme="light" offline={offline({ reportMapError })}>
          <MapView testID="map">
            <ShapeSource id="navigation-route-1" shape={route}>
              <LineLayer id="navigation-route-1-line" style={{ lineColor: '#00f' }} />
            </ShapeSource>
          </MapView>
        </MapProvider>
      )
    );
    const map = mockMaps[0];
    act(() => map.emit('error', { error: new Error('style') }));
    expect(reportMapError).toHaveBeenLastCalledWith('style');

    // The style document's own source arrives with the style; the app's sources are added after the load.
    map.addSource('protomaps', { type: 'vector' });
    act(() => map.emit('style.load'));
    act(() => map.emit('load'));
    expect(map.getSource('navigation-route-1')).toBeDefined();
    act(() => map.emit('error', { error: new Error('tile'), sourceId: 'protomaps', tile: {} }));
    expect(reportMapError).toHaveBeenLastCalledWith('tile');
    expect(reportMapError).toHaveBeenCalledTimes(2);

    // Sources the app adds (traffic 401/429, custom map and indoor tiles, the route line) never count.
    for (const sourceId of ['rg-traffic-source', 'map-screen-traffic', 'custom-map-L1-tiles', 'navigation-route-1']) {
      act(() => map.emit('error', { error: new Error('overlay'), sourceId, tile: {} }));
    }
    // Other errors after the load (a missing image, a bad layer) are not a network signal either.
    act(() => map.emit('error', { error: new Error('other') }));
    expect(reportMapError).toHaveBeenCalledTimes(2);
    expect(container.querySelector('[data-testid="offline-map-badge"]')).toBeNull();
  });

  it('counts the sources a JSON style declares from the start', () => {
    const reportMapError = jest.fn();
    const rasterConfig = { MapRasterTileUrl: 'https://tiles.example.org/{z}/{x}/{y}.png', MapAttribution: '© OpenStreetMap' };
    act(() =>
      root.render(
        <MapProvider config={rasterConfig} colorScheme="light" offline={offline({ reportMapError })}>
          <MapView testID="map" />
        </MapProvider>
      )
    );
    const map = mockMaps[0];
    const declared = Object.keys((map.options.style as { sources: Record<string, unknown> }).sources);
    expect(declared.length).toBeGreaterThan(0);
    act(() => map.emit('load'));
    act(() => map.emit('error', { error: new Error('tile'), sourceId: declared[0], tile: {} }));
    act(() => map.emit('error', { error: new Error('tile'), sourceId: 'rg-traffic', tile: {} }));
    expect(reportMapError).toHaveBeenCalledTimes(1);
    expect(reportMapError).toHaveBeenCalledWith('tile');
  });

  it('shows the badge over a map drawn from local packs', () => {
    act(() =>
      root.render(
        <MapProvider config={config} colorScheme="light" offline={offline({ mode: 'offline' })}>
          <MapView testID="map" />
        </MapProvider>
      )
    );
    expect(container.querySelector('[data-testid="offline-map-badge"]')?.textContent).toBe('maps.offline.badge_updated_hours');
  });
});
