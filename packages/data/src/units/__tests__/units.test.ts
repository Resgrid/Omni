import { getAllUnits, getAllUnitStatuses, getRoleAssignmentsForUnit, getSetUnitStatusData, getUnitStatus, getUnitTypeStatuses, saveUnitStatus, setRoleAssignmentsForUnit } from '@resgrid/api';
import { defaultResetRegistry } from '@resgrid/offline';

import { createDataTestRuntime, type DataTestRuntime, flush, httpError, networkError, notFound, ok, persisted } from '../../__tests__/helpers';
import { setDataLocationProvider } from '../../core/runtime';
import { useUnitRolesStore } from '../unit-roles-store';
import { selectPendingUnitStatus, UNIT_DESTINATIONS_TTL_MS, UNIT_STATUS_SET_EVENT, unitStatusOrderKey, useUnitStatusStore } from '../unit-status-store';
import { useUnitsStore } from '../units-store';

jest.mock('@resgrid/api', () => ({
  ...jest.requireActual('@resgrid/api'),
  getAllUnits: jest.fn(),
  getUnitTypeStatuses: jest.fn(),
  getAllUnitStatuses: jest.fn(),
  getSetUnitStatusData: jest.fn(),
  getUnitStatus: jest.fn(),
  saveUnitStatus: jest.fn(),
  getRoleAssignmentsForUnit: jest.fn(),
  setRoleAssignmentsForUnit: jest.fn(),
}));

let runtime: DataTestRuntime;

beforeEach(async () => {
  runtime = await createDataTestRuntime({ variant: 'unit' });
  jest.mocked(getAllUnitStatuses).mockResolvedValue(ok([{ UnitId: '10', State: 'Available' }]) as never);
  jest.mocked(getUnitStatus).mockResolvedValue(ok({ UnitId: '10', State: 'Responding' }) as never);
  for (const name of ['data.units', 'data.unit-status', 'data.unit-roles']) await defaultResetRegistry.getStoreResets().get(name)?.('logout');
});

describe('units store (IC shape)', () => {
  it('keeps the roster when a status endpoint fails (settled, per-slice errors)', async () => {
    jest.mocked(getAllUnits).mockResolvedValue(ok([{ UnitId: '10', Name: 'E1' }]) as never);
    jest.mocked(getUnitTypeStatuses).mockRejectedValue(networkError());
    await useUnitsStore.getState().fetchUnits();
    const state = useUnitsStore.getState();
    expect(state.units).toHaveLength(1);
    expect(state.unitCurrentStatuses).toHaveLength(1);
    expect(state.errors.unitTypeStatuses?.code).toBe('network');
    expect(state.errors.units).toBeNull();
  });

  it('handles not_found as an empty roster and persists only data', async () => {
    jest.mocked(getAllUnits).mockResolvedValue(notFound([]) as never);
    jest.mocked(getUnitTypeStatuses).mockResolvedValue(ok([]) as never);
    await useUnitsStore.getState().fetchUnits({ bypassCache: true });
    expect(getAllUnits).toHaveBeenCalledWith(expect.anything(), { forceRefresh: true });
    expect(useUnitsStore.getState().units).toEqual([]);
    expect(persisted(runtime.kv, 'omni-units-storage')?.state).not.toHaveProperty('loading');
  });

  it('assignRoles rethrows so the crew is told the save failed (Unit), leaving the loaded seats', async () => {
    jest.mocked(getRoleAssignmentsForUnit).mockResolvedValue(ok([{ UnitRoleId: 'r1', UserId: 'u1' }]) as never);
    await useUnitRolesStore.getState().fetchAssignmentsForUnit('10');
    jest.mocked(setRoleAssignmentsForUnit).mockRejectedValue(httpError(400));
    await expect(useUnitRolesStore.getState().assignRoles({ UnitId: '10', Roles: [] })).rejects.toBeDefined();
    expect(useUnitRolesStore.getState().assignmentsByUnit['10']).toHaveLength(1);
  });
});

