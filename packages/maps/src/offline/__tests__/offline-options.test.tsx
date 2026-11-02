import { createManualConnectivitySource } from '@resgrid/offline';
import { act, renderHook } from '@testing-library/react-native';

import { deriveMapStyleState } from '../../provider/map-provider';
import type { OfflineInstalledSet, OfflineMapsController } from '../manager';
import { createOfflineMapOptions, resolveOfflineMapMode } from '../offline-options';
import { OfflineMapPackKind } from '../types';
import { useOfflineMapOptions } from '../use-offline-map-options';

const installed = (overrides: Partial<OfflineInstalledSet> = {}): OfflineInstalledSet => ({
  revision: 1,
  basemapPacks: [
    {
      packId: 'pack:a',
      kind: OfflineMapPackKind.Basemap,
      assetKind: 'basemap',
      key: 'a',
      version: '1',
      sha256: 'x',
      bytes: 1,
      path: 'file:///data/a.pmtiles',
      bounds: null,
      minZoom: 0,
      maxZoom: 15,
      pinned: true,
      lastUsedAt: null,
      downloadedAt: 1,
    },
  ],
  customMapPacks: [],
  indoorFloors: [],
  templates: { light: null, dark: null },
  spritePath: null,
  glyphsPath: null,
  departmentDataPath: null,
  departmentData: null,
  attribution: 'Protomaps © OpenStreetMap',
  updatedAt: 42,
  staleDays: 7,
  preferLocal: false,
  ...overrides,
});

describe('resolveOfflineMapMode', () => {
  it('switches to the local style only when packs exist and the device is offline or prefers local', () => {
    expect(resolveOfflineMapMode({ hasPacks: false, isOnline: false, preferLocal: true })).toBe('online');
    expect(resolveOfflineMapMode({ hasPacks: true, isOnline: false, preferLocal: false })).toBe('offline');
    expect(resolveOfflineMapMode({ hasPacks: true, isOnline: true, preferLocal: true })).toBe('local-preferred');
    expect(resolveOfflineMapMode({ hasPacks: true, isOnline: true, preferLocal: false })).toBe('online');
  });
});

describe('createOfflineMapOptions', () => {
  it('is null without installed packs', () => {
    expect(createOfflineMapOptions({ installed: null, isOnline: false })).toBeNull();
    expect(createOfflineMapOptions({ installed: installed({ basemapPacks: [] }), isOnline: false })).toBeNull();
  });

  it('feeds MapProvider a cached local style while offline and the online style otherwise', () => {
    const onUse = jest.fn();
    const offline = createOfflineMapOptions({ installed: installed(), isOnline: false, onUse });
    expect(offline?.mode).toBe('offline');
    const style = offline?.getStyle('light');
    expect(offline?.getStyle('light')).toBe(style);
    expect(onUse).toHaveBeenCalledTimes(1);
    expect(onUse).toHaveBeenCalledWith(['pack:a']);

    const source = { kind: 'maplibre' as const, url: 'https://api.resgrid.test/style.json', attribution: '' };
    const state = deriveMapStyleState(source, 'light', null, offline);
    expect(state).toMatchObject({ kind: 'offline', isOffline: true, attribution: 'Protomaps © OpenStreetMap', styleKey: 'offline:light' });
    expect(JSON.stringify(state.mapStyle)).toContain('pmtiles://file:///data/a.pmtiles');

    const online = createOfflineMapOptions({ installed: installed(), isOnline: true });
    expect(deriveMapStyleState(source, 'light', null, online)).toMatchObject({ kind: 'maplibre', isOffline: false });
    expect(createOfflineMapOptions({ installed: installed(), isOnline: true, preferLocal: true })?.mode).toBe('local-preferred');
  });

  it('fills in the server’s raster tiles around the downloaded area in local-preferred mode only, never inside it', () => {
    const area = { bounds: [-121.5, 38.2, -120.9, 38.7] as [number, number, number, number] };
    const packs = installed().basemapPacks.map((pack) => ({ ...pack, ...area }));
    const raster = { kind: 'raster' as const, tileUrl: 'https://tiles.resgrid.test/{z}/{x}/{y}.png', tileSize: 256, attribution: '© OpenStreetMap contributors' };
    const source = { kind: 'maplibre' as const, url: 'https://api.resgrid.test/style.json', attribution: '' };

    const preferLocal = createOfflineMapOptions({ installed: installed({ basemapPacks: packs }), isOnline: true, preferLocal: true });
    const state = deriveMapStyleState(source, 'light', null, preferLocal, raster);
    const style = state.mapStyle as unknown as { sources: Record<string, { type: string; bounds?: number[]; tiles?: string[] }>; layers: { id: string; type: string }[]; metadata: Record<string, unknown> };
    expect(style.metadata['resgrid:offline-coverage']).toEqual([{ bounds: area.bounds, minZoom: 0, maxZoom: null }]);
    const remote = Object.entries(style.sources).filter(([id]) => id.startsWith('offline-remote-'));
    // Four bands around the area; none overlaps it, so no remote tile is requested inside.
    expect(remote.map(([, band]) => band.bounds)).toEqual([
      [-180, -85.051129, -121.5, 85.051129],
      [-120.9, -85.051129, 180, 85.051129],
      [-121.5, -85.051129, -120.9, 38.2],
      [-121.5, 38.7, -120.9, 85.051129],
    ]);
    expect(remote.every(([, band]) => band.type === 'raster' && band.tiles?.[0] === raster.tileUrl)).toBe(true);
    // Above the background, under the local layers.
    expect(style.layers.slice(0, 6).map((layer) => layer.id)).toEqual(['background', 'offline-remote-0', 'offline-remote-1', 'offline-remote-2', 'offline-remote-3', 'earth']);
    expect(state).toMatchObject({ kind: 'offline', attribution: 'Protomaps © OpenStreetMap · © OpenStreetMap contributors', styleKey: 'offline:light:raster:https://tiles.resgrid.test/{z}/{x}/{y}.png' });
    // The same inputs hand MapLibre the same object (no restyle).
    expect(deriveMapStyleState(source, 'light', null, preferLocal, raster).mapStyle).toBe(state.mapStyle);

    // Offline: nothing remote.
    const offline = createOfflineMapOptions({ installed: installed({ basemapPacks: packs }), isOnline: false, preferLocal: true });
    const offlineState = deriveMapStyleState(source, 'light', null, offline, raster);
    expect(JSON.stringify(offlineState.mapStyle)).not.toContain('offline-remote-');
    expect(offlineState.styleKey).toBe('offline:light');
    // Packs without bounds (unknown coverage): the local style as is.
    const unknown = deriveMapStyleState(source, 'light', null, createOfflineMapOptions({ installed: installed(), isOnline: true, preferLocal: true }), raster);
    expect(JSON.stringify(unknown.mapStyle)).not.toContain('offline-remote-');
  });

  it('hands the composer the local glyphs and the department data, and the badge its stale threshold', () => {
    const departmentData = { stations: { type: 'FeatureCollection' as const, features: [] } };
    const template = { version: 8, glyphs: '{glyphs}/{fontstack}/{range}.pbf', sources: { protomaps: { type: 'vector', url: '{basemap}' } }, layers: [] } as never;
    const onMapError = jest.fn();
    const offline = createOfflineMapOptions({
      installed: installed({ glyphsPath: 'file:///data/glyphs-1', departmentData, templates: { light: template, dark: null }, staleDays: 3 }),
      isOnline: false,
      onMapError,
    });
    const style = offline?.getStyle('light') as unknown as { glyphs: string; sources: Record<string, unknown> };
    expect(style.glyphs).toBe('file:///data/glyphs-1/{fontstack}/{range}.pbf');
    expect(style.sources['offline-dept-stations']).toEqual({ type: 'geojson', data: departmentData.stations, attribution: 'Protomaps © OpenStreetMap' });
    expect(offline?.staleAfterMs).toBe(3 * 24 * 60 * 60 * 1000);
    offline?.reportMapError?.('tile');
    expect(onMapError).toHaveBeenCalledWith('tile');
    expect(createOfflineMapOptions({ installed: installed(), isOnline: true })?.reportMapError).toBeUndefined();
  });
});

