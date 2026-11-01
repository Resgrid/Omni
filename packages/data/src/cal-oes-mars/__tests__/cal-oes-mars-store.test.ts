import { buildCalOesMarsF42, getCalOesMarsAccess, getCalOesMarsQueue, validateCalOesMarsWorkItem } from '@resgrid/api';
import { defaultResetRegistry } from '@resgrid/offline';

import { createDataTestRuntime, failure, httpError, ok } from '../../__tests__/helpers';
import { selectMarsItemsForDeployment, useCalOesMarsStore } from '../cal-oes-mars-store';

jest.mock('@resgrid/api', () => ({
  ...jest.requireActual('@resgrid/api'),
  getCalOesMarsAccess: jest.fn(),
  getCalOesMarsQueue: jest.fn(),
  buildCalOesMarsF42: jest.fn(),
  validateCalOesMarsWorkItem: jest.fn(),
}));

const item = (Id: string, DeploymentId: string) => ({ Id, DeploymentId, RecordType: 1, LocalState: 1, ErrorCount: 0, WarningCount: 0, IsMine: true });

beforeEach(async () => {
  jest.clearAllMocks();
  await createDataTestRuntime({ variant: 'responder' });
  await defaultResetRegistry.getStoreResets().get('data.cal-oes-mars')?.('logout');
});

describe('CAL OES MARS store (online only, never persisted)', () => {
  it('loads access and the queue, and filters work items by deployment', async () => {
    jest.mocked(getCalOesMarsAccess).mockResolvedValue(ok({ Enabled: true, CanView: true, CanManage: false, CanSubmit: false }) as never);
    jest.mocked(getCalOesMarsQueue).mockResolvedValue(ok([item('w1', 'd1'), item('w2', 'd2')]) as never);
    expect((await useCalOesMarsStore.getState().loadAccess())?.Enabled).toBe(true);
    await useCalOesMarsStore.getState().loadQueue();
    expect(selectMarsItemsForDeployment(useCalOesMarsStore.getState(), 'd1').map((entry) => entry.Id)).toEqual(['w1']);
  });

  it('drafts an F-42 for the deployment and re-reads the queue', async () => {
    jest.mocked(buildCalOesMarsF42).mockResolvedValue(ok(item('w3', 'd1')) as never);
    jest.mocked(getCalOesMarsQueue).mockResolvedValue(ok([item('w3', 'd1')]) as never);
    expect(await useCalOesMarsStore.getState().draftF42('d1')).toBe(true);
    expect(buildCalOesMarsF42).toHaveBeenCalledWith(expect.anything(), { DeploymentId: 'd1' });
    expect(useCalOesMarsStore.getState().queue.map((entry) => entry.Id)).toEqual(['w3']);
  });

  it('keeps a refusal as a coded error, not a raw server message', async () => {
    jest.mocked(buildCalOesMarsF42).mockResolvedValue(failure() as never);
    expect(await useCalOesMarsStore.getState().draftF42('d1')).toBe(false);
    expect(useCalOesMarsStore.getState().actionError?.code).toBe('rejected');
    jest.mocked(validateCalOesMarsWorkItem).mockRejectedValue(httpError(403));
    expect(await useCalOesMarsStore.getState().validate('w1')).toBe(false);
    expect(useCalOesMarsStore.getState().actionError?.code).toBe('forbidden');
    expect(useCalOesMarsStore.getState().busy).toBe(false);
  });

  it('records the validation and whether the item is ready for the portal; a reset clears it', async () => {
    jest.mocked(validateCalOesMarsWorkItem).mockResolvedValue(ok({ WorkItemId: 'w1', ValidatedOn: '', Errors: [], Warnings: [], IsReadyForPortal: true }) as never);
    expect(await useCalOesMarsStore.getState().validate('w1')).toBe(true);
    expect(useCalOesMarsStore.getState().validation?.WorkItemId).toBe('w1');
    await defaultResetRegistry.getStoreResets().get('data.cal-oes-mars')?.('logout');
    expect(useCalOesMarsStore.getState().validation).toBeNull();
  });
});
