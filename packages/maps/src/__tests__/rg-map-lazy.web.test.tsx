import React, { act } from 'react';

import { MapProvider } from '../provider/map-provider';
import { MapView } from '../rg';
import { loadMapLibre } from '../rg/maplibre-loader.web';
import { mockMaps } from './fakes/maplibre-gl';

// The first map waits for maplibre-gl, which loads with it (rg-map.web.test.tsx loads it up front instead).

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

const tree = (scheme: 'light' | 'dark') => (
  <MapProvider config={{ MapLibreStyleUrlDay: DAY, MapLibreStyleUrlNight: NIGHT }} colorScheme={scheme}>
    <MapView testID="map" />
  </MapProvider>
);

beforeAll(() => {
  // jsdom has no layout: report a size so the renderer creates the map.
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 800 });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 600 });
});

describe('rg wrapper — web renderer before maplibre-gl has loaded', () => {
  it('creates the map once maplibre-gl arrives, with the style current at that moment', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => root.render(tree('light')));
    expect(mockMaps).toHaveLength(0);
    // The theme switches while maplibre-gl is still loading.
    act(() => root.render(tree('dark')));
    await act(async () => {
      await loadMapLibre();
    });
    expect(mockMaps).toHaveLength(1);
    expect(mockMaps[0].options).toMatchObject({ style: NIGHT });

    act(() => root.unmount());
    container.remove();
    expect(mockMaps[0].removed).toBe(true);
  });
});
