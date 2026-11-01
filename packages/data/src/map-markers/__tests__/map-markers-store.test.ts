import { getMapDataAndMarkers } from '@resgrid/api';
import { defaultResetRegistry } from '@resgrid/offline';

import { createDataTestRuntime, type DataTestRuntime, networkError, ok, persisted } from '../../__tests__/helpers';
import { usableMarkers, useMapMarkersStore } from '../map-markers-store';

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

  it('filters non-finite positions', () => {
    expect(
      usableMarkers([
        { Latitude: Number.NaN, Longitude: 1 },
        { Latitude: 1, Longitude: 2 },
      ] as never)
    ).toHaveLength(1);
  });
});
