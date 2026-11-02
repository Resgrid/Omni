import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import type { MapOfflineOptions } from '../offline/types';
import { MapProvider } from '../provider/map-provider';
import { MapView } from '../rg';
import { isOfflineMapStale, offlineBadgeLabel } from '../rg/offline-map-badge';
import { resetMaplibreFakes } from './fakes/maplibre-react-native';

const DAY_MS = 24 * 60 * 60 * 1000;
const config = { MapLibreStyleUrlDay: 'https://maps.example.org/day.json', MapAttribution: '© OpenStreetMap' };
const LOCAL_STYLE = { version: 8, sources: {}, layers: [] } as never;

const offline = (overrides: Partial<MapOfflineOptions> = {}): MapOfflineOptions => ({
  mode: 'offline',
  getStyle: () => LOCAL_STYLE,
  attribution: 'Protomaps © OpenStreetMap',
  updatedAt: Date.now() - 2 * DAY_MS - 1000,
  staleAfterMs: 7 * DAY_MS,
  ...overrides,
});

describe('offline map badge (§19.8)', () => {
  beforeEach(() => resetMaplibreFakes());

  it('labels how long ago the packs were updated', () => {
    const now = Date.UTC(2026, 10, 10, 12, 0, 0);
    expect(offlineBadgeLabel(null, now)).toEqual({ key: 'maps.offline.badge', count: null });
    expect(offlineBadgeLabel(now - 20_000, now)).toEqual({ key: 'maps.offline.badge_updated_now', count: null });
    expect(offlineBadgeLabel(now - 5 * 60_000, now)).toEqual({ key: 'maps.offline.badge_updated_minutes', count: 5 });
    expect(offlineBadgeLabel(now - 3 * 60 * 60_000, now)).toEqual({ key: 'maps.offline.badge_updated_hours', count: 3 });
    expect(offlineBadgeLabel(now - 2 * DAY_MS, now)).toEqual({ key: 'maps.offline.badge_updated_days', count: 2 });
    expect(isOfflineMapStale(now - 8 * DAY_MS, 7 * DAY_MS, now)).toBe(true);
    expect(isOfflineMapStale(now - 6 * DAY_MS, 7 * DAY_MS, now)).toBe(false);
    expect(isOfflineMapStale(null, 7 * DAY_MS, now)).toBe(true);
  });

  it('shows on maps drawn from local packs, with details on tap', async () => {
    await render(
      <MapProvider config={config} colorScheme="light" offline={offline()}>
        <MapView testID="map" />
      </MapProvider>
    );
    const badge = screen.getByTestId('offline-map-badge');
    expect(screen.getByText('maps.offline.badge_updated_days')).toBeOnTheScreen();
    expect(screen.queryByTestId('offline-map-badge-details')).not.toBeOnTheScreen();
    await fireEvent.press(badge);
    expect(screen.getByText('maps.offline.badge_details')).toBeOnTheScreen();
    expect(screen.getByText('maps.offline.badge_attribution')).toBeOnTheScreen();
    expect(screen.queryByText('maps.offline.badge_stale')).not.toBeOnTheScreen();
  });

  it('turns amber past the stale threshold', async () => {
    await render(
      <MapProvider config={config} colorScheme="dark" offline={offline({ updatedAt: Date.now() - 8 * DAY_MS })}>
        <MapView testID="map" />
      </MapProvider>
    );
    await fireEvent.press(screen.getByTestId('offline-map-badge-stale'));
    expect(screen.getByText('maps.offline.badge_stale')).toBeOnTheScreen();
  });

  it('is absent on the online style and on maps that draw their own style', async () => {
    const { rerender } = await render(
      <MapProvider config={config} colorScheme="light" offline={offline({ mode: 'online' })}>
        <MapView testID="map" />
      </MapProvider>
    );
    expect(screen.queryByTestId('offline-map-badge-container')).not.toBeOnTheScreen();
    await rerender(
      <MapProvider config={config} colorScheme="light" offline={offline()}>
        <MapView testID="map" mapStyle="https://other.example.org/style.json" />
      </MapProvider>
    );
    expect(screen.queryByTestId('offline-map-badge-container')).not.toBeOnTheScreen();
  });
});

describe('map errors feed the offline switch (D16)', () => {
  beforeEach(() => resetMaplibreFakes());

  it('reports a failed load of the provider style, not of a map’s own style, and not while offline', async () => {
    const reportMapError = jest.fn();
    const onDidFailLoadingMap = jest.fn();
    const { rerender } = await render(
      <MapProvider config={config} colorScheme="light" offline={offline({ mode: 'online', reportMapError })}>
        <MapView testID="map" onDidFailLoadingMap={onDidFailLoadingMap} />
      </MapProvider>
    );
    await act(() => screen.getByTestId('map').props.onDidFailLoadingMap());
    expect(reportMapError).toHaveBeenCalledWith('style');
    expect(onDidFailLoadingMap).toHaveBeenCalledTimes(1);

    await rerender(
      <MapProvider config={config} colorScheme="light" offline={offline({ mode: 'online', reportMapError })}>
        <MapView testID="map" styleURL="https://other.example.org/style.json" />
      </MapProvider>
    );
    await act(() => screen.getByTestId('map').props.onDidFailLoadingMap());
    expect(reportMapError).toHaveBeenCalledTimes(1);

    await rerender(
      <MapProvider config={config} colorScheme="light" offline={offline({ reportMapError })}>
        <MapView testID="map" />
      </MapProvider>
    );
    await act(() => screen.getByTestId('map').props.onDidFailLoadingMap());
    expect(reportMapError).toHaveBeenCalledTimes(1);
  });
});
