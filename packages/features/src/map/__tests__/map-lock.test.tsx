import './test-setup';

import { setDataStorage, useCustomMapsStore, useMapMarkersStore } from '@resgrid/data';
import { NavigationHandoffProvider } from '@resgrid/features/contacts';
import { StatusProvider } from '@resgrid/features/status';
import { createMemoryKvBackend, defaultResetRegistry, DurableKv } from '@resgrid/offline';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { useLocalSearchParams } from 'expo-router';
import React from 'react';

import { activateVariant, setRights } from '../../calls/__tests__/test-utils';
import { LEGACY_LOCATION_STORE_NAME, MAP_LOCK_STORE_NAME, useMapLockStore } from '../hooks/use-map-lock';
import MapScreen from '../screens/map-screen';
import { pin } from './fixtures';

// SAFETY: ./test-setup replaces @resgrid/maps with stand-ins whose useFollowCamera is a jest.fn().
const { useFollowCamera } = jest.requireMock('@resgrid/maps') as { useFollowCamera: jest.Mock };

// SAFETY: ./test-setup replaces @resgrid/location with a settable `mockCurrentLocation` holder.
const { mockCurrentLocation } = jest.requireMock('@resgrid/location') as { mockCurrentLocation: { value: unknown } };

// SAFETY: a test fixture; only the fields the map's follow camera and own-location marker read are set.
const FIX = { latitude: 38.9, longitude: -119.9, heading: 90, accuracy: 8, speed: 12, altitude: null, timestamp: 1, source: 'watcher' } as never;

/** The MapView stand-in forwards the four gesture flags onto its host view. */
const GESTURES_ON = { scrollEnabled: true, zoomEnabled: true, rotateEnabled: true, pitchEnabled: true };

const GESTURES_OFF = { scrollEnabled: false, zoomEnabled: false, rotateEnabled: false, pitchEnabled: false };

const renderMap = async (variant: 'unit' | 'responder') => {
  activateVariant(variant);

  return render(
    <NavigationHandoffProvider value={{ navigateTo: jest.fn(async () => true) }}>
      <StatusProvider activeCallId={null} activeUnitId="7">
        <MapScreen realtime={false} />
      </StatusProvider>
    </NavigationHandoffProvider>
  );
};

const mapProps = () => screen.getByTestId('map-screen-map').props;

const storageWith = async (seed: Record<string, string> = {}) => {
  const kv = new DurableKv(createMemoryKvBackend(`map-lock-${Math.random()}`));

  Object.entries(seed).forEach(([key, value]) => kv.set(key, value));
  await setDataStorage(kv);

  return kv;
};

beforeEach(() => {
  jest.clearAllMocks();
  setRights({ CanViewPII: true });
  mockCurrentLocation.value = FIX;
  // SAFETY: the shared feature setup mocks expo-router's useLocalSearchParams with a jest.fn().
  (useLocalSearchParams as jest.Mock).mockReturnValue({});
  useMapLockStore.setState({ isMapLocked: false });
  useMapMarkersStore.setState({
    markers: [pin('u7', 1, { Title: 'Engine 7' })],
    centerLatitude: 40,
    centerLongitude: -105,
    zoomLevel: 12,
    loading: {},
    errors: {},
    fetchedAt: { markers: 1 },
    fetchMarkers: jest.fn(async () => undefined),
  });
  useCustomMapsStore.setState({ activeLayers: [], layerGeoJSON: {}, fetchActiveLayers: jest.fn(async () => undefined), fetchLayerGeoJSON: jest.fn(async () => null) });
});

afterEach(async () => {
  await setDataStorage(null);
});

describe('map lock (Unit sidebar "Lock map to unit")', () => {
  it('keeps a unit device following the vehicle with every gesture off, and gives the map back on unlock', async () => {
    await renderMap('unit');
    expect(mapProps()).toMatchObject(GESTURES_ON);

    await fireEvent(screen.getByTestId('map-screen-map'), 'cameraChanged', { isUserInteraction: true });
    expect(useFollowCamera).toHaveBeenLastCalledWith(expect.anything(), expect.anything(), false);
    expect(screen.getByTestId('map-screen-recenter-button')).toBeTruthy();

    await act(() => useMapLockStore.getState().setMapLocked(true));
    expect(mapProps()).toMatchObject(GESTURES_OFF);
    expect(useFollowCamera).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ latitude: 38.9 }), true);
    expect(screen.queryByTestId('map-screen-recenter-button')).toBeNull();

    // Unlocking leaves the map following, and a pan stops it again.
    await act(() => useMapLockStore.getState().setMapLocked(false));
    expect(mapProps()).toMatchObject(GESTURES_ON);
    expect(useFollowCamera).toHaveBeenLastCalledWith(expect.anything(), expect.anything(), true);
    await fireEvent(screen.getByTestId('map-screen-map'), 'cameraChanged', { isUserInteraction: true });
    expect(useFollowCamera).toHaveBeenLastCalledWith(expect.anything(), expect.anything(), false);
  });

  it('is ignored where the map does not follow a unit', async () => {
    useMapLockStore.setState({ isMapLocked: true });
    await renderMap('responder');
    expect(mapProps()).toMatchObject(GESTURES_ON);
    expect(useFollowCamera).toHaveBeenLastCalledWith(expect.anything(), null, false);
  });

  it('is remembered on the device, across logout, and the stored choice wins over the legacy one', async () => {
    const kv = await storageWith();

    useMapLockStore.getState().setMapLocked(true);
    expect(kv.getJSON(MAP_LOCK_STORE_NAME)).toEqual({ state: { isMapLocked: true }, version: 0 });
    expect(defaultResetRegistry.getPreservedKeys('any')).toContain(MAP_LOCK_STORE_NAME);

    // A later launch: the stored choice, not the legacy app's.
    const legacyLocked = JSON.stringify({ state: { isMapLocked: true }, version: 0 });

    await storageWith({ [MAP_LOCK_STORE_NAME]: JSON.stringify({ state: { isMapLocked: false }, version: 0 }), [LEGACY_LOCATION_STORE_NAME]: legacyLocked });
    expect(useMapLockStore.getState().isMapLocked).toBe(false);
    await storageWith({ [MAP_LOCK_STORE_NAME]: JSON.stringify({ state: { isMapLocked: true }, version: 0 }) });
    expect(useMapLockStore.getState().isMapLocked).toBe(true);
  });

  it('carries the legacy Unit app’s choice over on the first launch after the upgrade, and only then', async () => {
    const legacy = JSON.stringify({ state: { isBackgroundEnabled: true, isMapLocked: true }, version: 0 });
    const kv = await storageWith({ [LEGACY_LOCATION_STORE_NAME]: legacy });

    expect(useMapLockStore.getState().isMapLocked).toBe(true);

    useMapLockStore.getState().setMapLocked(false);
    await useMapLockStore.persist.rehydrate();
    expect(useMapLockStore.getState().isMapLocked).toBe(false);
    // The legacy record is read, never rewritten.
    expect(kv.getString(LEGACY_LOCATION_STORE_NAME)).toBe(legacy);
  });

  it('starts unlocked when the legacy record is missing or unreadable', async () => {
    await storageWith({ [LEGACY_LOCATION_STORE_NAME]: '{not json' });
    expect(useMapLockStore.getState().isMapLocked).toBe(false);

    await storageWith({ [LEGACY_LOCATION_STORE_NAME]: JSON.stringify({ state: { isBackgroundEnabled: true } }) });
    expect(useMapLockStore.getState().isMapLocked).toBe(false);
  });
});
