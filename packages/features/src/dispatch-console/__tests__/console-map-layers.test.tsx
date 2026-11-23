/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock factories run lazily, so they require modules inside. */
import '../../calls/__tests__/test-setup';

import { useCustomMapsStore, useMapMarkersStore } from '@resgrid/data';
import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { activateVariant, setRights } from '../../calls/__tests__/test-utils';
import { facilityMapsState } from '../../map/__tests__/facility-fixtures';
import { ACTIVE_LAYERS_REFRESH_MS } from '../../map/hooks/use-department-layers';
import { useMapViewStore } from '../../map/hooks/use-map-view-store';
import { ConsoleMap } from '../components/console-map';

const mockCapabilities = { layers: true, customIndoor: true, navigationInApp: false };
const mockFitBounds = jest.fn();

jest.mock('@resgrid/maps', () => {
  const { Pressable, Text, View } = require('react-native');
  const mockReact = require('react');

  type MockZone = { IndoorMapZoneId: string };

  return {
    ...jest.requireActual('@resgrid/maps/lib/pixel-frame'),
    isSafeMapUrl: jest.requireActual('@resgrid/maps/provider/url-safety').isSafeMapUrl,
    MapView: ({ children, testID }: { children?: unknown; testID?: string }) => mockReact.createElement(View, { testID }, children),
    // Exposes the camera's fitBounds (a facility map switched on is framed).
    Camera: mockReact.forwardRef((_props: Record<string, never>, ref: React.ForwardedRef<{ fitBounds: jest.Mock; setCamera: jest.Mock }>) => {
      mockReact.useImperativeHandle(ref, () => ({ fitBounds: mockFitBounds, setCamera: jest.fn() }));

      return null;
    }),
    MapPins: () => null,
    TrafficLayer: () => null,
    MapTrafficButton: () => null,
    GeoJsonMapLayer: ({ id, color }: { id: string; color?: string | null }) => mockReact.createElement(Text, { testID: `mock-${id}` }, color ?? ''),
    OfflineDepartmentLayers: ({ visibleLayerIds, excludeLayerIds, idPrefix }: { visibleLayerIds?: string[] | null; excludeLayerIds?: string[]; idPrefix?: string }) =>
      mockReact.createElement(Text, { testID: `mock-${idPrefix}` }, JSON.stringify({ visible: visibleLayerIds ?? null, exclude: excludeLayerIds ?? [] })),
    // A facility map's layer or floor, with one pressable per region or zone.
    CustomMapRasterLayer: ({ layer, onRegionPress }: { layer: { IndoorMapFloorId: string; Regions?: MockZone[] }; onRegionPress?: (id: string) => void }) =>
      mockReact.createElement(
        View,
        { testID: `mock-custom-map-${layer.IndoorMapFloorId}` },
        (layer.Regions ?? []).map((region) => mockReact.createElement(Pressable, { key: region.IndoorMapZoneId, testID: `mock-region-${region.IndoorMapZoneId}`, onPress: () => onRegionPress?.(region.IndoorMapZoneId) }))
      ),
    IndoorMapFloorLayer: ({ floor, onZonePress, selectedZoneId }: { floor: { IndoorMapFloorId: string; Zones?: MockZone[] }; onZonePress?: (id: string) => void; selectedZoneId?: string | null }) =>
      mockReact.createElement(
        View,
        { testID: `mock-indoor-floor-${floor.IndoorMapFloorId}`, accessibilityLabel: `selected:${selectedZoneId ?? ''}` },
        (floor.Zones ?? []).map((zone) => mockReact.createElement(Pressable, { key: zone.IndoorMapZoneId, testID: `mock-zone-${zone.IndoorMapZoneId}`, onPress: () => onZonePress?.(zone.IndoorMapZoneId) }))
      ),
    MapLayersButton: ({ onPress, testID }: { onPress: () => void; testID?: string }) => mockReact.createElement(Pressable, { onPress, testID }),
    MapLayersSheet: ({
      isOpen,
      facilityMaps,
    }: {
      isOpen: boolean;
      facilityMaps?: {
        items: { Id: string; Name: string; Levels?: { Id: string; Name: string }[]; LevelId?: string | null }[];
        toggles: Record<string, boolean>;
        onToggle: (id: string) => void;
        onSelectLevel: (id: string, levelId: string | null) => void;
      };
    }) =>
      isOpen
        ? mockReact.createElement(
            View,
            { testID: 'mock-layers-sheet' },
            (facilityMaps?.items ?? []).map((item) =>
              mockReact.createElement(
                View,
                { key: item.Id },
                mockReact.createElement(
                  Pressable,
                  { testID: `facility-toggle-${item.Id}`, onPress: () => facilityMaps?.onToggle(item.Id) },
                  mockReact.createElement(Text, null, `${item.Name}:${facilityMaps?.toggles[item.Id] ? 'on' : 'off'}|level:${item.LevelId ?? 'all'}`)
                ),
                (item.Levels ?? []).map((level) => mockReact.createElement(Pressable, { key: level.Id, testID: `facility-level-${item.Id}-${level.Id}`, onPress: () => facilityMaps?.onSelectLevel(item.Id, level.Id) }))
              )
            )
          )
        : null,
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
  fetchCustomMaps: jest.fn(async () => undefined),
  fetchIndoorMaps: jest.fn(async () => undefined),
  fetchCustomMap: jest.fn(async () => undefined),
  fetchIndoorMap: jest.fn(async () => undefined),
  fetchIndoorFloor: jest.fn(async () => undefined),
  fetchCustomMapLayer: jest.fn(async () => undefined),
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
    ...facilityMapsState(),
    fetchCustomMaps: mocks.fetchCustomMaps,
    fetchIndoorMaps: mocks.fetchIndoorMaps,
    fetchCustomMap: mocks.fetchCustomMap,
    fetchIndoorMap: mocks.fetchIndoorMap,
    fetchIndoorFloor: mocks.fetchIndoorFloor,
    fetchCustomMapLayer: mocks.fetchCustomMapLayer,
  });
});

