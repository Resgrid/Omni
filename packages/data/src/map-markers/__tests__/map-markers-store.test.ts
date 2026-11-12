import { getMapDataAndMarkers } from '@resgrid/api';
import { defaultResetRegistry } from '@resgrid/offline';

import { createDataTestRuntime, type DataTestRuntime, networkError, ok, persisted } from '../../__tests__/helpers';
import { setDataStorage } from '../../core/persist';
import { migrateMapMarkersStorage, usableMarkers, useMapMarkersStore } from '../map-markers-store';

jest.mock('@resgrid/api', () => ({ ...jest.requireActual('@resgrid/api'), getMapDataAndMarkers: jest.fn() }));

let runtime: DataTestRuntime;

beforeEach(async () => {
  runtime = await createDataTestRuntime({ variant: 'dispatch' });
  await defaultResetRegistry.getStoreResets().get('data.map-markers')?.('logout');
});

describe('map markers store', () => {
  it('reads string coordinates, drops unplaceable pins and persists them', async () => {
    jest.mocked(getMapDataAndMarkers).mockResolvedValueOnce(
      ok({
        CenterLat: '39.7',
        CenterLon: '-104.9',
        ZoomLevel: '11',
        MapMakerInfos: [
          { Id: 'c1', Latitude: 39.7, Longitude: -104.9, Title: 'Call' },
          { Id: 'x', Latitude: 0, Longitude: 0, Title: 'Nowhere' },
        ],
      }) as never
    );
    await useMapMarkersStore.getState().fetchMarkers();
    const state = useMapMarkersStore.getState();
    expect(state.centerLatitude).toBe(39.7);
    expect(state.centerLongitude).toBe(-104.9);
    expect(state.zoomLevel).toBe(11);
    expect(state.markers.map((marker) => marker.Id)).toEqual(['c1']);
    expect(persisted(runtime.kv, 'omni-map-markers-storage')?.state.markers).toHaveLength(1);
  });

  it('keeps the last pins when a refresh fails and the last centre when none is sent', async () => {
    jest.mocked(getMapDataAndMarkers).mockResolvedValueOnce(ok({ CenterLat: 40, CenterLon: -105, ZoomLevel: 9, MapMakerInfos: [{ Id: 'u1', Latitude: 40, Longitude: -105 }] }) as never);
    await useMapMarkersStore.getState().fetchMarkers();
    jest.mocked(getMapDataAndMarkers).mockRejectedValueOnce(networkError());
    await useMapMarkersStore.getState().fetchMarkers({ bypassCache: true });
    expect(useMapMarkersStore.getState().markers).toHaveLength(1);

    jest.mocked(getMapDataAndMarkers).mockResolvedValueOnce(ok({ CenterLat: 0, CenterLon: 0, ZoomLevel: '', MapMakerInfos: [] }) as never);
    await useMapMarkersStore.getState().fetchMarkers({ bypassCache: true });
    expect(useMapMarkersStore.getState().centerLatitude).toBe(40);
    expect(useMapMarkersStore.getState().zoomLevel).toBe(9);
    expect(useMapMarkersStore.getState().markers).toEqual([]);
  });

  it('persists version 1', async () => {
    // SAFETY: a test envelope with only the fields applyMapData reads, standing in for the full GetMapDataAndMarkersResult.
    jest.mocked(getMapDataAndMarkers).mockResolvedValueOnce(ok({ MapMakerInfos: [{ Id: 'u1', Latitude: 40, Longitude: -105, IconUrl: 'https://api.resgrid.com/api/v4/TypeIcons/Icon/1' }] }) as never);
    await useMapMarkersStore.getState().fetchMarkers();
    expect(persisted(runtime.kv, 'omni-map-markers-storage')?.version).toBe(1);
  });

  it('drops the 32 px uploads a pre-fullSizeIcons build persisted (v0) on rehydrate, keeping the pins, centre and status pins', async () => {
    const v0Marker = { Id: 'u1', Latitude: 40, Longitude: -105, Type: 1, IconUrl: 'https://api.resgrid.com/api/v4/TypeIcons/Icon/1?px=32', PinIconUrl: 'https://api.resgrid.com/api/v4/TypeIcons/Pins/engine?c=ff0000' };
    runtime.kv.set('omni-map-markers-storage', JSON.stringify({ state: { markers: [v0Marker], centerLatitude: 40, centerLongitude: -105, zoomLevel: 9, fetchedAt: { markers: 1234 } }, version: 0 }));
    await setDataStorage(runtime.kv);
    const state = useMapMarkersStore.getState();
    expect(getMapDataAndMarkers).not.toHaveBeenCalled();
    expect(state.markers).toEqual([{ ...v0Marker, IconUrl: null }]);
    expect(state.centerLatitude).toBe(40);
    expect(state.zoomLevel).toBe(9);
    expect(state.fetchedAt.markers).toBe(1234);
  });

  it('keeps the uploads a v1 build persisted on rehydrate', async () => {
    const marker = { Id: 'u1', Latitude: 40, Longitude: -105, Type: 1, IconUrl: 'https://api.resgrid.com/api/v4/TypeIcons/Icon/1' };
    runtime.kv.set('omni-map-markers-storage', JSON.stringify({ state: { markers: [marker], centerLatitude: 40, centerLongitude: -105, zoomLevel: 9, fetchedAt: { markers: 1234 } }, version: 1 }));
    await setDataStorage(runtime.kv);
    expect(useMapMarkersStore.getState().markers[0].IconUrl).toBe(marker.IconUrl);
  });

  it('migrates an empty or partial v0 copy to an empty store', () => {
    expect(migrateMapMarkersStorage(null, 0)).toEqual({ markers: [], centerLatitude: null, centerLongitude: null, zoomLevel: null, fetchedAt: {} });
    expect(migrateMapMarkersStorage({ zoomLevel: 7 }, 0)).toEqual({ markers: [], centerLatitude: null, centerLongitude: null, zoomLevel: 7, fetchedAt: {} });
  });

  it('filters non-finite positions', () => {
    expect(
      usableMarkers([
        { Latitude: Number.NaN, Longitude: 1 },
        { Latitude: 1, Longitude: 2 },
      ] as never)
    ).toHaveLength(1);
  });
});
