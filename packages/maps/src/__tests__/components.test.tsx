import type { MapMakerInfoData } from '@resgrid/models';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import { LocationPicker } from '../components/location-picker';
import { MapLayersSheet } from '../components/map-controls';
import { MapLegendSheet } from '../components/map-legend-sheet';
import { MapPins } from '../components/map-pins';
import { PinDetailSheet } from '../components/pin-detail-sheet';
import { StaticMap } from '../components/static-map';
import { MapProvider, type MapProviderProps } from '../provider/map-provider';
import { MapView } from '../rg';
import { resetMaplibreFakes } from './fakes/maplibre-react-native';

const config = { MapLibreStyleUrlDay: 'https://maps.example.org/day.json', MapCenterLatitude: 50.9, MapCenterLongitude: 3.7, MapCenterZoomLevel: 11 };

const renderWithProvider = (ui: React.ReactElement, props: Partial<MapProviderProps> = {}) =>
  render(
    <MapProvider config={config} colorScheme="light" icons={{ call: 1, station: 2 }} {...props}>
      {ui}
    </MapProvider>
  );

const pin = (overrides: Partial<MapMakerInfoData>): MapMakerInfoData => ({
  Id: 'c1',
  Longitude: 3.7,
  Latitude: 50.9,
  Title: 'Structure fire',
  zIndex: 0,
  ImagePath: 'Call',
  InfoWindowContent: '',
  Color: '',
  Type: 0,
  PoiImage: '',
  ...overrides,
});

describe('MapPins', () => {
  beforeEach(() => resetMaplibreFakes());

  it('draws pins as one symbol layer over a generated sprite and only the selected pin as a MarkerView', () => {
    const pins = [pin({ Id: 'c1' }), pin({ Id: 'c2', Title: 'Medical' }), pin({ Id: 's1', Type: 2, ImagePath: 'Station', Title: 'Station 1' })];
    renderWithProvider(
      <MapView testID="map">
        <MapPins pins={pins} selectedPinId="c2" canViewPersonnel={true} />
      </MapView>
    );
    const source = screen.getByTestId('mlrn-source-resgrid-pins-source');
    expect(source.props.data.features.map((feature: { id: string }) => feature.id)).toEqual(['c1', 's1']);
    expect(screen.getByTestId('mlrn-images').props.images).toEqual({ 'pin-bundled-call': 1, 'pin-bundled-station': 2 });
    expect(screen.getByTestId('mlrn-layer-resgrid-pins-symbols').props.layout).toMatchObject({ 'icon-image': ['get', 'icon'], 'icon-allow-overlap': true });
    expect(screen.getByTestId('mlrn-marker-resgrid-pins-selected').props.lngLat).toEqual([3.7, 50.9]);
    expect(screen.getAllByTestId('pin-marker')).toHaveLength(1);
  });

  it('renders no MarkerView without a selection and reports presses through the symbol layer', () => {
    const onPinPress = jest.fn();
    renderWithProvider(
      <MapView testID="map">
        <MapPins pins={[pin({ Id: 'c1' }), pin({ Id: 'p1', Type: 3, ImagePath: 'Person' })]} canViewPersonnel={false} onPinPress={onPinPress} />
      </MapView>
    );
    expect(screen.queryByTestId('mlrn-marker-resgrid-pins-selected')).toBeNull();
    const source = screen.getByTestId('mlrn-source-resgrid-pins-source');
    expect(source.props.data.features).toHaveLength(1);
    source.props.onPress({ nativeEvent: { features: [{ properties: { pinId: 'c1' } }], lngLat: [3.7, 50.9], point: [1, 1] } });
    expect(onPinPress).toHaveBeenCalledWith(expect.objectContaining({ Id: 'c1' }));
  });
});

