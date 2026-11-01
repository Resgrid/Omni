import './test-setup';

import type { VariantId } from '@resgrid/config';
import { useCustomMapsStore, useMapMarkersStore } from '@resgrid/data';
import { NavigationHandoffProvider } from '@resgrid/features/contacts';
import { StatusProvider } from '@resgrid/features/status';
import { emitRealtimeEvent } from '@resgrid/realtime';
import { useToastStore } from '@resgrid/ui';
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { Dimensions } from 'react-native';

import { activateVariant, hidden, setRights } from '../../calls/__tests__/test-utils';
import { useMapViewStore } from '../hooks/use-map-view-store';
import MapScreen, { type MapScreenLinks } from '../screens/map-screen';
import { pin } from './fixtures';

const { mockCamera, useFollowCamera } = jest.requireMock('@resgrid/maps') as { mockCamera: { setCamera: jest.Mock }; useFollowCamera: jest.Mock };
const { mockCurrentLocation } = jest.requireMock('@resgrid/location') as { mockCurrentLocation: { value: unknown } };

const PINS = [
  pin('c12', 0, { Title: 'Structure fire', Address: '12 Main St' }),
  pin('c13', 0, { Title: 'Medical aid', Latitude: 39.6 }),
  pin('u7', 1, { Title: 'Engine 7' }),
  pin('pAB12', 3, { Title: 'Pat Doe' }),
  pin('poi5', 4, { Title: 'Airport', PoiTypeId: 3, PoiTypeName: 'Airports' }),
];

/** Every link a full variant has (Dispatch); Unit's wrapper returns null for unit/member/POI pages. */
const ALL_LINKS: MapScreenLinks = {
  callDetail: (id) => `/call/${id}`,
  unitDetail: (id) => `/units/${id}`,
  personnelDetail: (id) => `/personnel/${id}`,
  poiDetail: (id) => `/poi/${id}`,
  customMaps: () => null,
  searchMaps: () => null,
};
const UNIT_LINKS: MapScreenLinks = { ...ALL_LINKS, unitDetail: () => null, personnelDetail: () => null, poiDetail: () => null, customMaps: () => '/maps' };

const mocks = {
  fetchMarkers: jest.fn(async () => undefined),
  fetchActiveLayers: jest.fn(async () => undefined),
  fetchLayerGeoJSON: jest.fn(async () => null),
  navigateTo: jest.fn(async () => true),
  onActiveCallChange: jest.fn(),
};

const setWindow = (width: number, height: number) => {
  const metrics = { width, height, scale: 2, fontScale: 1 };
  act(() => Dimensions.set({ window: metrics, screen: metrics }));
};

interface RenderOptions {
  variant?: VariantId;
  links?: MapScreenLinks;
  activeCallId?: string | null;
  activeUnitId?: string | null;
  realtime?: boolean;
}

const renderMap = ({ variant = 'dispatch', links = ALL_LINKS, activeCallId = null, activeUnitId = null, realtime = false }: RenderOptions = {}) => {
  activateVariant(variant);
  return render(
    <NavigationHandoffProvider value={{ navigateTo: mocks.navigateTo }}>
      <StatusProvider activeCallId={activeCallId} activeUnitId={activeUnitId} onActiveCallChange={mocks.onActiveCallChange}>
        <MapScreen links={links} realtime={realtime} />
      </StatusProvider>
    </NavigationHandoffProvider>
  );
};

const markedPin = () => String(screen.getByTestId('mock-map-pins').props.accessibilityLabel);

beforeEach(() => {
  jest.clearAllMocks();
  setWindow(390, 844);
  setRights({ CanViewPII: true });
  mockCurrentLocation.value = null;
  (useLocalSearchParams as jest.Mock).mockReturnValue({});
  useToastStore.setState({ toasts: [] });
  useMapViewStore.getState().reset();
  useMapMarkersStore.setState({ markers: PINS, centerLatitude: 40, centerLongitude: -105, zoomLevel: 12, loading: {}, errors: {}, fetchedAt: { markers: 1 }, fetchMarkers: mocks.fetchMarkers });
  useCustomMapsStore.setState({
    activeLayers: [
      { Id: 'L1', Name: 'Fire districts', LayerSource: 'maplayer', Type: 0, Color: '#ff0000', IsSearchable: false, IsOnByDefault: true },
      { Id: 'L2', Name: 'Flood zones', LayerSource: 'maplayer', Type: 0, Color: '#0000ff', IsSearchable: false, IsOnByDefault: false },
      { Id: 'R1', Name: 'Campus regions', LayerSource: 'custommaplayer', Type: 0, Color: '', IsSearchable: false, IsOnByDefault: true },
    ],
    layerGeoJSON: { L1: { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [1, 2] }, properties: {} }] } },
    fetchActiveLayers: mocks.fetchActiveLayers,
    fetchLayerGeoJSON: mocks.fetchLayerGeoJSON,
  });
});

