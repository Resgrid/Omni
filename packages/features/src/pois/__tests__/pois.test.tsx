import '../../status/__tests__/test-setup';

import { usePoisStore } from '@resgrid/data';
import { NavigationHandoffProvider } from '@resgrid/features/contacts';
import { type PoiResultData, type PoiTypeResultData } from '@resgrid/models';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { Text } from 'react-native';

import { parsePoiId } from '../lib/poi-filters';
import { poisRoutes } from '../routes';
import PoiDetailScreen from '../screens/poi-detail';
import PoisListScreen from '../screens/pois-list';

const poi = (PoiId: number, Name: string, extra: Partial<PoiResultData> = {}): PoiResultData => ({
  PoiId,
  PoiTypeId: 1,
  PoiTypeName: 'Hospital',
  Name,
  Address: '',
  Note: '',
  Latitude: 39.7,
  Longitude: -104.9,
  Color: '',
  ImagePath: '',
  Marker: '',
  IsDestination: false,
  ...extra,
});

beforeEach(() => {
  (router.push as jest.Mock).mockClear();
  usePoisStore.setState({
    pois: [poi(1, 'General Hospital', { IsDestination: true, Capabilities: ['trauma-1'] }), poi(2, 'Hydrant 7', { PoiTypeId: 2, PoiTypeName: 'Hydrant' }), poi(3, 'Clinic', { IsDestination: true })],
    poiTypes: [{ PoiTypeId: 1, Name: 'Hospital' } as PoiTypeResultData, { PoiTypeId: 2, Name: 'Hydrant' } as PoiTypeResultData],
    poiDetailsById: {},
    fetchPois: jest.fn(async () => undefined),
    fetchPoiTypes: jest.fn(async () => undefined),
    fetchPoi: jest.fn(async (id: number) => usePoisStore.getState().pois.find((item) => item.PoiId === id) ?? null),
  });
});

describe('POI routes', () => {
  it('accepts only positive integer ids', () => {
    expect(parsePoiId('12')).toBe(12);
    expect(parsePoiId('../x')).toBeNull();
    expect(parsePoiId('0')).toBeNull();
    expect(poisRoutes.detail(5)).toBe('/poi/5');
    expect(() => poisRoutes.detail(-1)).toThrow();
  });
});

describe('PoisListScreen', () => {
  it('filters by type, destination and capability and opens the canonical detail route', () => {
    const renderMap = jest.fn(() => <Text>map</Text>);
    render(<PoisListScreen renderMap={renderMap} />);

    expect(renderMap).toHaveBeenCalled();
    fireEvent.press(screen.getByTestId('poi-type-2'));
    expect(screen.getByTestId('poi-card-2')).toBeTruthy();
    expect(screen.queryByTestId('poi-card-1')).toBeNull();

    fireEvent.press(screen.getByTestId('poi-type-all'));
    fireEvent.press(screen.getByTestId('poi-destination-only'));
    expect(screen.queryByTestId('poi-card-2')).toBeNull();
    fireEvent.press(screen.getByTestId('poi-capability-trauma-1'));
    expect(screen.queryByTestId('poi-card-3')).toBeNull();

    fireEvent.press(screen.getByTestId('poi-card-1'));
    expect(router.push).toHaveBeenCalledWith('/poi/1');
  });
});

describe('PoiDetailScreen', () => {
  it('renders the map slot and hands directions to the navigation app', async () => {
    const navigateTo = jest.fn(async () => true);
    (useLocalSearchParams as jest.Mock).mockReturnValueOnce({ id: '1' });
    render(
      <NavigationHandoffProvider value={{ navigateTo }}>
        <PoiDetailScreen renderMap={() => <Text testID="poi-map">map</Text>} />
      </NavigationHandoffProvider>
    );

    await waitFor(() => expect(screen.getByTestId('poi-map')).toBeTruthy());
    fireEvent.press(screen.getByTestId('poi-detail-directions'));
    expect(navigateTo).toHaveBeenCalledWith({ latitude: 39.7, longitude: -104.9, label: 'General Hospital' });
  });

  it('shows not found for an invalid id without fetching', () => {
    (useLocalSearchParams as jest.Mock).mockReturnValueOnce({ id: 'abc' });
    render(<PoiDetailScreen />);
    expect(screen.getByTestId('poi-detail-missing')).toBeTruthy();
    expect(usePoisStore.getState().fetchPoi).not.toHaveBeenCalled();
  });
});
