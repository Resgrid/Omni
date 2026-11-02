// The Jest setup must load before @resgrid/ui (gluestack, NativeWind): keep this side-effect import first.
import './test-setup';

import { useCustomMapsStore } from '@resgrid/data';
import { offlineFloorSourceId } from '@resgrid/maps';
import { type CustomMapLayerResultData, CustomMapType, type IndoorMapFloorResultData } from '@resgrid/models';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';
import React from 'react';

import { layerViewMode, listedCustomMaps, searchResultRoute } from '../lib/map-viewer';
import { customMapsRoutes, readMapParam } from '../routes';
import CustomMapScreen from '../screens/custom-map';
import IndoorMapScreen from '../screens/indoor-map';
import MapsHomeScreen from '../screens/maps-home';
import MapsSearchScreen, { MAP_SEARCH_DEBOUNCE_MS } from '../screens/maps-search';

const { mockMapStyle } = jest.requireMock('@resgrid/maps') as { mockMapStyle: { value: { mapStyle: unknown; isOffline: boolean } } };

const API = 'https://api.example.org/api/v4';
const mercator = `${API}/Mapping/GetCustomMapMercatorTile/G1/{z}/{x}/{y}?sig=1`;

const region = (id: string, layerId: string) => ({
  IndoorMapZoneId: id,
  IndoorMapFloorId: layerId,
  Name: `Region ${id}`,
  Description: 'Staging',
  ZoneType: 0,
  PixelGeometry: '[[0,0],[500,0],[500,500]]',
  GeoGeometry: null,
  CenterPixelX: 250,
  CenterPixelY: 250,
  CenterLatitude: 38.6,
  CenterLongitude: -121.4,
  Color: '#22c55e',
  Metadata: null,
  IsSearchable: true,
  IsDispatchable: false,
});

const layer = (id: string, overrides: Partial<CustomMapLayerResultData> = {}): CustomMapLayerResultData => ({
  IndoorMapFloorId: id,
  IndoorMapId: 'M1',
  Name: `Layer ${id}`,
  FloorOrder: 0,
  LayerType: 0,
  HasImage: true,
  IsTiled: false,
  TileMinZoom: null,
  TileMaxZoom: null,
  BoundsNELat: null,
  BoundsNELon: null,
  BoundsSWLat: null,
  BoundsSWLon: null,
  Opacity: 1,
  MercatorTileUrl: null,
  Regions: [],
  ...overrides,
});

const customMap = (layers: CustomMapLayerResultData[]) => ({
  Map: {
    IndoorMapId: 'M1',
    Name: 'Fairground',
    Description: null,
    MapType: CustomMapType.Event,
    CenterLatitude: 38.6,
    CenterLongitude: -121.4,
    BoundsNELat: 38.7,
    BoundsNELon: -121.3,
    BoundsSWLat: 38.5,
    BoundsSWLon: -121.5,
    BoundsGeoJson: null,
    DefaultFloorId: null,
  },
  Layers: layers,
});

const floor = (id: string, order: number, overrides: Partial<IndoorMapFloorResultData> = {}): IndoorMapFloorResultData => ({
  IndoorMapFloorId: id,
  IndoorMapId: 'I1',
  Name: `Level ${order}`,
  FloorOrder: order,
  HasImage: true,
  BoundsNELat: 38.61,
  BoundsNELon: -121.39,
  BoundsSWLat: 38.6,
  BoundsSWLon: -121.4,
  Opacity: 1,
  Zones: [],
  ...overrides,
});

const fetchCustomMap = jest.fn(async () => undefined);
const fetchIndoorMap = jest.fn(async () => undefined);
const fetchIndoorFloor = jest.fn(async () => undefined);
const fetchCustomMaps = jest.fn(async () => undefined);
const fetchIndoorMaps = jest.fn(async () => undefined);
const searchMapFeatures = jest.fn(async () => undefined);

