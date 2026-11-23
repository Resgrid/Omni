/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock factories run lazily, so they require modules inside. */
import '../../calls/__tests__/test-setup';

import { useCustomMapsStore } from '@resgrid/data';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { FacilityLocationPicker } from '../components/facility-location-picker';
import { CONTROL_ROOM, facilityMapsState, TANK_YARD } from './facility-fixtures';

// A stand-in for the full-screen picker that keeps its contract: the pin, the picker context for the overlay and the
// toolbar (a room's pick moves the pin and owns the tap), the footer label and Confirm.
jest.mock('@resgrid/maps', () => {
  const mockReact = require('react');
  const { Pressable, Text, View } = require('react-native');

  type MockZone = { IndoorMapZoneId: string };

  type MockLocation = { latitude: number; longitude: number };

  const MockContext = mockReact.createContext(null);
  const mockFitBounds = jest.fn();

  const FullScreenLocationPicker = ({
    isOpen,
    initialLocation,
    onLocationSelected,
    onLocationChange,
    overlay,
    toolbar,
    selectionLabel,
  }: {
    isOpen: boolean;
    initialLocation?: MockLocation | null;
    onLocationSelected: (location: MockLocation & { address?: string }) => void;
    onLocationChange?: (location: MockLocation | null) => void;
    overlay?: unknown;
    toolbar?: unknown;
    selectionLabel?: string | null;
  }) => {
    const [location, setLocation] = mockReact.useState(initialLocation ?? null);
    mockReact.useEffect(() => onLocationChange?.(location), [location, onLocationChange]);
    const context = mockReact.useMemo(() => ({ location, selectLocation: setLocation, fitBounds: mockFitBounds }), [location]);

    if (!isOpen) return null;

    return mockReact.createElement(
      MockContext.Provider,
      { value: context },
      mockReact.createElement(
        View,
        { testID: 'mock-picker' },
        mockReact.createElement(Pressable, { testID: 'mock-picker-map', onPress: () => setLocation({ latitude: 35.5, longitude: -106.1 }) }),
        overlay,
        toolbar,
        mockReact.createElement(Text, { testID: 'mock-picker-label' }, selectionLabel ?? 'street address'),
        mockReact.createElement(Pressable, { testID: 'mock-picker-confirm', onPress: () => location && onLocationSelected({ ...location, address: 'street address' }) })
      )
    );
  };

  return {
    ...jest.requireActual('@resgrid/maps/lib/pixel-frame'),
    isSafeMapUrl: jest.requireActual('@resgrid/maps/provider/url-safety').isSafeMapUrl,
    mockFitBounds,
    FullScreenLocationPicker,
    useLocationPickerContext: () => mockReact.useContext(MockContext),
    CustomMapRasterLayer: ({ layer, onRegionPress }: { layer: { IndoorMapFloorId: string; Regions?: MockZone[] }; onRegionPress?: (id: string) => void }) =>
      mockReact.createElement(
        View,
        { testID: `mock-custom-map-${layer.IndoorMapFloorId}` },
        (layer.Regions ?? []).map((region) => mockReact.createElement(Pressable, { key: region.IndoorMapZoneId, testID: `mock-zone-${region.IndoorMapZoneId}`, onPress: () => onRegionPress?.(region.IndoorMapZoneId) }))
      ),
    IndoorMapFloorLayer: ({ floor, onZonePress, selectedZoneId }: { floor: { IndoorMapFloorId: string; Zones?: MockZone[] }; onZonePress?: (id: string) => void; selectedZoneId?: string | null }) =>
      mockReact.createElement(
        View,
        { testID: `mock-indoor-floor-${floor.IndoorMapFloorId}`, accessibilityLabel: `selected:${selectedZoneId ?? ''}` },
        (floor.Zones ?? []).map((zone) => mockReact.createElement(Pressable, { key: zone.IndoorMapZoneId, testID: `mock-zone-${zone.IndoorMapZoneId}`, onPress: () => onZonePress?.(zone.IndoorMapZoneId) }))
      ),
  };
});

// SAFETY: the @resgrid/maps mock above exports `mockFitBounds`.
const { mockFitBounds } = jest.requireMock('@resgrid/maps') as { mockFitBounds: jest.Mock };

const mocks = {
  fetchCustomMaps: jest.fn(async () => undefined),
  fetchIndoorMaps: jest.fn(async () => undefined),
  fetchCustomMap: jest.fn(async () => undefined),
  fetchIndoorMap: jest.fn(async () => undefined),
  fetchIndoorFloor: jest.fn(async () => undefined),
};

beforeEach(() => {
  jest.clearAllMocks();
  useCustomMapsStore.setState({ ...facilityMapsState(), ...mocks });
});

