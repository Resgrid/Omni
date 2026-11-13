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

const renderWithProvider = async (ui: React.ReactElement, props: Partial<MapProviderProps> = {}) =>
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

  it('draws pins as one symbol layer over a generated sprite and only the selected pin as a MarkerView', async () => {
    const pins = [pin({ Id: 'c1' }), pin({ Id: 'c2', Title: 'Medical' }), pin({ Id: 's1', Type: 2, ImagePath: 'Station', Title: 'Station 1' })];
    await renderWithProvider(
      <MapView testID="map">
        <MapPins pins={pins} selectedPinId="c2" canViewPersonnel={true} />
      </MapView>
    );
    const source = screen.getByTestId('mlrn-source-resgrid-pins-source');
    expect(source.props.data.features.map((feature: { id: string }) => feature.id)).toEqual(['c1', 's1']);
    expect(screen.getByTestId('mlrn-images').props.images).toEqual({ 'pin-bundled-call': 1, 'pin-bundled-station': 2 });
    expect(screen.getByTestId('mlrn-layer-resgrid-pins-symbols').props.layout).toMatchObject({ 'icon-image': ['get', 'icon'], 'icon-size': ['*', 1, ['get', 'iconScale']], 'icon-allow-overlap': true });
    expect(source.props.data.features.map((feature: { properties: { iconScale: number } }) => feature.properties.iconScale)).toEqual([1, 1]);
    expect(screen.getByTestId('mlrn-marker-resgrid-pins-selected').props.lngLat).toEqual([3.7, 50.9]);
    expect(screen.getAllByTestId('pin-marker')).toHaveLength(1);
  });

  it('renders no MarkerView without a selection and reports presses through the symbol layer', async () => {
    const onPinPress = jest.fn();
    await renderWithProvider(
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

  it('returns the tapped coordinates on confirm', async () => {
    const onLocationSelected = jest.fn();
    await renderWithProvider(<LocationPicker onLocationSelected={onLocationSelected} autoLocate={false} />);
    expect(screen.getByTestId('location-picker-prompt')).toBeTruthy();
    await act(() => screen.getByTestId('location-picker-map').props.onPress({ nativeEvent: { lngLat: [4.4, 51.2], point: [5, 5] } }));
    expect(screen.getByTestId('mlrn-marker-picked-location').props.lngLat).toEqual([4.4, 51.2]);
    await fireEvent.press(screen.getByTestId('location-picker-confirm'));
    expect(onLocationSelected).toHaveBeenCalledWith({ latitude: 51.2, longitude: 4.4, address: undefined });
  });

  it('starts from the device position when there is no initial location (Null Island counts as none)', async () => {
    const getCurrentPosition = jest.fn(async () => ({ latitude: 40, longitude: -75 }));
    const onLocationSelected = jest.fn();
    await renderWithProvider(<LocationPicker initialLocation={{ latitude: 0, longitude: 0 }} onLocationSelected={onLocationSelected} />, { services: { getCurrentPosition } });
    await waitFor(() => expect(screen.getByTestId('mlrn-marker-picked-location').props.lngLat).toEqual([-75, 40]));
    await fireEvent.press(screen.getByTestId('location-picker-confirm'));
    expect(onLocationSelected).toHaveBeenCalledWith({ latitude: 40, longitude: -75, address: undefined });
  });
});

describe('StaticMap', () => {
  it('uses the server static map template when present', async () => {
    await renderWithProvider(<StaticMap latitude={50.9} longitude={3.7} height={150} zoom={14} />, {
      config: { ...config, StaticMapUrlTemplate: 'https://api.example.org/static?lat={lat}&lon={lon}&z={zoom}&w={width}&h={height}' },
    });
    await fireEvent(screen.getByTestId('static-map'), 'layout', { nativeEvent: { layout: { width: 300, height: 150, x: 0, y: 0 } } });
    expect(screen.getByTestId('static-map-image').props.source).toEqual({ uri: 'https://api.example.org/static?lat=50.900000&lon=3.700000&z=14&w=300&h=150' });
    expect(screen.queryByTestId('static-map-map')).toBeNull();
  });

  it('falls back to a non-interactive map without a template, and a placeholder without a location', async () => {
    const { rerender } = await renderWithProvider(<StaticMap latitude={50.9} longitude={3.7} />);
    const map = screen.getByTestId('static-map-map');
    expect(map.props.dragPan).toBe(false);
    expect(map.props.attribution).toBe(true);
    await rerender(
      <MapProvider config={config} colorScheme="light">
        <StaticMap latitude={0} longitude={0} />
      </MapProvider>
    );
    expect(screen.getByTestId('static-map-empty')).toBeTruthy();
  });
});

describe('sheets', () => {
  it('shows pin actions only for the callbacks given', async () => {
    const onViewCall = jest.fn();
    const onClose = jest.fn();
    await renderWithProvider(<PinDetailSheet pin={pin({ Address: '1 Main St' })} isOpen={true} onClose={onClose} onViewCall={onViewCall} />);
    expect(screen.getByTestId('pin-detail-address')).toBeTruthy();
    expect(screen.queryByTestId('pin-detail-route')).toBeNull();
    await fireEvent.press(screen.getByTestId('pin-detail-view-call'));
    expect(onViewCall).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('uses the overlay slot the app passes in', async () => {
    const Sheet = ({ isOpen, children }: { isOpen: boolean; children: React.ReactNode }) => (isOpen ? <>{children}</> : null);
    const onToggle = jest.fn();
    await renderWithProvider(<MapLayersSheet isOpen={true} onClose={jest.fn()} layers={[{ Id: 'l1', Name: 'Hydrants', Color: '#f00' }]} toggles={{ l1: false }} onToggle={onToggle} />, { overlays: { Sheet } });
    await fireEvent(screen.getByTestId('layer-toggle-l1'), 'valueChange', true);
    expect(onToggle).toHaveBeenCalledWith('l1');
    expect(screen.queryByTestId('map-layers-sheet')).toBeNull();
  });

  it('shows an event layer’s phase badge and dates, and a details button only for layers that have details', async () => {
    const Sheet = ({ isOpen, children }: { isOpen: boolean; children: React.ReactNode }) => (isOpen ? <>{children}</> : null);
    const onShowDetails = jest.fn();
    await renderWithProvider(
      <MapLayersSheet
        isOpen={true}
        onClose={jest.fn()}
        layers={[
          { Id: 'event', Name: 'Marathon', Color: '#f00', Detail: 'Nov 15, 2026, 9:00 AM – 5:00 PM', Badge: { label: 'Happening now', tone: 'primary' }, HasDetails: true },
          { Id: 'plain', Name: 'Districts' },
        ]}
        toggles={{ event: true, plain: false }}
        onToggle={jest.fn()}
        onShowDetails={onShowDetails}
      />,
      { overlays: { Sheet } }
    );
    expect(screen.getByTestId('layer-badge-event')).toHaveTextContent('Happening now');
    expect(screen.getByTestId('layer-detail-event')).toHaveTextContent('Nov 15, 2026, 9:00 AM – 5:00 PM');
    expect(screen.queryByTestId('layer-badge-plain')).toBeNull();
    expect(screen.queryByTestId('layer-detail-plain')).toBeNull();
    expect(screen.queryByTestId('layer-details-plain')).toBeNull();
    await fireEvent.press(screen.getByTestId('layer-details-event'));
    expect(onShowDetails).toHaveBeenCalledWith('event');
  });

  it('loads the legend when opened and hides personnel without PII rights', async () => {
    const loadLegend = jest.fn(async () => ({
      StatusStyles: [{ Key: 'available', Color: '#00ff00', UnitStatuses: ['Available'], PersonnelStatuses: ['Standing by'] }],
      Personnel: [{ Id: null, Name: '', States: [] }],
      Units: [{ Id: 4, Name: 'Engine', States: [{ Id: 1, Name: 'Available' }] }],
    }));

    await renderWithProvider(<MapLegendSheet isOpen={true} onClose={jest.fn()} canViewPersonnel={false} loadLegend={loadLegend} />);
    await waitFor(() => expect(screen.getByTestId('map-legend-content')).toBeTruthy());
    expect(screen.getByTestId('map-legend-status-available')).toBeTruthy();
    expect(screen.getByTestId('map-legend-units-4')).toBeTruthy();
    expect(screen.queryByTestId('map-legend-heading-personnel')).toBeNull();
  });

  it('shows the department station icon under the app label, then each station with its own icon', async () => {
    const loadLegend = jest.fn(async () => ({
      Stations: [
        { Id: null, Name: 'Station', IconUrl: 'https://api.example.org/api/v4/TypeIcons/all', ImagePath: 'Station', States: [] },
        { Id: 41, Name: ' Ambulance post ', IconUrl: 'https://api.example.org/api/v4/TypeIcons/own', ImagePath: 'Station', States: [] },
      ],
    }));

    await renderWithProvider(<MapLegendSheet isOpen={true} onClose={jest.fn()} canViewPersonnel={true} loadLegend={loadLegend} />);
    await waitFor(() => expect(screen.getByTestId('map-legend-content')).toBeTruthy());

    expect(screen.getByTestId('map-legend-station-icon-upload').props.source).toEqual({ uri: 'https://api.example.org/api/v4/TypeIcons/all' });
    expect(screen.getByTestId('map-legend-station')).toHaveTextContent('maps.legend.station');
    expect(screen.getByTestId('map-legend-station-41')).toHaveTextContent('Ambulance post');
    expect(screen.getByTestId('map-legend-station-41-icon-upload').props.source).toEqual({ uri: 'https://api.example.org/api/v4/TypeIcons/own' });
  });

  it('falls back to the bundled station pin when an upload fails or the server sends no station icons', async () => {
    const loadLegend = jest.fn(async () => ({ Stations: [{ Id: null, Name: 'Station', IconUrl: 'https://api.example.org/api/v4/TypeIcons/gone', ImagePath: 'Station', States: [] }] }));
    const { unmount } = await renderWithProvider(<MapLegendSheet isOpen={true} onClose={jest.fn()} canViewPersonnel={true} loadLegend={loadLegend} />);
    await waitFor(() => expect(screen.getByTestId('map-legend-station-icon-upload')).toBeTruthy());
    await fireEvent(screen.getByTestId('map-legend-station-icon-upload'), 'error');
    expect(screen.getByTestId('map-legend-station-icon-bundled').props.source).toBe(2);
    await unmount();

    // An older server: no Stations at all.
    await renderWithProvider(<MapLegendSheet isOpen={true} onClose={jest.fn()} canViewPersonnel={true} loadLegend={jest.fn(async () => ({ PoiTypes: [] }))} />);
    await waitFor(() => expect(screen.getByTestId('map-legend-content')).toBeTruthy());
    expect(screen.getByTestId('map-legend-station-icon-bundled').props.source).toBe(2);
    expect(screen.queryByTestId('map-legend-station-icon-upload')).toBeNull();
  });
});