beforeEach(() => {
  mockMapStyle.value = { mapStyle: 'https://maps.example.org/day.json', isOffline: false };
  (router.push as jest.Mock).mockClear();
  jest.mocked(useLocalSearchParams).mockReturnValue({});
  useCustomMapsStore.setState({
    customMaps: [],
    indoorMaps: [],
    customMapById: {},
    indoorMapById: {},
    floorById: {},
    searchResults: [],
    searchTerm: '',
    loading: {},
    errors: {},
    fetchCustomMap,
    fetchIndoorMap,
    fetchIndoorFloor,
    fetchCustomMaps,
    fetchIndoorMaps,
    searchMapFeatures,
  });
});

describe('custom map helpers', () => {
  it('tells georeferenced, pixel-only and undrawable layers apart (D21)', () => {
    expect(layerViewMode(layer('a', { MercatorTileUrl: mercator, IsTiled: true, HasImage: false }))).toBe('geo');
    expect(layerViewMode(layer('b', { BoundsNELat: 2, BoundsNELon: 4, BoundsSWLat: 1, BoundsSWLon: 3 }))).toBe('geo');
    expect(layerViewMode(layer('c'))).toBe('pixel');
    expect(layerViewMode(layer('d', { HasImage: false, IsTiled: true }))).toBe('none');
    expect(layerViewMode(layer('e', { MercatorTileUrl: 'http://evil.example/{z}/{x}/{y}', HasImage: false }))).toBe('none');
  });

  it('lists custom maps without the indoor ones and routes search results to their map', () => {
    expect(listedCustomMaps([{ ...customMap([]).Map, MapType: CustomMapType.Indoor }, customMap([]).Map]).map((map) => map.MapType)).toEqual([CustomMapType.Event]);
    expect(searchResultRoute({ FeatureType: 'indoor_zone', Id: 'z1', MapId: 'I1', FloorOrLayerId: 'F2' } as never)).toBe('/maps/indoor/I1?floorId=F2&featureId=z1');
    expect(searchResultRoute({ FeatureType: 'custom_region', Id: 'r1', MapId: 'M1', FloorOrLayerId: 'L1' } as never)).toBe('/maps/custom/M1?layerId=L1&featureId=r1');
    expect(searchResultRoute({ FeatureType: 'custom_region', Id: 'r1', MapId: '' } as never)).toBeNull();
    expect(customMapsRoutes.custom('M1')).toBe('/maps/custom/M1');
    expect(readMapParam(['abc'])).toBe('abc');
    expect(readMapParam('../x')).toBeNull();
  });
});

describe('MapsHomeScreen', () => {
  it('loads and lists custom and indoor maps, and opens them and the search', async () => {
    useCustomMapsStore.setState({
      customMaps: [customMap([]).Map, { ...customMap([]).Map, IndoorMapId: 'I1', Name: 'HQ', MapType: CustomMapType.Indoor }],
      indoorMaps: [{ IndoorMapId: 'I1', Name: 'HQ', Description: 'Main building', CenterLatitude: 0, CenterLongitude: 0, BoundsNELat: 0, BoundsNELon: 0, BoundsSWLat: 0, BoundsSWLon: 0, DefaultFloorId: null }],
    });
    await render(<MapsHomeScreen />);
    expect(fetchCustomMaps).toHaveBeenCalled();
    expect(fetchIndoorMaps).toHaveBeenCalled();
    expect(screen.getByTestId('maps-custom-M1')).toBeTruthy();
    expect(screen.queryByTestId('maps-custom-I1')).toBeNull();
    await fireEvent.press(screen.getByTestId('maps-indoor-I1'));
    expect(router.push).toHaveBeenCalledWith('/maps/indoor/I1');
    await fireEvent.press(screen.getByTestId('maps-home-search'));
    expect(router.push).toHaveBeenCalledWith('/maps/search');
  });

  it('says so when the department has no maps', async () => {
    await render(<MapsHomeScreen />);
    expect(screen.getByTestId('maps-home-empty')).toBeTruthy();
  });
});

