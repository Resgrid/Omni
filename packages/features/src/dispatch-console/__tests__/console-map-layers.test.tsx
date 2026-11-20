/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock factories run lazily, so they require modules inside. */
import '../../calls/__tests__/test-setup';

import { useCustomMapsStore, useMapMarkersStore } from '@resgrid/data';
import { render, screen } from '@testing-library/react-native';
import React from 'react';

import { activateVariant, setRights } from '../../calls/__tests__/test-utils';
import { ACTIVE_LAYERS_REFRESH_MS } from '../../map/hooks/use-department-layers';
import { useMapViewStore } from '../../map/hooks/use-map-view-store';
import { ConsoleMap } from '../components/console-map';

const mockCapabilities = { layers: true, customIndoor: true, navigationInApp: false };

jest.mock('@resgrid/maps', () => {
  const { Text, View } = require('react-native');
  const mockReact = require('react');

  return {
    MapView: ({ children, testID }: { children?: unknown; testID?: string }) => mockReact.createElement(View, { testID }, children),
    Camera: () => null,
    MapPins: () => null,
    TrafficLayer: () => null,
    MapTrafficButton: () => null,
    GeoJsonMapLayer: ({ id, color }: { id: string; color?: string | null }) => mockReact.createElement(Text, { testID: `mock-${id}` }, color ?? ''),
    OfflineDepartmentLayers: ({ visibleLayerIds, excludeLayerIds, idPrefix }: { visibleLayerIds?: string[] | null; excludeLayerIds?: string[]; idPrefix?: string }) =>
      mockReact.createElement(Text, { testID: `mock-${idPrefix}` }, JSON.stringify({ visible: visibleLayerIds ?? null, exclude: excludeLayerIds ?? [] })),
    useMapCapabilities: () => mockCapabilities,
    useMapStyle: () => ({ isAvailable: true, status: 'ready' }),
    useMapCenter: () => ({ latitude: 39, longitude: -105, zoomLevel: 9 }),
  };
});

const MARATHON_ROUTE = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: [
          [3.7, 51.05],
          [3.71, 51.06],
        ],
      },
      properties: { name: 'Route' },
    },
  ],
};

const mocks = {
  fetchActiveLayers: jest.fn(async () => undefined),
  fetchMapLayers: jest.fn(async () => undefined),
  fetchLayerGeoJSON: jest.fn(async () => null),
};

beforeEach(() => {
  jest.clearAllMocks();
  mockCapabilities.layers = true;
  activateVariant('dispatch');
  setRights({ CanViewPII: true });
  useMapViewStore.getState().reset();
  useMapMarkersStore.setState({ markers: [], centerLatitude: 39, centerLongitude: -105, zoomLevel: 11 });
  useCustomMapsStore.setState({
    // E1 is an imported event layer Core reports on while its event runs; L2 is off by default.
    activeLayers: [{ Id: 'E1', Name: 'City marathon', LayerSource: 'maplayer', Type: 0, Color: '#ff8800', IsSearchable: false, IsOnByDefault: true }],
    mapLayers: [
      {
        Id: 'L2',
        DepartmentId: 1,
        Name: 'Flood zones',
        Type: 0,
        Color: '#0000ff',
        IsSearchable: false,
        IsOnByDefault: false,
        AddedById: '',
        AddedOn: '',
        UpdatedById: '',
        UpdatedOn: '',
        Description: '',
        EventStartsOnUtc: null,
        EventEndsOnUtc: null,
        EventPhase: 'none',
        Organizer: '',
        ContactName: '',
        ContactPhone: '',
        ContactEmail: '',
        SourceFileName: '',
      },
    ],
    layerGeoJSON: { E1: MARATHON_ROUTE, L2: MARATHON_ROUTE },
    fetchActiveLayers: mocks.fetchActiveLayers,
    fetchMapLayers: mocks.fetchMapLayers,
    fetchLayerGeoJSON: mocks.fetchLayerGeoJSON,
  });
});

describe('ConsoleMap department layers', () => {
  it('draws the layers that are on (an imported event layer included) under the pins, and loads the layer lists', async () => {
    await render(<ConsoleMap />);
    expect(screen.getByTestId('mock-console-layer-E1')).toHaveTextContent('#ff8800');
    expect(screen.queryByTestId('mock-console-layer-L2')).toBeNull();
    expect(JSON.parse(String(screen.getByTestId('mock-console-offline-layers').props.children))).toEqual({ visible: ['E1'], exclude: ['E1'] });
    expect(mocks.fetchActiveLayers).toHaveBeenCalled();
    expect(mocks.fetchMapLayers).toHaveBeenCalled();
  });

  it('follows the dispatcher’s layer toggles from the Map screen', async () => {
    useMapViewStore.getState().setLayer('E1', false);
    useMapViewStore.getState().setLayer('L2', true);
    await render(<ConsoleMap />);
    expect(screen.queryByTestId('mock-console-layer-E1')).toBeNull();
    expect(screen.getByTestId('mock-console-layer-L2')).toBeTruthy();
  });

  it('fetches the GeoJSON of an on layer that is not loaded yet', async () => {
    useCustomMapsStore.setState({ layerGeoJSON: {} });
    await render(<ConsoleMap />);
    expect(mocks.fetchLayerGeoJSON).toHaveBeenCalledWith('E1');
    expect(screen.queryByTestId('mock-console-layer-E1')).toBeNull();
  });

  it('draws and loads nothing without the maps.layers capability', async () => {
    mockCapabilities.layers = false;
    await render(<ConsoleMap />);
    expect(screen.queryByTestId('mock-console-layer-E1')).toBeNull();
    expect(screen.queryByTestId('mock-console-offline-layers')).toBeNull();
    expect(mocks.fetchActiveLayers).not.toHaveBeenCalled();
  });

  it('re-reads the on-by-default list while the console stays open', async () => {
    jest.useFakeTimers();

    try {
      const view = await render(<ConsoleMap />);
      expect(mocks.fetchActiveLayers).toHaveBeenCalledTimes(1);
      jest.advanceTimersByTime(ACTIVE_LAYERS_REFRESH_MS);
      expect(mocks.fetchActiveLayers).toHaveBeenCalledTimes(2);
      expect(mocks.fetchActiveLayers).toHaveBeenLastCalledWith({ bypassCache: true });
      await view.unmount();
      jest.advanceTimersByTime(ACTIVE_LAYERS_REFRESH_MS);
      expect(mocks.fetchActiveLayers).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });
});
