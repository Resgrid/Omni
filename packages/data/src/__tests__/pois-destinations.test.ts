import * as api from '@resgrid/api';
import { defaultResetRegistry } from '@resgrid/offline';

import { usePoisStore } from '../pois/pois-store';
import { createDataTestRuntime, httpError, ok } from './helpers';

jest.mock('@resgrid/api', () => {
  const actual = jest.requireActual('@resgrid/api');

  return { ...actual, getPois: jest.fn(), getPoi: jest.fn(), getPoiCapabilities: jest.fn(), setPoiAvailability: jest.fn(), getNearestDestinations: jest.fn() };
});

/** Destination capabilities and availability (Core M0315) in the POI store. */
beforeEach(async () => {
  await createDataTestRuntime({ variant: 'dispatch' });
  await defaultResetRegistry.getStoreResets().get('data.pois')?.('logout');
  jest.mocked(api.getPoiCapabilities).mockReset();
  jest.mocked(api.setPoiAvailability).mockReset();
  jest.mocked(api.getNearestDestinations).mockReset();
  jest.mocked(api.getPois).mockReset();
  jest.mocked(api.getPoi).mockReset();
});

/** A promise the test settles by hand, to land a response at a chosen moment. */
const deferred = <T>() => {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((settle) => (resolve = settle));

  return { promise, resolve };
};

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

  it('keeps a saved availability over reads that started before the save, and takes reads that started after it', async () => {
    usePoisStore.setState({ pois: [hospital(0)], destinationPois: [hospital(0)], poiDetailsById: {} });
    const list = deferred<unknown>();
    const detail = deferred<unknown>();
    // SAFETY: the mocked endpoints return the v4 envelope the store unwraps; the test builds only the fields it checks.
    jest.mocked(api.getPois).mockReturnValueOnce(list.promise as never);
    // SAFETY: as above.
    jest.mocked(api.getPoi).mockReturnValueOnce(detail.promise as never);
    // SAFETY: as above.
    jest.mocked(api.setPoiAvailability).mockResolvedValue(ok(hospital(3)) as never);

    const listRead = usePoisStore.getState().fetchDestinationPois({ bypassCache: true });
    const detailRead = usePoisStore.getState().fetchPoi(3, { bypassCache: true });

    await usePoisStore.getState().setPoiAvailability({ PoiId: 3, Status: 3, UnavailableCapabilityIds: [], Note: '', ExpiresInMinutes: null });
    // The reads answer after the save with the report from before it.
    list.resolve(ok([hospital(0)]));
    detail.resolve(ok(hospital(0)));
    await listRead;

    expect((await detailRead)?.AvailabilityStatus).toBe(3);
    expect(usePoisStore.getState().destinationPois[0].AvailabilityStatus).toBe(3);
    expect(usePoisStore.getState().poiDetailsById[3].AvailabilityStatus).toBe(3);

    // A read started after the save is the newer answer (someone reopened it).
    // SAFETY: as above.
    jest.mocked(api.getPois).mockResolvedValueOnce(ok([hospital(0)]) as never);
    await usePoisStore.getState().fetchDestinationPois({ bypassCache: true });

    expect(usePoisStore.getState().destinationPois[0].AvailabilityStatus).toBe(0);
  });

  it('drops an availability answer that lands after a sign-out', async () => {
    const answer = deferred<unknown>();
    // SAFETY: the mocked endpoint returns the v4 envelope the store unwraps; the test builds only the fields it checks.
    jest.mocked(api.setPoiAvailability).mockReturnValueOnce(answer.promise as never);

    const saving = usePoisStore.getState().setPoiAvailability({ PoiId: 3, Status: 3, UnavailableCapabilityIds: [], Note: '', ExpiresInMinutes: null });

    await defaultResetRegistry.getStoreResets().get('data.pois')?.('logout');
    answer.resolve(ok(hospital(3)));
    await saving;

    expect(usePoisStore.getState().poiDetailsById).toEqual({});
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
