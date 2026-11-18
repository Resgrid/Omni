import { getCall, getCallExtraData, releaseFromCallWith } from '@resgrid/api';
import { defaultResetRegistry } from '@resgrid/offline';

import { createDataTestRuntime, httpError, notFound, ok } from '../../__tests__/helpers';
import { useCallDetailStore } from '../call-detail-store';

jest.mock('@resgrid/api', () => ({
  ...jest.requireActual('@resgrid/api'),
  getCall: jest.fn(),
  getCallExtraData: jest.fn(),
  releaseFromCallWith: jest.fn(),
}));

const releasedUnit = { Id: '45', Type: 'Unit', Name: 'MUG 1', ReleasedOn: '2026-11-16T10:32:00Z', ReleasedBy: 'Dana Dispatcher' };

beforeEach(async () => {
  await createDataTestRuntime({ variant: 'dispatch' });
  await defaultResetRegistry.getStoreResets().get('data.call-detail')?.('logout');
  jest.mocked(releaseFromCallWith).mockReset();
  // SAFETY: GetCall and GetCallExtraData envelopes with only the fields these tests read.
  jest.mocked(getCall).mockResolvedValue(ok({ CallId: '123', Name: 'Cardiac arrest' }) as never);
  // SAFETY: as above, after the release (the unit moved to ReleasedUnits).
  jest.mocked(getCallExtraData).mockResolvedValue(ok({ Dispatches: [{ Id: '46', Type: 'Unit', Name: 'Ambulance 2' }], ReleasedUnits: [releasedUnit] }) as never);
});

describe('releasing a resource from a call', () => {
  it('sends the release and re-reads the call, so the unit moves to the released list', async () => {
    // SAFETY: a ReleaseUnit envelope with the fields Core sends.
    jest.mocked(releaseFromCallWith).mockResolvedValue({ Status: 'updated', Data: { CallId: '123', UnitId: '45', ReleasedOn: '2026-11-16T10:32:00Z', StatusApplied: true } } as never);

    const outcome = await useCallDetailStore.getState().releaseFromCall({ kind: 'unit', callId: '123', resourceId: '45', notify: true });

    expect(outcome).toEqual({ releasedOn: '2026-11-16T10:32:00Z', statusApplied: true });
    expect(releaseFromCallWith).toHaveBeenCalledWith(expect.anything(), { kind: 'unit', callId: '123', resourceId: '45', notify: true });
    expect(getCallExtraData).toHaveBeenCalledWith(expect.anything(), { callId: '123' });
    expect(useCallDetailStore.getState().details['123'].extraData?.ReleasedUnits).toEqual([releasedUnit]);
    expect(useCallDetailStore.getState().writeError).toBeNull();
  });

  it('reports a kept status, and a call that no longer exists as null (not_found arrives as HTTP 200)', async () => {
    // SAFETY: a ReleasePersonnel envelope.
    jest.mocked(releaseFromCallWith).mockResolvedValue({ Status: 'updated', Data: { CallId: '123', UserId: 'u-1', ReleasedOn: '2026-11-16T10:40:00Z', StatusApplied: false } } as never);
    await expect(useCallDetailStore.getState().releaseFromCall({ kind: 'personnel', callId: '123', resourceId: 'u-1', notify: false })).resolves.toEqual({ releasedOn: '2026-11-16T10:40:00Z', statusApplied: false });

    jest.mocked(getCallExtraData).mockClear();
    // SAFETY: a not_found envelope.
    jest.mocked(releaseFromCallWith).mockResolvedValue(notFound(null) as never);
    await expect(useCallDetailStore.getState().releaseFromCall({ kind: 'unit', callId: '999', resourceId: '45', notify: true })).resolves.toBeNull();
    expect(getCallExtraData).not.toHaveBeenCalled();
  });

  it('rethrows a refusal and records it as the last write error', async () => {
    jest.mocked(releaseFromCallWith).mockRejectedValue(httpError(400));

    await expect(useCallDetailStore.getState().releaseFromCall({ kind: 'unit', callId: '123', resourceId: '45', notify: true })).rejects.toBeDefined();
    expect(useCallDetailStore.getState().writeError?.code).toBe('rejected');
    expect(useCallDetailStore.getState().isWriting).toBe(false);
  });
});