describe('ConsoleMap facility maps', () => {
  it('draws a facility map switched on this session under the layers and names a tapped room', async () => {
    useMapViewStore.getState().toggleFacilityMap('indoor:bldg-a');
    await render(<ConsoleMap />);
    // The default floor, from its own read (the map's floor list has no zones).
    expect(screen.getByTestId('mock-indoor-floor-floor-1')).toBeTruthy();
    expect(screen.queryByTestId('mock-custom-map-site-base')).toBeNull();
    expect(mocks.fetchCustomMaps).toHaveBeenCalled();
    expect(mocks.fetchIndoorMaps).toHaveBeenCalled();

    await fireEvent.press(screen.getByTestId('mock-zone-control'));
    expect(screen.getByTestId('console-map-facility-feature-name')).toHaveTextContent('Control room');
    expect(screen.getByTestId('console-map-facility-feature-place')).toHaveTextContent('Building A · Ground floor');
    expect(screen.getByTestId('mock-indoor-floor-floor-1').props.accessibilityLabel).toBe('selected:control');
    await fireEvent.press(screen.getByTestId('console-map-facility-feature-close'));
    expect(screen.queryByTestId('console-map-facility-feature')).toBeNull();
  });

  it('switches facility maps and their floor or layer from its Layers button', async () => {
    await render(<ConsoleMap />);
    expect(screen.queryByTestId('mock-layers-sheet')).toBeNull();
    await fireEvent.press(screen.getByTestId('console-map-layers-button'));
    expect(screen.getByTestId('facility-toggle-custom:site')).toHaveTextContent('Site emergency plan:off|level:all');

    // A custom map shows every layer it can draw until one is chosen.
    await fireEvent.press(screen.getByTestId('facility-toggle-custom:site'));
    expect(screen.getByTestId('mock-custom-map-site-base')).toBeTruthy();
    expect(screen.getByTestId('mock-custom-map-site-evac')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('facility-level-custom:site-site-base'));
    expect(screen.queryByTestId('mock-custom-map-site-evac')).toBeNull();
    expect(useMapViewStore.getState().facilityMaps).toEqual({ 'custom:site': 'site-base' });

    // An indoor map shows one floor; a floor not read yet is fetched (it carries the rooms).
    await fireEvent.press(screen.getByTestId('facility-toggle-indoor:bldg-a'));
    expect(screen.getByTestId('facility-toggle-indoor:bldg-a')).toHaveTextContent('Building A:on|level:floor-1');
    await fireEvent.press(screen.getByTestId('facility-level-indoor:bldg-a-floor-2'));
    expect(screen.getByTestId('mock-indoor-floor-floor-2')).toBeTruthy();
    expect(screen.queryByTestId('mock-indoor-floor-floor-1')).toBeNull();
    expect(mocks.fetchIndoorFloor).toHaveBeenCalledWith('floor-2');

    await fireEvent.press(screen.getByTestId('facility-toggle-custom:site'));
    expect(screen.queryByTestId('mock-custom-map-site-base')).toBeNull();
  });

  it('frames a facility map switched on (or a floor chosen) and reads its layers for their regions', async () => {
    await render(<ConsoleMap />);
    expect(mockFitBounds).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('console-map-layers-button'));
    await fireEvent.press(screen.getByTestId('facility-toggle-custom:site'));
    expect(mockFitBounds).toHaveBeenCalledTimes(1);
    expect(mockFitBounds).toHaveBeenLastCalledWith([-106.49, 35.01], [-106.5, 35.0], 40, 800);
    expect(mocks.fetchCustomMapLayer).toHaveBeenCalledWith('site-base');
    expect(mocks.fetchCustomMapLayer).toHaveBeenCalledWith('site-evac');

    // Switching a map off frames nothing; choosing a floor frames it again.
    await fireEvent.press(screen.getByTestId('facility-toggle-custom:site'));
    expect(mockFitBounds).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByTestId('facility-toggle-indoor:bldg-a'));
    await fireEvent.press(screen.getByTestId('facility-level-indoor:bldg-a-floor-2'));
    expect(mockFitBounds).toHaveBeenCalledTimes(3);
  });

  it('reads a map switched on that is not on the device yet', async () => {
    useCustomMapsStore.setState({ customMapById: {} });
    useMapViewStore.getState().toggleFacilityMap('custom:site');
    await render(<ConsoleMap />);
    expect(mocks.fetchCustomMap).toHaveBeenCalledWith('site');
    expect(screen.queryByTestId('mock-custom-map-site-base')).toBeNull();
  });

  it('has no Layers button without the maps.layers capability', async () => {
    mockCapabilities.layers = false;
    useMapViewStore.getState().toggleFacilityMap('indoor:bldg-a');
    await render(<ConsoleMap />);
    expect(screen.queryByTestId('console-map-layers-button')).toBeNull();
    expect(screen.queryByTestId('mock-indoor-floor-floor-1')).toBeNull();
    expect(mocks.fetchCustomMaps).not.toHaveBeenCalled();
  });
});

describe('ConsoleMap department layers', () => {
  it('draws the layers that are on (an imported event layer included) under the pins, and loads the layer lists', async () => {
    await render(<ConsoleMap />);
    expect(screen.getByTestId('mock-console-layer-E1')).toHaveTextContent('#ff8800');
    expect(screen.queryByTestId('mock-console-layer-L2')).toBeNull();
    expect(JSON.parse(String(screen.getByTestId('mock-console-offline-layers').props.children))).toEqual({ visible: ['E1'], exclude: ['E1'] });
    // The light on-by-default list skips the API cache when the map opens, so a layer uploaded a minute ago shows.
    expect(mocks.fetchActiveLayers).toHaveBeenCalledWith({ bypassCache: true });
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