// Toasts arm timers; clearing them lets the worker exit.
afterEach(() => useToastStore.getState().clearToasts());

describe('MapScreen pins and live refresh', () => {
  it('draws the department pins, loads the map data and layers, and refetches on SignalR pings', () => {
    renderMap({ realtime: true });
    expect(screen.getByTestId('pin-c12')).toBeTruthy();
    expect(screen.getByTestId('pin-pAB12')).toBeTruthy();
    expect(mocks.fetchMarkers).toHaveBeenCalledTimes(1);
    expect(mocks.fetchActiveLayers).toHaveBeenCalled();
    act(() => emitRealtimeEvent('callAdded', '14'));
    expect(mocks.fetchMarkers).toHaveBeenLastCalledWith({ bypassCache: true });
  });

  it('hides member pins without CanViewPII', () => {
    setRights({ CanViewPII: false });
    renderMap();
    expect(screen.queryByTestId('pin-pAB12')).toBeNull();
    expect(markedPin()).toContain('pii:false');
  });

  it('opens on the department centre from the map data on a console', () => {
    renderMap();
    expect(screen.getByTestId('mock-camera')).toHaveTextContent('-105,40@12');
    expect(screen.queryByTestId('map-recenter-button')).toBeNull();
  });

  it('draws department layers that are on and fetches GeoJSON for them, never custom-map region layers', () => {
    renderMap();
    expect(screen.getByTestId('mock-map-layer-L1')).toBeTruthy();
    expect(screen.queryByTestId('mock-map-layer-L2')).toBeNull();
    fireEvent.press(screen.getByTestId('map-screen-layers-button'));
    expect(screen.queryByTestId('layer-toggle-layer:R1')).toBeNull();
    fireEvent.press(screen.getByTestId('layer-toggle-layer:L2'));
    expect(mocks.fetchLayerGeoJSON).toHaveBeenCalledWith('L2');
    fireEvent.press(screen.getByTestId('layer-toggle-layer:L1'));
    expect(screen.queryByTestId('mock-map-layer-L1')).toBeNull();
  });
});

describe('MapScreen layers sheet and legend', () => {
  it('lists pin kinds (department terms), POI types and layers, and hides what is switched off', () => {
    renderMap();
    fireEvent.press(screen.getByTestId('map-screen-layers-button'));
    const sheet = screen.getByTestId('mock-layers-sheet');
    expect(within(sheet).getByText('maps.legend.calls:on')).toBeTruthy();
    expect(within(sheet).getByText('maps.legend.personnel:on')).toBeTruthy();
    expect(within(sheet).getByText('Airports:on')).toBeTruthy();
    expect(within(sheet).getByText('Fire districts:on')).toBeTruthy();
    expect(within(sheet).getByText('Flood zones:off')).toBeTruthy();
    fireEvent.press(screen.getByTestId('layer-toggle-kind:unit'));
    expect(screen.queryByTestId('pin-u7')).toBeNull();
    fireEvent.press(screen.getByTestId('layer-toggle-poi:3'));
    expect(screen.queryByTestId('pin-poi5')).toBeNull();
    expect(within(screen.getByTestId('mock-layers-sheet')).getByText('maps.legend.units:off')).toBeTruthy();
  });

  it('offers the custom maps browser where the variant has custom/indoor maps and the route', () => {
    renderMap({ variant: 'unit', links: UNIT_LINKS });
    fireEvent.press(screen.getByTestId('map-screen-layers-button'));
    fireEvent.press(screen.getByTestId('layers-browse-maps'));
    expect(router.push).toHaveBeenCalledWith('/maps');
  });

  it('opens the legend with the personal-data right and department terms', () => {
    renderMap();
    expect(screen.queryByTestId('mock-legend-sheet')).toBeNull();
    fireEvent.press(screen.getByTestId('map-screen-legend-button'));
    expect(screen.getByTestId('mock-legend-sheet')).toHaveTextContent('pii:true|maps.legend.calls');
  });
});

