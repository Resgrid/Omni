import { getAllGroups, getAllPersonnelInfos, getAllPersonnelStaffings, getAllPersonnelStatuses, getCurrentStaffing, getCurrentStatus, savePersonStaffing, savePersonStatus } from '@resgrid/api';
import { defaultResetRegistry } from '@resgrid/offline';

import { createDataTestRuntime, type DataTestRuntime, flush, httpError, networkError, ok, persisted } from '../../__tests__/helpers';
import { personnelStatusOrderKey, selectPendingPersonnelWrite, usePersonnelStatusStore } from '../personnel-status-store';
import { usePersonnelStore } from '../personnel-store';

jest.mock('@resgrid/api', () => ({
  ...jest.requireActual('@resgrid/api'),
  getAllPersonnelInfos: jest.fn(),
  getAllPersonnelStatuses: jest.fn(),
  getAllPersonnelStaffings: jest.fn(),
  getAllGroups: jest.fn(),
  getCurrentStatus: jest.fn(),
  getCurrentStaffing: jest.fn(),
  savePersonStatus: jest.fn(),
  savePersonStaffing: jest.fn(),
}));

let runtime: DataTestRuntime;

beforeEach(async () => {
  runtime = await createDataTestRuntime({ variant: 'responder' });
  jest.mocked(getAllPersonnelInfos).mockResolvedValue(ok([{ UserId: 'user-a', FirstName: 'Alex', LastName: 'Crew' }]) as never);
  jest.mocked(getAllPersonnelStatuses).mockResolvedValue(ok([{ Id: 2, Text: 'Responding' }]) as never);
  jest.mocked(getAllPersonnelStaffings).mockResolvedValue(ok([{ Id: 0, Text: 'Available' }]) as never);
  jest.mocked(getAllGroups).mockResolvedValue(ok([{ GroupId: '1', TypeId: '2', Name: 'Station 1' }]) as never);
  jest.mocked(getCurrentStatus).mockResolvedValue(ok({ UserId: 'user-a', StatusType: 2 }) as never);
  jest.mocked(getCurrentStaffing).mockResolvedValue(ok({ UserId: 'user-a', StaffingType: 0 }) as never);
  for (const name of ['data.personnel', 'data.personnel-status']) await defaultResetRegistry.getStoreResets().get(name)?.('logout');
});

describe('personnel store', () => {
  it('loads personnel, status and staffing options and groups; persists them', async () => {
    await usePersonnelStore.getState().init();
    const state = usePersonnelStore.getState();
    expect(state.personnel).toHaveLength(1);
    expect(state.statusOptions[0].Text).toBe('Responding');
    expect(state.staffingOptions).toHaveLength(1);
    expect(state.groups).toHaveLength(1);
    expect(persisted(runtime.kv, 'omni-personnel-storage')?.state).toHaveProperty('personnel');
  });

  it('records a per-slice error', async () => {
    jest.mocked(getAllPersonnelInfos).mockRejectedValue(httpError(500));
    await usePersonnelStore.getState().fetchPersonnel();
    expect(usePersonnelStore.getState().errors.personnel?.code).toBe('server');
  });
});

describe('personnel status and staffing', () => {
  it("fetches the signed-in user's own status and staffing", async () => {
    await usePersonnelStatusStore.getState().fetchCurrentStatus();
    await usePersonnelStatusStore.getState().fetchCurrentStaffing({ bypassCache: true });
    expect(getCurrentStatus).toHaveBeenCalledWith(expect.anything(), { userId: 'user-a' });
    expect(usePersonnelStatusStore.getState().currentStatus?.StatusType).toBe(2);
    expect(usePersonnelStatusStore.getState().currentStaffing?.StaffingType).toBe(0);
  });

  it('sends status online with EventId and refreshes own status', async () => {
    jest.mocked(savePersonStatus).mockResolvedValue({ Id: '1', Status: 'success' } as never);
    const result = await usePersonnelStatusStore.getState().setStatus({ statusType: '2', respondingTo: '5', respondingToType: 2 });
    expect(result.outcome).toBe('sent');
    expect(savePersonStatus).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ UserId: 'user-a', Type: '2', EventId: result.id }));
    await flush();
    expect(getCurrentStatus).toHaveBeenCalled();
    expect(usePersonnelStatusStore.getState().queuedWrites).toEqual({});
  });

  it('orders statuses per user and keeps the newest pending one visible offline', async () => {
    runtime.connectivity.setOnline(false);
    const a = await usePersonnelStatusStore.getState().setStatus({ statusType: '2' });
    const b = await usePersonnelStatusStore.getState().setStatus({ statusType: '3' });
    const onBehalf = await usePersonnelStatusStore.getState().setStatus({ statusType: '4', userId: 'user-z' });
    const staffing = await usePersonnelStatusStore.getState().setStaffing({ staffingType: '1' });
    expect(selectPendingPersonnelWrite(usePersonnelStatusStore.getState(), 'user-a', 'status')?.type).toBe('3');
    const rows = await runtime.rows();
    expect(rows.map((row) => row.orderKey)).toEqual([personnelStatusOrderKey('user-a'), personnelStatusOrderKey('user-a'), personnelStatusOrderKey('user-z'), 'personnel-staffing:user-a']);

    jest.mocked(savePersonStatus).mockResolvedValue({ Id: 'x', Status: 'success' } as never);
    jest.mocked(savePersonStaffing).mockResolvedValue({ Id: 'y', Status: 'success' } as never);
    runtime.connectivity.setOnline(true);
    const drain = await runtime.outbox.drain();
    expect(drain.sent).toEqual([a.id, b.id, onBehalf.id, staffing.id]);
    expect(jest.mocked(savePersonStatus).mock.calls.map(([, body]) => [body.UserId, body.Type])).toEqual([
      ['user-a', '2'],
      ['user-a', '3'],
      ['user-z', '4'],
    ]);
    expect(savePersonStaffing).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ Type: '1', EventId: staffing.id }));
  });

  it('a network failure keeps the status queued; a refusal marks it rejected', async () => {
    jest.mocked(savePersonStatus).mockRejectedValueOnce(networkError());
    const queued = await usePersonnelStatusStore.getState().setStatus({ statusType: '2' });
    expect(queued.outcome).toBe('queued');
    jest.mocked(savePersonStaffing).mockRejectedValue(httpError(403));
    const refused = await usePersonnelStatusStore.getState().setStaffing({ staffingType: '1' });
    expect(refused.outcome).toBe('rejected');
    expect(usePersonnelStatusStore.getState().queuedWrites[refused.id].state).toBe('rejected');
  });
});
