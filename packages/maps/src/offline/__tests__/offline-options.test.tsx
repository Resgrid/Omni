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
  departmentDataPath: null,
  attribution: 'Protomaps © OpenStreetMap',
  updatedAt: 42,
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
});

describe('useOfflineMapOptions', () => {
  it('follows connectivity and the installed set', () => {
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
    const { result } = renderHook(() => useOfflineMapOptions(controller, { connectivity }));
    expect(result.current?.mode).toBe('online');

    act(() => connectivity.setOnline(false));
    expect(result.current?.mode).toBe('offline');
    const style = result.current?.getStyle('dark');
    expect(style).toBeTruthy();

    // A new options object for the same installed revision hands out the same style object (no restyle).
    act(() => connectivity.setOnline(true));
    act(() => connectivity.setOnline(false));
    expect(result.current?.getStyle('dark')).toBe(style);

    act(() => {
      set = null;
      listeners.forEach((listener) => listener());
    });
    expect(result.current).toBeNull();
  });

  it('is null without a controller', () => {
    const { result } = renderHook(() => useOfflineMapOptions(null));
    expect(result.current).toBeNull();
  });
});