describe('MapScreen pin details', () => {
  it('shows a call in a sheet on phones with set-as-current, view and directions on a field device', async () => {
    renderMap({ variant: 'responder' });
    fireEvent.press(screen.getByTestId('pin-c12'));
    expect(screen.getByTestId('map-pin-sheet', hidden)).toBeTruthy();
    expect(screen.getByTestId('map-pin-title', hidden)).toHaveTextContent('Structure fire');
    expect(screen.getByTestId('map-pin-kind', hidden)).toHaveTextContent('map.kind_call');
    expect(screen.getByTestId('map-pin-address', hidden)).toHaveTextContent('map.pin_address12 Main St');
    expect(markedPin()).toContain('selected:c12');

    fireEvent.press(screen.getByTestId('map-pin-action-set-current-call', hidden));
    expect(mocks.onActiveCallChange).toHaveBeenCalledWith('12');
    expect(useToastStore.getState().toasts[0]).toMatchObject({ type: 'success', message: 'map.call_set_as_current' });

    fireEvent.press(screen.getByTestId('pin-c12'));
    fireEvent.press(screen.getByTestId('map-pin-action-view-call', hidden));
    expect(router.push).toHaveBeenCalledWith('/call/12');

    fireEvent.press(screen.getByTestId('pin-c12'));
    await act(async () => fireEvent.press(screen.getByTestId('map-pin-action-directions', hidden)));
    expect(mocks.navigateTo).toHaveBeenCalledWith({ latitude: 39.5, longitude: -119.8, label: 'Structure fire' });
  });

  it('tells the member when no navigation app opened', async () => {
    mocks.navigateTo.mockResolvedValueOnce(false);
    renderMap();
    fireEvent.press(screen.getByTestId('pin-u7'));
    await act(async () => fireEvent.press(screen.getByTestId('map-pin-action-directions', hidden)));
    expect(useToastStore.getState().toasts[0]).toMatchObject({ type: 'error', message: 'map.failed_to_open_maps' });
  });

  it('docks the details beside the map on a landscape tablet and opens units, members and POIs (console: no current call)', () => {
    setWindow(1366, 1024);
    renderMap();
    fireEvent.press(screen.getByTestId('pin-c12'));
    expect(screen.getByTestId('map-pin-docked')).toBeTruthy();
    expect(screen.queryByTestId('map-pin-sheet', hidden)).toBeNull();
    expect(screen.queryByTestId('map-pin-action-set-current-call')).toBeNull();
    // The controls move left while the card covers the right edge.
    expect(screen.getByTestId('map-screen-legend-button').props.accessibilityHint).toBe('left:140');

    fireEvent.press(screen.getByTestId('pin-u7'));
    fireEvent.press(screen.getByTestId('map-pin-action-view-unit'));
    expect(router.push).toHaveBeenLastCalledWith('/units/7');
    fireEvent.press(screen.getByTestId('pin-pAB12'));
    fireEvent.press(screen.getByTestId('map-pin-action-view-personnel'));
    expect(router.push).toHaveBeenLastCalledWith('/personnel/AB12');
    fireEvent.press(screen.getByTestId('pin-poi5'));
    fireEvent.press(screen.getByTestId('map-pin-action-view-poi'));
    expect(router.push).toHaveBeenLastCalledWith('/poi/5');
    expect(screen.queryByTestId('map-pin-docked')).toBeNull();
  });

  it('hides actions for screens the variant does not have', () => {
    renderMap({ variant: 'unit', links: UNIT_LINKS });
    fireEvent.press(screen.getByTestId('pin-u7'));
    expect(screen.queryByTestId('map-pin-action-view-unit', hidden)).toBeNull();
    expect(screen.getByTestId('map-pin-action-directions', hidden)).toBeTruthy();
    fireEvent.press(screen.getByTestId('map-pin-close', hidden));
    expect(screen.queryByTestId('map-pin-sheet', hidden)).toBeNull();
  });
});

