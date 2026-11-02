import React, { act } from 'react';

import { MapProvider } from '../provider/map-provider';
import { MapView } from '../rg';
import type * as Loader from '../rg/maplibre-loader.web';
import { mockMaps, resetMaplibreGlFakes } from './fakes/maplibre-gl';

// A failed maplibre-gl import (an offline web client missing the chunk) must not leave the map blank until a remount.

jest.mock('../rg/maplibre-loader.web', () => ({
  ...jest.requireActual('../rg/maplibre-loader.web'),
  loadMapLibre: jest.fn(),
  getLoadedMapLibre: jest.fn(() => null),
}));

interface Root {
  render(node: React.ReactNode): void;
  unmount(): void;
}
// react-dom ships without types in this workspace (no @types/react-dom).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createRoot } = require('react-dom/client') as { createRoot: (element: Element) => Root };

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const loader = jest.requireMock('../rg/maplibre-loader.web') as { loadMapLibre: jest.MockedFunction<typeof Loader.loadMapLibre> };
// eslint-disable-next-line @typescript-eslint/no-require-imports -- the maplibre-gl stand-in (jest.web.config.js)
const maplibre = (): Promise<Loader.MapLibreModule> => Promise.resolve(require('maplibre-gl') as Loader.MapLibreModule);

const DAY = 'https://maps.example.org/day.json';

let container: HTMLDivElement;
let root: Root;
const onFail = jest.fn();

const tree = () => (
  <MapProvider config={{ MapLibreStyleUrlDay: DAY }} colorScheme="light">
    <MapView testID="map" onDidFailLoadingMap={onFail} />
  </MapProvider>
);

/** Lets the loader's promise chain settle inside act. */
const flush = () =>
  act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });

beforeAll(() => {
  // jsdom has no layout: report a size so the renderer creates the map.
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 800 });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 600 });
});

beforeEach(() => {
  resetMaplibreGlFakes();
  jest.useFakeTimers();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  loader.loadMapLibre.mockReset();
  loader.loadMapLibre.mockRejectedValueOnce(new Error('offline')).mockImplementation(maplibre);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  jest.useRealTimers();
});

describe('rg wrapper — web renderer after a failed maplibre-gl load', () => {
  it('reports the failure and tries again after a back-off', async () => {
    act(() => root.render(tree()));
    await flush();
    expect(onFail).toHaveBeenCalledTimes(1);
    expect(mockMaps).toHaveLength(0);

    await act(async () => {
      jest.advanceTimersByTime(2_000);
    });
    await flush();
    expect(loader.loadMapLibre).toHaveBeenCalledTimes(2);
    expect(mockMaps).toHaveLength(1);
    expect(mockMaps[0].options).toMatchObject({ style: DAY });
  });

  it('tries again at once when the browser comes back online', async () => {
    act(() => root.render(tree()));
    await flush();
    expect(mockMaps).toHaveLength(0);

    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });
    await flush();
    expect(loader.loadMapLibre).toHaveBeenCalledTimes(2);
    expect(mockMaps).toHaveLength(1);
  });

  it('drops the pending retry when the map unmounts', async () => {
    act(() => root.render(tree()));
    await flush();
    act(() => root.unmount());
    root = createRoot(container);

    await act(async () => {
      jest.advanceTimersByTime(60_000);
      window.dispatchEvent(new Event('online'));
    });
    await flush();
    expect(loader.loadMapLibre).toHaveBeenCalledTimes(1);
    expect(mockMaps).toHaveLength(0);
  });
});
