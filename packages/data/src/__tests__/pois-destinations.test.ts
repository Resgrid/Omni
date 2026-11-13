import * as api from '@resgrid/api';
import { defaultResetRegistry } from '@resgrid/offline';

import { usePoisStore } from '../pois/pois-store';
import { createDataTestRuntime, httpError, ok } from './helpers';

jest.mock('@resgrid/api', () => {
  const actual = jest.requireActual('@resgrid/api');

  return { ...actual, getPoiCapabilities: jest.fn(), setPoiAvailability: jest.fn(), getNearestDestinations: jest.fn() };
});

/** Destination capabilities and availability (Core M0315) in the POI store. */
beforeEach(async () => {
  await createDataTestRuntime({ variant: 'dispatch' });
  await defaultResetRegistry.getStoreResets().get('data.pois')?.('logout');
  jest.mocked(api.getPoiCapabilities).mockReset();
  jest.mocked(api.setPoiAvailability).mockReset();
  jest.mocked(api.getNearestDestinations).mockReset();
});

// SAFETY: fixtures fill only the POI fields the store keys on.
const hospital = (AvailabilityStatus: number) => ({ PoiId: 3, Name: 'UZ Gent', IsDestination: true, AvailabilityStatus }) as never;

describe('pois store destinations', () => {
  it('loads the department capabilities once unless bypassCache', async () => {
    // SAFETY: the mocked endpoint returns the v4 envelope the store unwraps; the test builds only the fields it checks.
    jest.mocked(api.getPoiCapabilities).mockResolvedValue(ok([{ PoiCapabilityId: 'cath', Name: 'Cath Lab', Sort: 1 }]) as never);

    await usePoisStore.getState().fetchPoiCapabilities();
    await usePoisStore.getState().fetchPoiCapabilities();

    expect(usePoisStore.getState().poiCapabilities).toEqual([{ PoiCapabilityId: 'cath', Name: 'Cath Lab', Sort: 1 }]);
    expect(api.getPoiCapabilities).toHaveBeenCalledTimes(1);
  });

  it('replaces every loaded copy of a destination with what the availability change returned', async () => {
    usePoisStore.setState({ pois: [hospital(0)], destinationPois: [hospital(0)], poiDetailsById: {} });
    // SAFETY: the mocked endpoint returns the v4 envelope the store unwraps; the test builds only the fields it checks.
    jest.mocked(api.setPoiAvailability).mockResolvedValue(ok(hospital(2)) as never);

    const outcome = await usePoisStore.getState().setPoiAvailability({ PoiId: 3, Status: 2, UnavailableCapabilityIds: [], Note: 'ED full', ExpiresInMinutes: 120 });

    expect(outcome.ok).toBe(true);
    const state = usePoisStore.getState();
    expect(state.pois[0].AvailabilityStatus).toBe(2);
    expect(state.destinationPois[0].AvailabilityStatus).toBe(2);
    expect(state.poiDetailsById[3].AvailabilityStatus).toBe(2);
  });

  it('reports a refused availability change without touching the loaded copies', async () => {
    usePoisStore.setState({ pois: [hospital(0)], destinationPois: [], poiDetailsById: {} });
    jest.mocked(api.setPoiAvailability).mockRejectedValue(httpError(403));

    const outcome = await usePoisStore.getState().setPoiAvailability({ PoiId: 3, Status: 3, UnavailableCapabilityIds: [], Note: '', ExpiresInMinutes: null });

    expect(outcome.ok).toBe(false);
    expect(usePoisStore.getState().pois[0].AvailabilityStatus).toBe(0);
  });

  it('asks for a nearest ranking with only the given filters, and answers null when the server cannot', async () => {
    // SAFETY: the mocked endpoint returns the v4 envelope the store unwraps; the test builds only the fields it checks.
    jest.mocked(api.getNearestDestinations).mockResolvedValueOnce(ok([{ Poi: hospital(0), DistanceMeters: 100, TravelSeconds: 60, CanProvide: true }]) as never);

    const ranking = await usePoisStore.getState().fetchNearestDestinations({ latitude: 50.8, longitude: 3.8, capabilityId: 'cath', unitId: null, take: 10 });

    expect(ranking).toHaveLength(1);
    expect(api.getNearestDestinations).toHaveBeenCalledWith(expect.anything(), { latitude: 50.8, longitude: 3.8, capabilityId: 'cath', take: 10 }, undefined);

    jest.mocked(api.getNearestDestinations).mockRejectedValueOnce(httpError(500));
    expect(await usePoisStore.getState().fetchNearestDestinations({ latitude: 50.8, longitude: 3.8 })).toBeNull();
  });
});