describe('LocationPicker', () => {
  beforeEach(() => resetMaplibreFakes());

  it('returns the tapped coordinates on confirm', () => {
    const onLocationSelected = jest.fn();
    renderWithProvider(<LocationPicker onLocationSelected={onLocationSelected} autoLocate={false} />);
    expect(screen.getByTestId('location-picker-prompt')).toBeTruthy();
    act(() => screen.getByTestId('location-picker-map').props.onPress({ nativeEvent: { lngLat: [4.4, 51.2], point: [5, 5] } }));
    expect(screen.getByTestId('mlrn-marker-picked-location').props.lngLat).toEqual([4.4, 51.2]);
    fireEvent.press(screen.getByTestId('location-picker-confirm'));
    expect(onLocationSelected).toHaveBeenCalledWith({ latitude: 51.2, longitude: 4.4, address: undefined });
  });

  it('starts from the device position when there is no initial location (Null Island counts as none)', async () => {
    const getCurrentPosition = jest.fn(async () => ({ latitude: 40, longitude: -75 }));
    const onLocationSelected = jest.fn();
    renderWithProvider(<LocationPicker initialLocation={{ latitude: 0, longitude: 0 }} onLocationSelected={onLocationSelected} />, { services: { getCurrentPosition } });
    await waitFor(() => expect(screen.getByTestId('mlrn-marker-picked-location').props.lngLat).toEqual([-75, 40]));
    fireEvent.press(screen.getByTestId('location-picker-confirm'));
    expect(onLocationSelected).toHaveBeenCalledWith({ latitude: 40, longitude: -75, address: undefined });
  });
});

describe('StaticMap', () => {
  it('uses the server static map template when present', () => {
    renderWithProvider(<StaticMap latitude={50.9} longitude={3.7} height={150} zoom={14} />, {
      config: { ...config, StaticMapUrlTemplate: 'https://api.example.org/static?lat={lat}&lon={lon}&z={zoom}&w={width}&h={height}' },
    });
    fireEvent(screen.getByTestId('static-map'), 'layout', { nativeEvent: { layout: { width: 300, height: 150, x: 0, y: 0 } } });
    expect(screen.getByTestId('static-map-image').props.source).toEqual({ uri: 'https://api.example.org/static?lat=50.900000&lon=3.700000&z=14&w=300&h=150' });
    expect(screen.queryByTestId('static-map-map')).toBeNull();
  });

  it('falls back to a non-interactive map without a template, and a placeholder without a location', () => {
    const { rerender } = renderWithProvider(<StaticMap latitude={50.9} longitude={3.7} />);
    const map = screen.getByTestId('static-map-map');
    expect(map.props.dragPan).toBe(false);
    expect(map.props.attribution).toBe(true);
    rerender(
      <MapProvider config={config} colorScheme="light">
        <StaticMap latitude={0} longitude={0} />
      </MapProvider>
    );
    expect(screen.getByTestId('static-map-empty')).toBeTruthy();
  });
});

describe('sheets', () => {
  it('shows pin actions only for the callbacks given', () => {
    const onViewCall = jest.fn();
    const onClose = jest.fn();
    renderWithProvider(<PinDetailSheet pin={pin({ Address: '1 Main St' })} isOpen={true} onClose={onClose} onViewCall={onViewCall} />);
    expect(screen.getByTestId('pin-detail-address')).toBeTruthy();
    expect(screen.queryByTestId('pin-detail-route')).toBeNull();
    fireEvent.press(screen.getByTestId('pin-detail-view-call'));
    expect(onViewCall).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('uses the overlay slot the app passes in', () => {
    const Sheet = ({ isOpen, children }: { isOpen: boolean; children: React.ReactNode }) => (isOpen ? <>{children}</> : null);
    const onToggle = jest.fn();
    renderWithProvider(<MapLayersSheet isOpen={true} onClose={jest.fn()} layers={[{ Id: 'l1', Name: 'Hydrants', Color: '#f00' }]} toggles={{ l1: false }} onToggle={onToggle} />, { overlays: { Sheet } });
    fireEvent(screen.getByTestId('layer-toggle-l1'), 'valueChange', true);
    expect(onToggle).toHaveBeenCalledWith('l1');
    expect(screen.queryByTestId('map-layers-sheet')).toBeNull();
  });

  it('loads the legend when opened and hides personnel without PII rights', async () => {
    const loadLegend = jest.fn(async () => ({
      StatusStyles: [{ Key: 'available', Color: '#00ff00', UnitStatuses: ['Available'], PersonnelStatuses: ['Standing by'] }],
      Personnel: [{ Id: null, Name: '', States: [] }],
      Units: [{ Id: 4, Name: 'Engine', States: [{ Id: 1, Name: 'Available' }] }],
    }));
    renderWithProvider(<MapLegendSheet isOpen={true} onClose={jest.fn()} canViewPersonnel={false} loadLegend={loadLegend} />);
    await waitFor(() => expect(screen.getByTestId('map-legend-content')).toBeTruthy());
    expect(screen.getByTestId('map-legend-status-available')).toBeTruthy();
    expect(screen.getByTestId('map-legend-units-4')).toBeTruthy();
    expect(screen.queryByTestId('map-legend-heading-personnel')).toBeNull();
  });
});