describe('useOfflineMapOptions', () => {
  it('follows connectivity and the installed set', async () => {
    let set: OfflineInstalledSet | null = installed();
    const listeners = new Set<() => void>();
    const controller = {
      subscribe: (listener: () => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      getInstalledSet: () => set,
      markUsed: jest.fn(),
    } as unknown as OfflineMapsController;
    const connectivity = createManualConnectivitySource(true);
    const { result } = await renderHook(() => useOfflineMapOptions(controller, { connectivity }));
    expect(result.current?.mode).toBe('online');

    await act(() => connectivity.setOnline(false));
    expect(result.current?.mode).toBe('offline');
    const style = result.current?.getStyle('dark');
    expect(style).toBeTruthy();

    // A new options object for the same installed revision hands out the same style object (no restyle).
    await act(() => connectivity.setOnline(true));
    await act(() => connectivity.setOnline(false));
    expect(result.current?.getStyle('dark')).toBe(style);

    await act(() => {
      set = null;
      listeners.forEach((listener) => listener());
    });
    expect(result.current).toBeNull();
  });

  it('goes offline after more than 5 tile errors in 30 s and back once connectivity has been stable for 30 s', async () => {
    const set = installed();
    const controller = { subscribe: () => () => undefined, getInstalledSet: () => set, markUsed: jest.fn() } as unknown as OfflineMapsController;
    let now = 0;
    const timers: { at: number; run: () => void }[] = [];
    const switchOptions = {
      now: () => now,
      setTimer: (run: () => void, ms: number) => timers.push({ at: now + ms, run }),
      clearTimer: () => {
        timers.length = 0;
      },
    };
    const connectivity = createManualConnectivitySource(true);
    const { result } = await renderHook(() => useOfflineMapOptions(controller, { connectivity, switchOptions }));
    expect(result.current?.mode).toBe('online');

    await act(() => {
      for (let i = 0; i < 6; i++) result.current?.reportMapError?.('tile');
    });
    expect(result.current?.mode).toBe('offline');

    // Back online after a loss only when the 30 s release fires.
    await act(() => connectivity.setOnline(false));
    await act(() => connectivity.setOnline(true));
    expect(result.current?.mode).toBe('offline');
    now += 30_000;
    await act(() => timers.splice(0).forEach((timer) => timer.run()));
    expect(result.current?.mode).toBe('online');
  });

  it('is null without a controller', async () => {
    const { result } = await renderHook(() => useOfflineMapOptions(null));
    expect(result.current).toBeNull();
  });
});