describe('MapsSearchScreen', () => {
  it('searches after a pause, by scope, and opens a result at its feature', async () => {
    jest.useFakeTimers();
    try {
      await render(<MapsSearchScreen />);
      await fireEvent.changeText(screen.getByTestId('maps-search-input'), 'lobby');
      expect(searchMapFeatures).not.toHaveBeenCalled();
      await act(async () => {
        jest.advanceTimersByTime(MAP_SEARCH_DEBOUNCE_MS);
      });
      expect(searchMapFeatures).toHaveBeenCalledWith('lobby', 'all');
      await fireEvent.press(screen.getByTestId('maps-search-scope-indoor'));
      await act(async () => {
        jest.advanceTimersByTime(MAP_SEARCH_DEBOUNCE_MS);
      });
      expect(searchMapFeatures).toHaveBeenLastCalledWith('lobby', 'indoor');
      await act(async () =>
        useCustomMapsStore.setState({
          searchResults: [
            {
              FeatureType: 'indoor_zone',
              Id: 'z1',
              Name: 'Lobby',
              Description: null,
              MapId: 'I1',
              MapName: 'HQ',
              FloorOrLayerId: 'F1',
              FloorOrLayerName: 'Level 1',
              CenterLatitude: 0,
              CenterLongitude: 0,
              IsDispatchable: false,
            },
          ],
        })
      );
      await fireEvent.press(screen.getByTestId('maps-search-result-z1'));
      expect(router.push).toHaveBeenCalledWith('/maps/indoor/I1?floorId=F1&featureId=z1');
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('CustomMapScreen', () => {
  it('draws georeferenced layers on the department map and opens a tapped region', async () => {
    jest.mocked(useLocalSearchParams).mockReturnValue({ id: 'M1' });
    useCustomMapsStore.setState({ customMapById: { M1: customMap([layer('G1', { MercatorTileUrl: mercator, IsTiled: true, HasImage: false, Regions: [region('r1', 'G1')] })]) } });
    await render(<CustomMapScreen />);
    expect(fetchCustomMap).toHaveBeenCalledWith('M1');
    expect(screen.getByTestId('mock-camera')).toHaveTextContent('bounds:-121.5,38.5:-121.3,38.7');
    await fireEvent.press(screen.getByTestId('mock-region-r1'));
    expect(screen.getByTestId('custom-map-region')).toHaveTextContent(/Region r1/);
    await fireEvent.press(screen.getByTestId('custom-map-region-close'));
    expect(screen.queryByTestId('custom-map-region')).toBeNull();
  });

  it('shows a pixel-only layer in the pixel viewer with its regions, and switches between layers (D21)', async () => {
    jest.mocked(useLocalSearchParams).mockReturnValue({ id: 'M1' });
    useCustomMapsStore.setState({ customMapById: { M1: customMap([layer('G1', { MercatorTileUrl: mercator, IsTiled: true, HasImage: false }), layer('P1', { FloorOrder: 1, Regions: [region('r2', 'P1')] })]) } });
    await render(<CustomMapScreen />);
    expect(screen.getByTestId('mock-custom-layer-G1')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('custom-map-layers-button'));
    await fireEvent.press(screen.getByTestId('mock-toggle-P1'));
    const pixel = screen.getByTestId('custom-map-pixel');
    expect(pixel.props.accessibilityLabel).toBe(`server:${API}/Mapping/GetCustomMapLayerImage/P1`);
    await fireEvent.press(screen.getByTestId('mock-pixel-region-r2'));
    expect(screen.getByTestId('custom-map-region')).toHaveTextContent(/Region r2/);
    await fireEvent.press(screen.getByTestId('mock-toggle-G1'));
    expect(screen.queryByTestId('custom-map-pixel')).toBeNull();
    expect(screen.getByTestId('mock-custom-layer-G1')).toBeTruthy();
  });

  it('opens a requested pixel layer with its region, from the downloaded image offline or with a note when it is not saved', async () => {
    jest.mocked(useLocalSearchParams).mockReturnValue({ id: 'M1', layerId: 'P1', featureId: 'r2' });
    mockMapStyle.value = { mapStyle: { version: 8, sources: { [offlineFloorSourceId('P1')]: { type: 'image', url: 'file:///floors/P1.png', coordinates: [] } }, layers: [] }, isOffline: true };
    useCustomMapsStore.setState({ customMapById: { M1: customMap([layer('G1', { MercatorTileUrl: mercator, IsTiled: true, HasImage: false }), layer('P1', { Regions: [region('r2', 'P1')] })]) } });
    const view = await render(<CustomMapScreen />);
    expect(screen.getByTestId('custom-map-pixel').props.accessibilityLabel).toBe('local:file:///floors/P1.png');
    expect(screen.getByTestId('custom-map-region')).toHaveTextContent(/Region r2/);

    mockMapStyle.value = { mapStyle: { version: 8, sources: {}, layers: [] }, isOffline: true };
    await view.rerender(<CustomMapScreen />);
    expect(screen.getByTestId('custom-map-image-offline')).toBeTruthy();
  });

  it('says when a map has nothing this app can draw', async () => {
    jest.mocked(useLocalSearchParams).mockReturnValue({ id: 'M1' });
    useCustomMapsStore.setState({ customMapById: { M1: customMap([layer('T1', { HasImage: false, IsTiled: true })]) } });
    await render(<CustomMapScreen />);
    expect(screen.getByTestId('custom-map-nothing')).toBeTruthy();
  });
});

describe('IndoorMapScreen', () => {
  const indoor = (floors: IndoorMapFloorResultData[], defaultFloorId: string | null = null) => ({
    Map: {
      IndoorMapId: 'I1',
      Name: 'HQ',
      Description: null,
      CenterLatitude: 38.6,
      CenterLongitude: -121.4,
      BoundsNELat: 38.61,
      BoundsNELon: -121.39,
      BoundsSWLat: 38.6,
      BoundsSWLon: -121.4,
      DefaultFloorId: defaultFloorId,
    },
    Floors: floors,
  });

  it('opens the default floor on the map, loads its zones and switches floors', async () => {
    jest.mocked(useLocalSearchParams).mockReturnValue({ id: 'I1' });
    useCustomMapsStore.setState({ indoorMapById: { I1: indoor([floor('F1', 1), floor('F2', 2, { BoundsNELat: null, BoundsNELon: null, BoundsSWLat: null, BoundsSWLon: null, Zones: [region('z9', 'F2')] })], 'F1') } });
    await render(<IndoorMapScreen />);
    expect(fetchIndoorMap).toHaveBeenCalledWith('I1');
    await waitFor(() => expect(fetchIndoorFloor).toHaveBeenCalledWith('F1'));
    expect(screen.getByTestId('mock-floor-layer-F1')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('indoor-floor-F2'));
    expect(fetchIndoorFloor).toHaveBeenLastCalledWith('F2');
    // Level 2 has no geographic bounds: the pixel viewer with its zones.
    expect(screen.getByTestId('indoor-map-pixel').props.accessibilityLabel).toBe(`server:${API}/Mapping/GetIndoorMapFloorImage/F2`);
    await fireEvent.press(screen.getByTestId('mock-pixel-region-z9'));
    expect(screen.getByTestId('indoor-map-zone')).toHaveTextContent(/Region z9/);
  });

  it('opens a requested floor centred on the requested zone', async () => {
    jest.mocked(useLocalSearchParams).mockReturnValue({ id: 'I1', floorId: 'F2', featureId: 'z1' });
    useCustomMapsStore.setState({ indoorMapById: { I1: indoor([floor('F1', 1), floor('F2', 2, { Zones: [region('z1', 'F2')] })]) } });
    await render(<IndoorMapScreen />);
    expect(screen.getByTestId('mock-floor-layer-F2')).toBeTruthy();
    expect(screen.getByTestId('mock-camera')).toHaveTextContent('center:-121.4,38.6@19');
    expect(screen.getByTestId('indoor-map-zone')).toBeTruthy();
  });
});
