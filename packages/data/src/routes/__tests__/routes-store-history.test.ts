import { getRouteProgress, getStopContact, getStopsForInstance } from '@resgrid/api';
import type { RouteInstanceResultData, RouteProgressResultData, RouteStopContactResultData } from '@resgrid/models';
import { defaultResetRegistry } from '@resgrid/offline';

import { createDataTestRuntime, type DataTestRuntime, httpError, notFound, ok, persisted } from '../../__tests__/helpers';
import { RouteInstanceStatus, STOP_CONTACTS_MAX, useRoutesStore } from '../routes-store';

jest.mock('@resgrid/api', () => ({
  ...jest.requireActual('@resgrid/api'),
  getRouteProgress: jest.fn(),
  getStopsForInstance: jest.fn(),
  getStopContact: jest.fn(),
}));

const instance = (RouteInstanceId: string): RouteInstanceResultData => ({
  RouteInstanceId,
  RoutePlanId: 'rp-1',
  RoutePlanName: 'Hydrant run',
  UnitId: 10,
  Status: RouteInstanceStatus.Completed,
  ActualStartOn: '2026-10-30T08:00:00Z',
  ActualEndOn: '2026-10-30T10:00:00Z',
  StopsCompleted: 2,
  StopsTotal: 2,
  TotalDistanceMeters: 12000,
  TotalDurationSeconds: 7200,
  Notes: null,
  AddedOn: '2026-10-30T08:00:00Z',
});

const progress = (id: string): RouteProgressResultData => ({ Instance: instance(id), TotalStops: 2, CompletedStops: 2, SkippedStops: 0, PendingStops: 0, Stops: [] });

const contact = (ContactId: string, RouteStopId: string): RouteStopContactResultData => ({
  ContactId,
  RouteStopId,
  StopName: 'Stop',
  ContactType: 0,
  FirstName: 'Pat',
  LastName: 'Lee',
  CompanyName: null,
  Email: null,
  HomePhoneNumber: null,
  CellPhoneNumber: '555-0100',
  OfficePhoneNumber: null,
  Website: null,
  LocationGpsCoordinates: '39.5,-119.8',
  EntranceGpsCoordinates: null,
  ExitGpsCoordinates: null,
  LocationGeofence: null,
  Description: null,
});

let runtime: DataTestRuntime;

beforeEach(async () => {
  runtime = await createDataTestRuntime({ variant: 'unit' });
  await defaultResetRegistry.getStoreResets().get('data.routes')?.('logout');
});

describe('routes store: history instance detail', () => {
  it('reads a past instance without replacing the live route', async () => {
    useRoutesStore.setState({ activeInstance: { ...instance('live'), Status: RouteInstanceStatus.InProgress } });
    jest.mocked(getRouteProgress).mockResolvedValue(ok(progress('old')) as never);
    jest.mocked(getStopsForInstance).mockResolvedValue(ok([{ RouteStopId: 's1', Name: 'Hydrant 4' }]) as never);
    const detail = await useRoutesStore.getState().fetchInstanceDetail('old');
    expect(detail?.progress?.Instance.RouteInstanceId).toBe('old');
    expect(detail?.stops).toHaveLength(1);
    expect(useRoutesStore.getState().activeInstance?.RouteInstanceId).toBe('live');
    expect(useRoutesStore.getState().instanceDetailsById.old).toBeDefined();
  });

  it('answers the last copy when the read fails', async () => {
    useRoutesStore.setState({ instanceDetailsById: { old: { progress: progress('old'), stops: [] } } });
    jest.mocked(getRouteProgress).mockRejectedValue(httpError(500));
    jest.mocked(getStopsForInstance).mockResolvedValue(ok([]) as never);
    expect((await useRoutesStore.getState().fetchInstanceDetail('old'))?.progress?.Instance.RouteInstanceId).toBe('old');
  });
});

describe('routes store: stop contacts', () => {
  it('reads a stop contact by the plan stop id, caches it and persists it for offline use', async () => {
    jest.mocked(getStopContact).mockResolvedValue(ok(contact('c1', 's1')) as never);
    expect(await useRoutesStore.getState().fetchStopContact('s1')).toMatchObject({ ContactId: 'c1' });
    expect(getStopContact).toHaveBeenCalledWith(expect.anything(), { routeStopId: 's1' });
    expect((persisted(runtime.kv, 'omni-routes-storage')?.state.stopContactsById as Record<string, unknown>).s1).toBeDefined();

    jest.mocked(getStopContact).mockClear();
    expect(await useRoutesStore.getState().fetchStopContact('s1')).toMatchObject({ ContactId: 'c1' });
    expect(getStopContact).not.toHaveBeenCalled();
  });

  it('serves the cached copy offline and null for a stop without a contact', async () => {
    useRoutesStore.setState({ stopContactsById: { s1: contact('c1', 's1') } });
    jest.mocked(getStopContact).mockRejectedValue(httpError(503));
    expect(await useRoutesStore.getState().fetchStopContact('s1', { bypassCache: true })).toMatchObject({ ContactId: 'c1' });
    jest.mocked(getStopContact).mockResolvedValue(notFound(null) as never);
    expect(await useRoutesStore.getState().fetchStopContact('s2')).toBeNull();
  });

  it('keeps only the newest STOP_CONTACTS_MAX contacts', async () => {
    const seeded = Object.fromEntries(Array.from({ length: STOP_CONTACTS_MAX }, (_, index) => [`stop-${index}`, contact(`c${index}`, `stop-${index}`)]));
    useRoutesStore.setState({ stopContactsById: seeded });
    jest.mocked(getStopContact).mockResolvedValue(ok(contact('new', 'stop-new')) as never);
    await useRoutesStore.getState().fetchStopContact('stop-new');
    const keys = Object.keys(useRoutesStore.getState().stopContactsById);
    expect(keys).toHaveLength(STOP_CONTACTS_MAX);
    expect(keys).not.toContain('stop-0');
    expect(keys[keys.length - 1]).toBe('stop-new');
  });
});