describe('unit status (Unit status sheet logic)', () => {
  it('filters the server sentinels out of destinations and honours the 5 minute TTL', async () => {
    jest.mocked(getSetUnitStatusData).mockResolvedValue(
      ok({
        Calls: [
          { CallId: '0', Name: 'No Call' },
          { CallId: '5', Name: 'Fire' },
        ],
        Stations: [
          { GroupId: '', Name: 'No Station' },
          { GroupId: '2', Name: 'Station 2' },
        ],
        DestinationPois: [],
        PoiTypes: [],
        Statuses: [],
      }) as never
    );
    await useUnitStatusStore.getState().fetchDestinationData('10');
    await useUnitStatusStore.getState().fetchDestinationData('10');
    expect(getSetUnitStatusData).toHaveBeenCalledTimes(1);
    const destinations = useUnitStatusStore.getState().destinationsByUnit['10'];
    expect(destinations.calls.map((c) => c.CallId)).toEqual(['5']);
    expect(destinations.stations.map((s) => s.GroupId)).toEqual(['2']);
    runtime.clock.advance(UNIT_DESTINATIONS_TTL_MS + 1);
    await useUnitStatusStore.getState().fetchDestinationData('10');
    expect(getSetUnitStatusData).toHaveBeenCalledTimes(2);
  });

  it('sends online with EventId = outbox id, the status time and GPS from the location provider', async () => {
    setDataLocationProvider(() => ({ latitude: 39.7, longitude: -105, accuracy: 8 }));
    jest.mocked(saveUnitStatus).mockResolvedValue({ Id: '1', Status: 'success' } as never);
    const result = await useUnitStatusStore.getState().saveUnitStatus({ unitId: '10', statusType: '5', respondingTo: '5', respondingToType: 2, roles: [{ roleId: 'r1', userId: 'u1' }] });
    expect(result.outcome).toBe('sent');
    expect(saveUnitStatus).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        Id: '10',
        Type: '5',
        EventId: result.id,
        Latitude: '39.7',
        Longitude: '-105',
        Timestamp: new Date(runtime.clock.now()).toISOString(),
        Roles: [expect.objectContaining({ RoleId: 'r1', EventId: result.id })],
      })
    );
    await flush();
    expect(useUnitStatusStore.getState().queuedStatuses).toEqual({});
    expect(useUnitStatusStore.getState().currentStatusByUnit['10'].State).toBe('Responding');
  });

  it('queues offline, shows the pending status, and replays per unit in order (an older status never overtakes a newer one)', async () => {
    runtime.connectivity.setOnline(false);
    const first = await useUnitStatusStore.getState().saveUnitStatus({ unitId: '10', statusType: '5' });
    runtime.clock.advance(1000);
    const second = await useUnitStatusStore.getState().saveUnitStatus({ unitId: '10', statusType: '6' });
    expect([first.outcome, second.outcome]).toEqual(['queued', 'queued']);
    expect(selectPendingUnitStatus(useUnitStatusStore.getState(), '10')?.statusType).toBe('6');
    const rows = await runtime.rows();
    expect(rows.map((row) => [row.type, row.orderKey])).toEqual([
      [UNIT_STATUS_SET_EVENT, unitStatusOrderKey('10')],
      [UNIT_STATUS_SET_EVENT, unitStatusOrderKey('10')],
    ]);

    // The first replay fails on the network: the second must wait behind it, not jump ahead.
    jest
      .mocked(saveUnitStatus)
      .mockRejectedValueOnce(networkError())
      .mockResolvedValue({ Id: 'x', Status: 'success' } as never);
    runtime.connectivity.setOnline(true);
    const pass1 = await runtime.outbox.drain();
    expect(pass1.sent).toEqual([]);
    expect(saveUnitStatus).toHaveBeenCalledTimes(1);

    runtime.clock.advance(10 * 60_000);
    const pass2 = await runtime.outbox.drain();
    expect(pass2.sent).toEqual([first.id, second.id]);
    expect(jest.mocked(saveUnitStatus).mock.calls.map(([, body]) => body.Type)).toEqual(['5', '5', '6']);
  });

  it('a new status online first delivers the unit’s queued ones (drain filtered by order key)', async () => {
    runtime.connectivity.setOnline(false);
    await useUnitStatusStore.getState().saveUnitStatus({ unitId: '10', statusType: '5' });
    runtime.connectivity.setOnline(true);
    jest.mocked(saveUnitStatus).mockResolvedValue({ Id: 'x', Status: 'success' } as never);
    const result = await useUnitStatusStore.getState().saveUnitStatus({ unitId: '10', statusType: '6' });
    expect(result.outcome).toBe('sent');
    expect(jest.mocked(saveUnitStatus).mock.calls.map(([, body]) => body.Type)).toEqual(['5', '6']);
  });

  it('a server refusal dead-letters the status and marks it rejected; discard removes it', async () => {
    jest.mocked(saveUnitStatus).mockRejectedValue(httpError(400));
    const result = await useUnitStatusStore.getState().saveUnitStatus({ unitId: '10', statusType: '5' });
    expect(result.outcome).toBe('rejected');
    expect(useUnitStatusStore.getState().queuedStatuses[result.id].state).toBe('rejected');
    await runtime.outbox.discard(result.id, { confirmed: true });
    expect(useUnitStatusStore.getState().queuedStatuses[result.id]).toBeUndefined();
  });

  it('persists queued statuses so they survive an app kill, and resets on wipe', async () => {
    runtime.connectivity.setOnline(false);
    const result = await useUnitStatusStore.getState().saveUnitStatus({ unitId: '10', statusType: '5' });
    expect(persisted(runtime.kv, 'omni-unit-status-storage')?.state.queuedStatuses).toHaveProperty(result.id);
    await defaultResetRegistry.getStoreResets().get('data.unit-status')?.('logout');
    expect(useUnitStatusStore.getState().queuedStatuses).toEqual({});
  });
});
