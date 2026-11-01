import { act, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Text } from 'react-native';

import { useMapProviderContext, useMapStyle } from '../provider/context';
import { MapProvider } from '../provider/map-provider';
import { clearMapStyleCache, type MapFetch } from '../provider/style-loader';
import type { MapConfigInput } from '../provider/style-resolution';

const TOKEN = 'pk.eyJ1IjoicmVzZ3JpZCJ9.abc';

let mockLastState: ReturnType<typeof useMapStyle> | null = null;

function Probe() {
  const style = useMapStyle();
  mockLastState = style;
  return <Text testID="probe">{`${style.status}|${style.kind}|${typeof style.mapStyle === 'string' ? style.mapStyle : style.mapStyle ? 'json' : 'null'}`}</Text>;
}

const okFetch = (body: unknown) => jest.fn<ReturnType<MapFetch>, Parameters<MapFetch>>(async () => ({ ok: true, status: 200, json: async () => body }));

describe('MapProvider', () => {
  beforeEach(() => {
    clearMapStyleCache();
    mockLastState = null;
  });

  it('switches between the day and night MapLibre styles with the theme', () => {
    const config: MapConfigInput = { MapLibreStyleUrlDay: 'https://maps.example.org/day.json', MapLibreStyleUrlNight: 'https://maps.example.org/night.json', MapAttribution: '© OSM' };
    const { rerender } = render(
      <MapProvider config={config} colorScheme="light" capabilities={{ layers: true, customIndoor: false, navigationInApp: false }}>
        <Probe />
      </MapProvider>
    );
    expect(screen.getByTestId('probe').props.children).toBe('ready|maplibre|https://maps.example.org/day.json');
    expect(mockLastState?.attribution).toBe('© OSM');
    expect(mockLastState?.isDark).toBe(false);
    rerender(
      <MapProvider config={config} colorScheme="dark" capabilities={{ layers: true, customIndoor: false, navigationInApp: false }}>
        <Probe />
      </MapProvider>
    );
    expect(screen.getByTestId('probe').props.children).toBe('ready|maplibre|https://maps.example.org/night.json');
    expect(mockLastState?.isDark).toBe(true);
    expect(mockLastState?.styleKey).toBe('maplibre:https://maps.example.org/night.json');
  });

  it('fetches a Mapbox style client-side and hands MapLibre the rewritten JSON', async () => {
    const fetchImpl = okFetch({
      version: 8,
      sources: { composite: { type: 'vector', url: 'mapbox://mapbox.mapbox-streets-v8' } },
      sprite: 'mapbox://sprites/mapbox/streets-v12',
      glyphs: 'mapbox://fonts/mapbox/{fontstack}/{range}.pbf',
      layers: [],
    });
    render(
      <MapProvider config={{ MapDayStyleUrl: 'mapbox://styles/mapbox/streets-v12', AppMapboxAccessToken: TOKEN }} colorScheme="light" fetchImpl={fetchImpl}>
        <Probe />
      </MapProvider>
    );
    expect(screen.getByTestId('probe').props.children).toBe('loading|mapbox|null');
    await waitFor(() => expect(screen.getByTestId('probe').props.children).toBe('ready|mapbox|json'));
    expect(fetchImpl).toHaveBeenCalledWith(`https://api.mapbox.com/styles/v1/mapbox/streets-v12?access_token=${encodeURIComponent(TOKEN)}`, expect.anything());
    const style = mockLastState?.mapStyle as { sources: Record<string, { url: string }>; sprite: string; glyphs: string };
    expect(style.sources.composite.url).toBe(`https://api.mapbox.com/v4/mapbox.mapbox-streets-v8.json?secure&access_token=${encodeURIComponent(TOKEN)}`);
    expect(style.sprite.startsWith('https://api.mapbox.com/styles/v1/mapbox/streets-v12/sprite?access_token=')).toBe(true);
    expect(style.glyphs.startsWith('https://api.mapbox.com/fonts/v1/mapbox/{fontstack}/{range}.pbf?access_token=')).toBe(true);
  });

  it('falls back to the raster tiles when the Mapbox style cannot be fetched', async () => {
    const fetchImpl: MapFetch = jest.fn(async () => ({ ok: false, status: 401, json: async () => ({}) }));
    render(
      <MapProvider config={{ MapDayStyleUrl: 'mapbox://styles/acme/x', AppMapboxAccessToken: TOKEN, MapUrl: 'https://tiles.example.org/{z}/{x}/{y}.png' }} colorScheme="light" fetchImpl={fetchImpl}>
        <Probe />
      </MapProvider>
    );
    await waitFor(() => expect(screen.getByTestId('probe').props.children).toBe('ready|raster|json'));
  });

  it('reports error (map hidden) when the Mapbox style fails and there is no raster fallback, and retries on demand', async () => {
    let fail = true;
    const fetchImpl: MapFetch = jest.fn(async () => (fail ? { ok: false, status: 500, json: async () => ({}) } : { ok: true, status: 200, json: async () => ({ version: 8, sources: {}, layers: [] }) }));
    let mockRetry: () => void = () => undefined;
    function RetryProbe() {
      mockRetry = useMapProviderContext().retry;
      return null;
    }
    render(
      <MapProvider config={{ MapDayStyleUrl: 'mapbox://styles/acme/x', AppMapboxAccessToken: TOKEN }} colorScheme="light" fetchImpl={fetchImpl}>
        <Probe />
        <RetryProbe />
      </MapProvider>
    );
    await waitFor(() => expect(screen.getByTestId('probe').props.children).toBe('error|mapbox|null'));
    expect(mockLastState?.isAvailable).toBe(false);
    fail = false;
    act(() => mockRetry());
    await waitFor(() => expect(screen.getByTestId('probe').props.children).toBe('ready|mapbox|json'));
  });

  it('hides maps when there is no style', () => {
    render(
      <MapProvider config={{}} colorScheme="light">
        <Probe />
      </MapProvider>
    );
    expect(screen.getByTestId('probe').props.children).toBe('none|none|null');
    expect(mockLastState?.isAvailable).toBe(false);
  });

  it('switches to the composed offline style through the offline seam', () => {
    const offlineStyle = { version: 8 as const, sources: {}, layers: [] };
    render(
      <MapProvider config={{ MapLibreStyleUrlDay: 'https://maps.example.org/day.json' }} colorScheme="light" offline={{ mode: 'offline', getStyle: () => offlineStyle, updatedAt: 123 }}>
        <Probe />
      </MapProvider>
    );
    expect(screen.getByTestId('probe').props.children).toBe('ready|offline|json');
    expect(mockLastState?.isOffline).toBe(true);
    expect(mockLastState?.attribution).toBe('Protomaps © OpenStreetMap');
  });

  it('stays online when the offline seam has no style', () => {
    render(
      <MapProvider config={{ MapLibreStyleUrlDay: 'https://maps.example.org/day.json' }} colorScheme="light" offline={{ mode: 'offline', getStyle: () => null }}>
        <Probe />
      </MapProvider>
    );
    expect(screen.getByTestId('probe').props.children).toBe('ready|maplibre|https://maps.example.org/day.json');
  });

  it('exposes the department centre, theme and a safe static map template', () => {
    let mockContext: ReturnType<typeof useMapProviderContext> | null = null;
    function ContextProbe() {
      mockContext = useMapProviderContext();
      return null;
    }
    render(
      <MapProvider
        config={{ MapCenterLatitude: 50.9, MapCenterLongitude: 3.7, MapCenterZoomLevel: 11, StaticMapUrlTemplate: 'https://api.example.org/static?lat={lat}' }}
        colorScheme="dark"
        theme={{ primary: '#ff0000' }}
      >
        <ContextProbe />
      </MapProvider>
    );
    expect(mockContext!.center).toEqual({ latitude: 50.9, longitude: 3.7, zoomLevel: 11 });
    expect(mockContext!.theme.primary).toBe('#ff0000');
    expect(mockContext!.theme.background).toBe('#111827');
    expect(mockContext!.staticMapUrlTemplate).toBe('https://api.example.org/static?lat={lat}');
    expect(mockContext!.capabilities).toEqual({ layers: false, customIndoor: false, navigationInApp: false });
  });
});