const renderPicker = async (props: Partial<React.ComponentProps<typeof FacilityLocationPicker>> = {}) => {
  const onSelect = jest.fn();
  await render(<FacilityLocationPicker isOpen={true} onClose={jest.fn()} onSelect={onSelect} initial={{ latitude: 35.1, longitude: -106.2 }} facilityMaps={true} {...props} />);

  return onSelect;
};

describe('FacilityLocationPicker', () => {
  it('shows a chosen facility map and sets the point, a name and the indoor location from a tapped room', async () => {
    const onSelect = await renderPicker();
    expect(mocks.fetchCustomMaps).toHaveBeenCalled();
    expect(screen.queryByTestId('mock-indoor-floor-floor-1')).toBeNull();

    await fireEvent.press(screen.getByTestId('facility-picker-map-indoor:bldg-a'));
    expect(screen.getByTestId('mock-indoor-floor-floor-1')).toBeTruthy();
    // Framed on the building once it is read.
    expect(mockFitBounds).toHaveBeenCalledWith({ ne: [-106.49, 35.01], sw: [-106.5, 35.0] });
    expect(screen.getByTestId('facility-picker-levels')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('mock-zone-control'));
    expect(screen.getByTestId('mock-picker-label')).toHaveTextContent('maps.facility.feature_address:Control room,Building A');
    expect(screen.getByTestId('mock-indoor-floor-floor-1').props.accessibilityLabel).toBe('selected:control');

    await fireEvent.press(screen.getByTestId('mock-picker-confirm'));
    expect(onSelect).toHaveBeenCalledWith({
      latitude: CONTROL_ROOM.CenterLatitude,
      longitude: CONTROL_ROOM.CenterLongitude,
      address: 'maps.facility.feature_address:Control room,Building A',
      indoor: { zoneId: 'control', floorId: 'floor-1', name: 'maps.facility.feature_address:Control room,Building A' },
    });
  });

  it('treats a tap away from the room as an ordinary point (the indoor location is left alone)', async () => {
    const onSelect = await renderPicker();
    await fireEvent.press(screen.getByTestId('facility-picker-map-custom:site'));
    expect(screen.getByTestId('mock-custom-map-site-evac')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('mock-zone-yard'));
    await fireEvent.press(screen.getByTestId('mock-picker-map'));
    expect(screen.getByTestId('mock-picker-label')).toHaveTextContent('street address');
    await fireEvent.press(screen.getByTestId('mock-picker-confirm'));
    expect(onSelect).toHaveBeenCalledWith({ latitude: 35.5, longitude: -106.1, address: 'street address' });
  });

  it('picks a custom map region on the chosen layer', async () => {
    const onSelect = await renderPicker();
    await fireEvent.press(screen.getByTestId('facility-picker-map-custom:site'));
    await fireEvent.press(screen.getByTestId('facility-picker-level-site-base'));
    expect(screen.queryByTestId('mock-custom-map-site-evac')).toBeNull();
    await fireEvent.press(screen.getByTestId('mock-zone-yard'));
    await fireEvent.press(screen.getByTestId('mock-picker-confirm'));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ latitude: TANK_YARD.CenterLatitude, longitude: TANK_YARD.CenterLongitude, indoor: expect.objectContaining({ zoneId: 'yard', floorId: 'site-base' }) }));
  });

  it('opens on the call’s indoor location map and floor with its room highlighted', async () => {
    await renderPicker({ initialIndoor: { zoneId: 'control', floorId: 'floor-1' } });
    await act(async () => undefined);
    expect(screen.getByTestId('facility-picker-map-indoor:bldg-a').props.accessibilityState).toEqual({ selected: true });
    expect(screen.getByTestId('mock-indoor-floor-floor-1').props.accessibilityLabel).toBe('selected:control');
  });

  it('keeps a map the member chose while the call’s room was still being read', async () => {
    // The call's floor is not on the device yet: the picker cannot open on its map.
    useCustomMapsStore.setState({ indoorMapById: {}, floorById: {} });
    await renderPicker({ initialIndoor: { zoneId: 'control', floorId: 'floor-1' } });
    await fireEvent.press(screen.getByTestId('facility-picker-map-custom:site'));

    // The read lands: the member's choice stays.
    await act(async () => useCustomMapsStore.setState({ indoorMapById: facilityMapsState().indoorMapById, floorById: facilityMapsState().floorById }));
    expect(screen.getByTestId('facility-picker-map-custom:site').props.accessibilityState).toEqual({ selected: true });
    expect(screen.getByTestId('facility-picker-map-indoor:bldg-a').props.accessibilityState).toEqual({ selected: false });
    expect(screen.getByTestId('mock-custom-map-site-base')).toBeTruthy();
  });

  it('offers no facility maps for the destination, or when the department has none', async () => {
    await renderPicker({ facilityMaps: false });
    expect(screen.queryByTestId('facility-picker-toolbar')).toBeNull();
    expect(mocks.fetchCustomMaps).not.toHaveBeenCalled();
  });
});