describe('MapScreen by capability', () => {
  const fix = { latitude: 38.9, longitude: -119.9, heading: 90, accuracy: 8, speed: 12, altitude: null, timestamp: 1, source: 'watcher' } as never;

  it('Unit haloes its unit and the crew’s call, badges them and follows the vehicle until the crew pans', () => {
    mockCurrentLocation.value = fix;
    renderMap({ variant: 'unit', links: UNIT_LINKS, activeCallId: '12', activeUnitId: '7' });
    expect(screen.getByTestId('mock-source-map-screen-highlights-source').props.accessibilityLabel).toBe('2');
    expect(screen.getByTestId('mock-own-location')).toHaveTextContent('38.9,-119.9');
    expect(markedPin()).toContain('selected:c12');
    expect(screen.getByTestId('mock-focus-title')).toHaveTextContent('Structure fire');
    expect(screen.getByTestId('mock-focus-detail')).toHaveTextContent('map.current_call');
    expect(useFollowCamera).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ latitude: 38.9, speed: 12 }), true);

    fireEvent.press(screen.getByTestId('pin-u7'));
    expect(screen.getByTestId('map-pin-badge', hidden)).toHaveTextContent('map.your_unit');
    fireEvent.press(screen.getByTestId('map-pin-close', hidden));

    fireEvent(screen.getByTestId('map-screen-map'), 'cameraChanged', { isUserInteraction: true });
    expect(useFollowCamera).toHaveBeenLastCalledWith(expect.anything(), expect.anything(), false);
    fireEvent.press(screen.getByTestId('map-screen-recenter-button'));
    expect(useFollowCamera).toHaveBeenLastCalledWith(expect.anything(), expect.anything(), true);
    expect(screen.queryByTestId('map-screen-recenter-button')).toBeNull();
  });

  it('Responder centres on its own position and only haloes the active call', () => {
    mockCurrentLocation.value = fix;
    renderMap({ variant: 'responder', activeCallId: '12', activeUnitId: '7' });
    expect(screen.getByTestId('mock-source-map-screen-highlights-source').props.accessibilityLabel).toBe('1');
    expect(useFollowCamera).toHaveBeenLastCalledWith(expect.anything(), null, false);
    expect(mockCamera.setCamera).toHaveBeenCalledWith({ centerCoordinate: [-119.9, 38.9], zoomLevel: 14, animationDuration: 800 });
    fireEvent.press(screen.getByTestId('pin-c12'));
    expect(screen.getByTestId('map-pin-badge', hidden)).toHaveTextContent('map.current_call');
    expect(screen.queryByTestId('map-pin-action-set-current-call', hidden)).toBeNull();
  });

  it('a console does not follow the device and shows no current-call banner', () => {
    mockCurrentLocation.value = fix;
    renderMap({ variant: 'dispatch', activeCallId: '12' });
    expect(screen.queryByTestId('mock-focus-banner')).toBeNull();
    expect(screen.getByTestId('mock-camera')).toHaveTextContent('-105,40@12');
    fireEvent(screen.getByTestId('map-screen-map'), 'cameraChanged', { isUserInteraction: false });
    expect(screen.queryByTestId('map-screen-recenter-button')).toBeNull();
    fireEvent(screen.getByTestId('map-screen-map'), 'cameraChanged', { isUserInteraction: true });
    fireEvent.press(screen.getByTestId('map-screen-recenter-button'));
    expect(mockCamera.setCamera).toHaveBeenLastCalledWith({ centerCoordinate: [-105, 40], zoomLevel: 12, animationDuration: 800 });
  });
});

describe('MapScreen focus links', () => {
  it('frames the pin a /map?callId= link asks for and names it in the banner', () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ callId: '13' });
    renderMap({ variant: 'responder' });
    expect(screen.getByTestId('mock-camera')).toHaveTextContent('-119.8,39.6@15');
    expect(mockCamera.setCamera).toHaveBeenCalledWith({ centerCoordinate: [-119.8, 39.6], zoomLevel: 15, animationDuration: 600 });
    expect(markedPin()).toContain('selected:c13');
    expect(screen.getByTestId('mock-focus-title')).toHaveTextContent('Medical aid');
    expect(screen.getByTestId('mock-focus-detail')).toHaveTextContent('map.kind_call');
    fireEvent(screen.getByTestId('map-screen-map'), 'cameraChanged', { isUserInteraction: true });
    fireEvent.press(screen.getByTestId('mock-focus-recenter'));
    expect(mockCamera.setCamera).toHaveBeenLastCalledWith({ centerCoordinate: [-119.8, 39.6], zoomLevel: 15, animationDuration: 800 });
  });

  it('says so when the focused entity is not on the map', () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ unitId: '99' });
    renderMap();
    expect(screen.getByTestId('mock-focus-title')).toHaveTextContent('map.focus_not_found');
    expect(screen.queryByTestId('mock-focus-recenter')).toBeNull();
  });

  it('never names a member from a link without CanViewPII', () => {
    setRights({ CanViewPII: false });
    (useLocalSearchParams as jest.Mock).mockReturnValue({ userId: 'ab12' });
    renderMap();
    expect(screen.getByTestId('mock-focus-title')).toHaveTextContent('map.focus_not_found');
    expect(screen.queryByText('Pat Doe')).toBeNull();
  });
});
